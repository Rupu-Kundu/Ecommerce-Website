"""bKash, Nagad, payment-method choice and "Buy now" tests."""

import base64
import json
from decimal import Decimal
from unittest import mock

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from django.core.cache import cache
from django.test import override_settings

from cart.models import CartItem
from orders.models import Order
from products.models import Product

from .models import Payment
from .tests import ADDRESS, PaymentTestBase


def order_payload(**extra):
    data = {"shipping_method": "standard", "address": ADDRESS}
    data.update(extra)
    return data


class FakeResponse:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


# ======================= payment methods & Buy now (demo gateway) =======================

class PaymentMethodTests(PaymentTestBase):
    def test_order_stores_payment_method(self):
        res = self.client.post("/api/orders/", order_payload(payment_method="bkash"), format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data["payment_method"], res.data["payment_method_label"]), ("bkash", "bKash"))

    def test_unknown_payment_method_rejected(self):
        res = self.client.post("/api/orders/", order_payload(payment_method="paypal"), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("payment_method", res.data)

    def test_demo_wallet_payment_flow(self):
        for method in ("bkash", "nagad"):
            with self.subTest(method=method):
                Product.objects.filter(pk=self.mouse.pk).update(stock_quantity=5)
                CartItem.objects.get_or_create(cart=self.cart, product=self.mouse, defaults={"quantity": 2})
                order_id = self.client.post("/api/orders/", order_payload(payment_method=method), format="json").data["id"]
                session = self.client.post("/api/payments/session/", {"order_id": order_id}, format="json").data
                self.assertEqual(session["provider"], "demo")
                res = self.client.post("/api/payments/demo/complete/", {"session_id": session["session_id"], "outcome": "success"}, format="json")
                self.assertEqual(res.data["order"]["payment_status"], "paid")
                self.assertEqual(res.data["order"]["payment_method"], method)

    @override_settings(PAYMENTS_ALLOW_DEMO=False)
    def test_without_credentials_and_demo_off_methods_are_unavailable(self):
        methods = self.client.get("/api/payments/config/").data["methods"]
        online = [m for m in methods if m["code"] != "cod"]
        self.assertTrue(all(not m["available"] for m in online))
        self.assertTrue([m for m in methods if m["code"] == "cod"][0]["available"])  # cash needs no gateway
        res = self.client.post("/api/orders/", order_payload(payment_method="bkash"), format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("not available", str(res.data["payment_method"]))
        # an existing demo session can no longer be completed either
        payment = Payment.objects.create(order_id=self.order_id, user=self.user, provider="demo", transaction_id="demo_x", amount=Decimal("1"))
        res = self.client.post("/api/payments/demo/complete/", {"session_id": payment.transaction_id, "outcome": "success"}, format="json")
        self.assertEqual(res.status_code, 403)


class BuyNowTests(PaymentTestBase):
    def buy_now(self, product, qty=1, **extra):
        return self.client.post(
            "/api/orders/", order_payload(items=[{"product_id": product.pk, "quantity": qty}], **extra), format="json"
        )

    def test_buy_now_orders_only_that_product_and_keeps_cart(self):
        res = self.buy_now(self.lamp, 2)  # cart still holds 2 × mouse
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data["from_cart"])
        self.assertEqual([(i["product_name"], i["quantity"]) for i in res.data["items"]], [("Lamp", 2)])
        self.assertEqual(res.data["total_amount"], "6000.00")  # 2 × 3000, free shipping
        session = self.client.post("/api/payments/session/", {"order_id": res.data["id"]}, format="json").data
        self.client.post("/api/payments/demo/complete/", {"session_id": session["session_id"], "outcome": "success"}, format="json")
        self.lamp.refresh_from_db()
        self.assertEqual(self.lamp.stock_quantity, 0)
        self.assertEqual(list(CartItem.objects.values_list("product__name", "quantity")), [("Mouse", 2)])  # cart untouched

    def test_cart_checkout_still_clears_cart(self):
        session = self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json").data
        self.client.post("/api/payments/demo/complete/", {"session_id": session["session_id"], "outcome": "success"}, format="json")
        self.assertEqual(CartItem.objects.count(), 0)

    def test_buy_now_checks_stock_and_availability(self):
        self.assertEqual(self.buy_now(self.lamp, 3).status_code, 400)
        self.lamp.is_available = False
        self.lamp.save()
        res = self.buy_now(self.lamp, 1)
        self.assertEqual(res.status_code, 400)
        self.assertIn("no longer available", res.data["detail"])
        res = self.client.post("/api/orders/", order_payload(items=[{"product_id": 99999, "quantity": 1}]), format="json")
        self.assertEqual(res.status_code, 400)

    def test_buy_now_validation(self):
        bad = [
            [{"product_id": self.mouse.pk, "quantity": 0}],
            [{"product_id": self.mouse.pk, "quantity": 1}, {"product_id": self.lamp.pk, "quantity": 1}],
            [],
        ]
        for items in bad:
            with self.subTest(items=items):
                self.assertEqual(self.client.post("/api/orders/", order_payload(items=items), format="json").status_code, 400)


# ======================= bKash Tokenized Checkout =======================

BKASH = {
    "BKASH_APP_KEY": "app-key", "BKASH_APP_SECRET": "app-secret",
    "BKASH_USERNAME": "sandboxTokenizedUser", "BKASH_PASSWORD": "sandbox-pass",
    "BKASH_BASE_URL": "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
}


class FakeBkash:
    """Minimal fake of the bKash tokenized API, recording every call."""

    def __init__(self, execute_status="Completed", amount="2120.00"):
        self.calls = []
        self.execute_status = execute_status
        self.amount = amount

    def post(self, url, json=None, headers=None, timeout=None):
        path = url.split("/v1.2.0-beta")[1]
        self.calls.append((path, json, headers))
        if path == "/tokenized/checkout/token/grant":
            return FakeResponse({"id_token": "tok-1", "expires_in": 3600, "statusCode": "0000"})
        if path == "/tokenized/checkout/create":
            return FakeResponse({"statusCode": "0000", "paymentID": "TR0011abc", "bkashURL": "https://sandbox.payment.bkash.com/?paymentId=TR0011abc"})
        if path in ("/tokenized/checkout/execute", "/tokenized/checkout/payment/status"):
            return FakeResponse({"statusCode": "0000", "transactionStatus": self.execute_status, "amount": self.amount, "trxID": "BK123"})
        if path == "/tokenized/checkout/payment/refund":
            return FakeResponse({"statusCode": "0000", "refundTrxID": "RF1"})
        raise AssertionError(f"unexpected call {path}")

    def paths(self):
        return [c[0] for c in self.calls]


@override_settings(**BKASH)
class BkashTests(PaymentTestBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        Order.objects.filter(pk=self.order_id).update(payment_method="bkash")

    def start(self, fake):
        with mock.patch("payments.bkash.requests.post", side_effect=fake.post):
            return self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json")

    def confirm(self, fake, status="success"):
        with mock.patch("payments.bkash.requests.post", side_effect=fake.post):
            return self.client.post("/api/payments/confirm/", {"session_id": "TR0011abc", "status": status}, format="json")

    def test_config_reports_bkash(self):
        methods = {m["code"]: m["provider"] for m in self.client.get("/api/payments/config/").data["methods"]}
        self.assertEqual(methods["bkash"], "bkash")

    def test_create_payment(self):
        fake = FakeBkash()
        res = self.start(fake)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["provider"], "bkash")
        self.assertEqual(res.data["checkout_url"], "https://sandbox.payment.bkash.com/?paymentId=TR0011abc")
        grant, create = fake.calls
        self.assertEqual(grant[2]["username"], "sandboxTokenizedUser")
        self.assertEqual(grant[1], {"app_key": "app-key", "app_secret": "app-secret"})
        body, headers = create[1], create[2]
        self.assertEqual((headers["Authorization"], headers["X-APP-Key"]), ("tok-1", "app-key"))
        self.assertEqual((body["amount"], body["currency"], body["intent"], body["mode"]), ("2120.00", "BDT", "sale", "0011"))
        self.assertTrue(body["callbackURL"].endswith("/payment/success/bkash"))
        self.assertEqual(Payment.objects.get().transaction_id, "TR0011abc")

    def test_token_is_cached(self):
        fake = FakeBkash()
        self.start(fake)
        self.confirm(fake)
        self.assertEqual(fake.paths().count("/tokenized/checkout/token/grant"), 1)

    def test_successful_payment_is_executed_and_fulfilled(self):
        fake = FakeBkash()
        self.start(fake)
        res = self.confirm(fake)
        self.assertEqual(res.data["payment"]["status"], "succeeded")
        self.assertEqual(res.data["order"]["payment_status"], "paid")
        self.assertIn("/tokenized/checkout/execute", fake.paths())
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)

    def test_cancelled_payment_is_not_executed(self):
        fake = FakeBkash()
        self.start(fake)
        res = self.confirm(fake, status="cancel")
        self.assertEqual(res.data["payment"]["status"], "failed")
        self.assertNotIn("/tokenized/checkout/execute", fake.paths())

    def test_amount_mismatch_rejected(self):
        fake = FakeBkash(amount="10.00")
        self.start(fake)
        self.assertEqual(self.confirm(fake).data["payment"]["status"], "failed")
        self.assertEqual(Order.objects.get(pk=self.order_id).payment_status, "pending")

    def test_refund_when_stock_gone(self):
        fake = FakeBkash()
        self.start(fake)
        Product.objects.filter(pk=self.mouse.pk).update(stock_quantity=0)
        res = self.confirm(fake)
        self.assertEqual(res.data["payment"]["status"], "refunded")
        self.assertIn("bKash account", res.data["detail"])
        refund = [c for c in fake.calls if c[0] == "/tokenized/checkout/payment/refund"][0]
        self.assertEqual((refund[1]["paymentID"], refund[1]["trxID"], refund[1]["amount"]), ("TR0011abc", "BK123", "2120.00"))

    def test_bkash_error_message_shown(self):
        def failing(url, json=None, headers=None, timeout=None):
            if url.endswith("/token/grant"):
                return FakeResponse({"statusCode": "2079", "statusMessage": "Invalid app token"})
            raise AssertionError
        with mock.patch("payments.bkash.requests.post", side_effect=failing):
            res = self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "Invalid app token")


