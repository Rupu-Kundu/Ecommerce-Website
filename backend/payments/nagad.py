"""
Nagad Merchant (Online Payment) API — sandbox: http://sandbox.mynagad.com:10080/remote-payment-gateway-1.0

Every request carries "sensitiveData" encrypted with Nagad's public key plus a
SHA256withRSA signature made with the merchant's private key. Nagad answers with
data encrypted for the merchant's public key.

Flow:
  1. initialize  /api/dfs/check-out/initialize/{merchantId}/{orderId} → paymentReferenceId + challenge
  2. complete    /api/dfs/check-out/complete/{paymentReferenceId}      → callBackUrl (customer pays there)
  3. Nagad redirects the customer to our merchantCallbackURL with ?payment_ref_id=…&status=…
  4. verify      /api/dfs/verify/payment/{paymentReferenceId}          → status "Success" (server side)
"""

import base64
import json
import secrets
from decimal import Decimal

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from django.conf import settings
from django.utils import timezone

from .errors import PaymentError

TIMEOUT = 30
BD_TZ = timezone.get_fixed_timezone(6 * 60)  # Nagad expects Bangladesh time (UTC+6)


def enabled():
    return all([settings.NAGAD_MERCHANT_ID, settings.NAGAD_MERCHANT_PRIVATE_KEY, settings.NAGAD_PG_PUBLIC_KEY])


def _pem(key, kind):
    key = key.strip()
    if "BEGIN" in key:
        return key.encode()
    return f"-----BEGIN {kind}-----\n{key}\n-----END {kind}-----".encode()


def _private_key():
    return serialization.load_pem_private_key(_pem(settings.NAGAD_MERCHANT_PRIVATE_KEY, "PRIVATE KEY"), password=None)


def _pg_public_key():
    return serialization.load_pem_public_key(_pem(settings.NAGAD_PG_PUBLIC_KEY, "PUBLIC KEY"))


def _json(data):
    return json.dumps(data, separators=(",", ":"))


def encrypt(data):
    return base64.b64encode(_pg_public_key().encrypt(_json(data).encode(), padding.PKCS1v15())).decode()


def sign(data):
    return base64.b64encode(_private_key().sign(_json(data).encode(), padding.PKCS1v15(), hashes.SHA256())).decode()


def decrypt(value):
    return json.loads(_private_key().decrypt(base64.b64decode(value), padding.PKCS1v15()))


def _headers(client_ip):
    return {
        "Content-Type": "application/json",
        "X-KM-Api-Version": "v-0.2.0",
        "X-KM-IP-V4": client_ip or "127.0.0.1",
        "X-KM-Client-Type": "PC_WEB",
    }


def _url(path):
    return settings.NAGAD_BASE_URL.rstrip("/") + path


def _call(method, path, client_ip, body=None):
    try:
        response = requests.request(method, _url(path), json=body, headers=_headers(client_ip), timeout=TIMEOUT)
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise PaymentError("Nagad is not reachable right now. Please try again.") from exc


def create_payment(order, user, callback_url, client_ip=None):
    """Returns (paymentReferenceId, callBackUrl)."""
    merchant_id = settings.NAGAD_MERCHANT_ID
    now = timezone.now().astimezone(BD_TZ).strftime("%Y%m%d%H%M%S")
    order_id = f"HB{order.pk}T{now}"  # unique per attempt, alphanumeric

    sensitive = {"merchantId": merchant_id, "datetime": now, "orderId": order_id, "challenge": secrets.token_hex(20)}
    body = {"dateTime": now, "sensitiveData": encrypt(sensitive), "signature": sign(sensitive)}
    if settings.NAGAD_MERCHANT_NUMBER:
        body["accountNumber"] = settings.NAGAD_MERCHANT_NUMBER
    init = _call("POST", f"/api/dfs/check-out/initialize/{merchant_id}/{order_id}", client_ip, body)
    if "sensitiveData" not in init:
        raise PaymentError(init.get("message") or "Could not start the Nagad payment.")
    plain = decrypt(init["sensitiveData"])
    reference = plain["paymentReferenceId"]

    sensitive2 = {
        "merchantId": merchant_id,
        "orderId": order_id,
        "currencyCode": "050",  # BDT
        "amount": f"{order.total_amount:.2f}",
        "challenge": plain["challenge"],
    }
    complete = _call("POST", f"/api/dfs/check-out/complete/{reference}", client_ip, {
        "sensitiveData": encrypt(sensitive2),
        "signature": sign(sensitive2),
        "merchantCallbackURL": callback_url,
        "additionalMerchantInfo": {"haatboxOrder": order.pk},
    })
    if complete.get("status") != "Success" or not complete.get("callBackUrl"):
        raise PaymentError(complete.get("message") or "Could not start the Nagad payment.")
    return reference, complete["callBackUrl"]


FAILED_STATES = {"Aborted", "Cancelled", "Failed", "InvalidRequest", "Fraud", "Rejected", "OrderNotFound"}


def verify(payment_ref_id, client_ip=None):
    """Returns (is_paid, is_failed, amount, issuer_reference)."""
    data = _call("GET", f"/api/dfs/verify/payment/{payment_ref_id}", client_ip)
    state = data.get("status")
    if state == "Success":
        return True, False, Decimal(str(data.get("amount"))), data.get("issuerPaymentRefNo")
    if state in FAILED_STATES:
        return False, True, None, None
    return False, False, None, None
