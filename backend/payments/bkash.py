"""
bKash Tokenized Checkout (v1.2.0-beta) — https://developer.bka.sh

Flow:
  1. grant token  (app key/secret + username/password)  → id_token (cached)
  2. create       → paymentID + bkashURL (customer pays there with wallet number, OTP and PIN)
  3. bKash redirects the customer to our callbackURL with ?paymentID=…&status=success|failure|cancel
  4. execute      → transactionStatus "Completed" + trxID   (server side, never trusted from the browser)
     payment/status is used as a fallback if execute was already called.
"""

import time
from decimal import Decimal

import requests
from django.conf import settings
from django.core.cache import cache

from .errors import PaymentError

TOKEN_CACHE_KEY = "bkash:id_token"
TIMEOUT = 30


def enabled():
    return all([settings.BKASH_APP_KEY, settings.BKASH_APP_SECRET, settings.BKASH_USERNAME, settings.BKASH_PASSWORD])


def _url(path):
    return settings.BKASH_BASE_URL.rstrip("/") + path


def _post(path, body, headers):
    try:
        response = requests.post(_url(path), json=body, headers=headers, timeout=TIMEOUT)
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise PaymentError("bKash is not reachable right now. Please try again.") from exc


def _token():
    token = cache.get(TOKEN_CACHE_KEY)
    if token:
        return token
    data = _post(
        "/tokenized/checkout/token/grant",
        {"app_key": settings.BKASH_APP_KEY, "app_secret": settings.BKASH_APP_SECRET},
        {
            "username": settings.BKASH_USERNAME,
            "password": settings.BKASH_PASSWORD,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    token = data.get("id_token")
    if not token:
        raise PaymentError(data.get("statusMessage") or data.get("msg") or "bKash authorisation failed.")
    cache.set(TOKEN_CACHE_KEY, token, max(int(data.get("expires_in", 3600)) - 120, 60))
    return token


def _headers():
    return {
        "Authorization": _token(),
        "X-APP-Key": settings.BKASH_APP_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def create_payment(order, user, callback_url):
    """Returns (paymentID, bkashURL)."""
    data = _post(
        "/tokenized/checkout/create",
        {
            "mode": "0011",
            "payerReference": str(user.pk),
            "callbackURL": callback_url,
            "amount": f"{order.total_amount:.2f}",
            "currency": "BDT",
            "intent": "sale",
            "merchantInvoiceNumber": f"HB{order.pk}-{int(time.time())}",
        },
        _headers(),
    )
    if data.get("statusCode") != "0000" or not data.get("paymentID") or not data.get("bkashURL"):
        raise PaymentError(data.get("statusMessage") or "Could not start the bKash payment.")
    return data["paymentID"], data["bkashURL"]


FAILED_STATES = {"Failed", "Cancelled", "Expired", "Declined"}


def verify(payment_id, status_hint=None):
    """
    Returns (is_paid, is_failed, amount, trx_id).
    status_hint is bKash's ?status= from the redirect; "cancel"/"failure" means the
    customer did not pay, so nothing is executed.
    """
    if status_hint in ("cancel", "failure"):
        return False, True, None, None
    headers = _headers()
    data = _post("/tokenized/checkout/execute", {"paymentID": payment_id}, headers)
    if data.get("transactionStatus") != "Completed":
        # Already executed (e.g. page refresh) or still processing → ask for the status.
        data = _post("/tokenized/checkout/payment/status", {"paymentID": payment_id}, headers)
    state = data.get("transactionStatus")
    if state == "Completed":
        return True, False, Decimal(str(data.get("amount"))), data.get("trxID")
    if state in FAILED_STATES or (status_hint == "success" and state is None and data.get("statusCode") not in (None, "0000")):
        return False, True, None, None
    return False, False, None, None


def refund(payment_id, trx_id, amount, reason="Item out of stock"):
    data = _post(
        "/tokenized/checkout/payment/refund",
        {"paymentID": payment_id, "trxID": trx_id, "amount": f"{amount:.2f}", "sku": "order", "reason": reason},
        _headers(),
    )
    if not data.get("refundTrxID"):
        raise PaymentError(data.get("statusMessage") or "bKash refund failed.")
    return data["refundTrxID"]