# ======================= Nagad Merchant API =======================

def make_keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    public_der = private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return private, private_pem, base64.b64encode(public_der).decode()


MERCHANT_PRIVATE, MERCHANT_PRIVATE_PEM, _ = make_keys()
PG_PRIVATE, _, PG_PUBLIC_B64 = make_keys()
NAGAD = {
    "NAGAD_MERCHANT_ID": "683002007104225",
    "NAGAD_MERCHANT_PRIVATE_KEY": MERCHANT_PRIVATE_PEM,  # PEM format
    "NAGAD_PG_PUBLIC_KEY": PG_PUBLIC_B64,                # raw base64 format
}


class FakeNagad:
    """Plays Nagad: decrypts with its own key, checks the merchant signature, answers encrypted."""

    def __init__(self, verify_status="Success", amount="2120.00"):
        self.calls = []
        self.verify_status = verify_status
        self.amount = amount

    @staticmethod
    def open_sensitive(body):
        plain = PG_PRIVATE.decrypt(base64.b64decode(body["sensitiveData"]), padding.PKCS1v15())
        MERCHANT_PRIVATE.public_key().verify(base64.b64decode(body["signature"]), plain, padding.PKCS1v15(), hashes.SHA256())
        return json.loads(plain)

    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append((method, url, json, headers))
        if "/check-out/initialize/" in url:
            data = self.open_sensitive(json)
            assert data["merchantId"] == NAGAD["NAGAD_MERCHANT_ID"]
            assert url.endswith(f"/{data['merchantId']}/{data['orderId']}")
            reply = {"paymentReferenceId": "MDExREF", "challenge": "srv-challenge"}
            enc = MERCHANT_PRIVATE.public_key().encrypt(__import__("json").dumps(reply).encode(), padding.PKCS1v15())
            return FakeResponse({"sensitiveData": base64.b64encode(enc).decode(), "signature": "x"})
        if "/check-out/complete/MDExREF" in url:
            data = self.open_sensitive(json)
            self.completed = data
            return FakeResponse({"status": "Success", "callBackUrl": "https://sandbox.mynagad.com/check-out/MDExREF"})
        if "/verify/payment/MDExREF" in url:
            return FakeResponse({"status": self.verify_status, "amount": self.amount, "issuerPaymentRefNo": "NG777"})
        raise AssertionError(url)


@override_settings(**NAGAD)
class NagadTests(PaymentTestBase):
    def setUp(self):
        super().setUp()
        Order.objects.filter(pk=self.order_id).update(payment_method="nagad")

    def run_with(self, fake, method, url, data):
        with mock.patch("payments.nagad.requests.request", side_effect=fake.request):
            return getattr(self.client, method)(url, data, format="json")

    def test_create_payment_with_encryption_and_signature(self):
        fake = FakeNagad()
        res = self.run_with(fake, "post", "/api/payments/session/", {"order_id": self.order_id})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["provider"], "nagad")
        self.assertEqual(res.data["checkout_url"], "https://sandbox.mynagad.com/check-out/MDExREF")
        self.assertEqual(fake.completed["amount"], "2120.00")
        self.assertEqual(fake.completed["currencyCode"], "050")
        self.assertEqual(fake.completed["challenge"], "srv-challenge")
        self.assertEqual(fake.calls[0][3]["X-KM-Api-Version"], "v-0.2.0")
        self.assertTrue(fake.calls[1][2]["merchantCallbackURL"].endswith("/payment/success/nagad"))
        self.assertEqual(Payment.objects.get().transaction_id, "MDExREF")

    def test_verify_success(self):
        fake = FakeNagad()
        self.run_with(fake, "post", "/api/payments/session/", {"order_id": self.order_id})
        res = self.run_with(fake, "post", "/api/payments/confirm/", {"session_id": "MDExREF"})
        self.assertEqual(res.data["payment"]["status"], "succeeded")
        self.assertEqual(Order.objects.get(pk=self.order_id).payment_status, "paid")

    def test_verify_aborted_and_pending(self):
        fake = FakeNagad(verify_status="Initiated")
        self.run_with(fake, "post", "/api/payments/session/", {"order_id": self.order_id})
        self.assertEqual(self.run_with(fake, "post", "/api/payments/confirm/", {"session_id": "MDExREF"}).data["payment"]["status"], "pending")
        fake.verify_status = "Aborted"
        self.assertEqual(self.run_with(fake, "post", "/api/payments/confirm/", {"session_id": "MDExREF"}).data["payment"]["status"], "failed")

    def test_nagad_unreachable(self):
        import requests

        with mock.patch("payments.nagad.requests.request", side_effect=requests.ConnectionError):
            res = self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("not reachable", res.data["detail"])
