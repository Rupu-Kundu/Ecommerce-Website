import hashlib
import hmac
import json
import time
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from orders.models import Order
from products.models import Category, Product

from .models import Payment

User = get_user_model()
PASSWORD = "StrongPass!2024"
ADDRESS = {
    "recipient_name": "Rupa Das", "phone": "+880 1712-345678", "street_address": "12 Lake Road",
    "city": "Dhaka", "postal_code": "1205", "country": "Bangladesh",
}
DEMO = {"STRIPE_SECRET_KEY": "sk_test_your_key_here"}  # placeholder → demo gateway
STRIPE = {"STRIPE_SECRET_KEY": "sk_test_51FakeKeyForTests", "STRIPE_WEBHOOK_SECRET": "whsec_testsecret"}


class PaymentTestBase(APITestCase):
    def setUp(self):
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.mouse = Product.objects.create(name="Mouse", category=cat, price=Decimal("1000.00"), stock_quantity=5)
        self.lamp = Product.objects.create(name="Lamp", category=cat, price=Decimal("3000.00"), stock_quantity=2)
        self.user = User.objects.create_user("alice", "alice@example.com", PASSWORD)
        self.login("alice")
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, product=self.mouse, quantity=2)  # 2000 + ৳120 shipping
        self.order_id = self.client.post(
            "/api/orders/", {"shipping_method": "standard", "address": ADDRESS}, format="json"
        ).data["id"]

    def login(self, username):
        access = self.client.post("/api/auth/login/", {"username": username, "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def start(self):
        return self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json")

    def order(self):
        return Order.objects.get(pk=self.order_id)


@override_settings(**DEMO)
class DemoGatewayTests(PaymentTestBase):
    def complete(self, session_id, outcome):
        return self.client.post("/api/payments/demo/complete/", {"session_id": session_id, "outcome": outcome}, format="json")

    def test_config_reports_demo(self):
        res = self.client.get("/api/payments/config/")
        self.assertEqual(res.data["currency"], "BDT")
        self.assertEqual(
            [(m["code"], m["provider"], m["available"], m["demo"]) for m in res.data["methods"]],
            [("card", "demo", True, True), ("bkash", "demo", True, True), ("nagad", "demo", True, True)],
        )

    def test_start_payment_creates_pending_payment(self):
        res = self.start()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["provider"], "demo")
        self.assertIn("/payment/demo?session_id=demo_", res.data["checkout_url"])
        payment = Payment.objects.get()
        self.assertEqual((payment.status, payment.amount), ("pending", Decimal("2120.00")))

    def test_successful_payment_places_order(self):
        session_id = self.start().data["session_id"]
        res = self.complete(session_id, "success")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["payment"]["status"], "succeeded")
        self.assertEqual(res.data["order"]["status"], "paid")
        self.assertEqual(res.data["order"]["payment_status"], "paid")
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)          # stock reduced
        self.assertEqual(CartItem.objects.count(), 0)            # cart cleared
        self.assertEqual(self.client.get("/api/orders/").data["count"], 1)  # in history

    def test_duplicate_confirmation_does_not_duplicate(self):
        session_id = self.start().data["session_id"]
        self.complete(session_id, "success")
        self.complete(session_id, "success")
        self.client.post("/api/payments/confirm/", {"session_id": session_id}, format="json")
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)           # reduced only once
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(Payment.objects.filter(status="succeeded").count(), 1)

    def test_failed_payment(self):
        session_id = self.start().data["session_id"]
        res = self.complete(session_id, "failure")
        self.assertEqual(res.data["payment"]["status"], "failed")
        self.assertEqual(res.data["order"]["status"], "cancelled")
        self.assertIn("not been charged", res.data["detail"])
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)           # stock untouched
        self.assertEqual(CartItem.objects.count(), 1)            # cart kept so the user can retry
        # a failed payment cannot later be turned into a success
        self.assertEqual(self.complete(session_id, "success").data["payment"]["status"], "failed")

    def test_cancel_from_payment_page(self):
        self.start()
        res = self.client.post("/api/payments/cancel/", {"order_id": self.order_id}, format="json")
        self.assertEqual(res.data["payment"]["status"], "failed")
        self.assertEqual(self.order().status, Order.Status.CANCELLED)

    def test_stock_rechecked_when_starting_payment(self):
        Product.objects.filter(pk=self.mouse.pk).update(stock_quantity=1)
        res = self.start()
        self.assertEqual(res.status_code, 400)
        self.assertIn("Only 1", res.data["detail"])
        self.assertEqual(self.order().status, Order.Status.CANCELLED)

    def test_stock_rechecked_after_payment_refunds(self):
        session_id = self.start().data["session_id"]
        Product.objects.filter(pk=self.mouse.pk).update(stock_quantity=1)  # sold out meanwhile
        res = self.complete(session_id, "success")
        self.assertEqual(res.data["payment"]["status"], "refunded")
        self.assertEqual(res.data["order"]["status"], "cancelled")
        self.assertIn("refunded", res.data["detail"])
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 1)           # never negative

    def test_cannot_pay_or_see_someone_elses_order(self):
        session_id = self.start().data["session_id"]
        User.objects.create_user("mallory", "m@example.com", PASSWORD)
        self.login("mallory")
        self.assertEqual(self.start().status_code, 404)
        self.assertEqual(self.complete(session_id, "success").status_code, 404)
        self.assertEqual(self.client.post("/api/payments/confirm/", {"session_id": session_id}, format="json").status_code, 404)

    def test_paid_order_cannot_be_paid_again(self):
        self.complete(self.start().data["session_id"], "success")
        res = self.start()
        self.assertEqual(res.status_code, 400)

    def test_requires_login(self):
        self.client.credentials()
        self.assertEqual(self.start().status_code, 401)


def fake_session(**kw):
    defaults = dict(id="cs_test_123", url="https://checkout.stripe.com/c/pay/cs_test_123",
                    payment_status="unpaid", status="open", amount_total=212000, payment_intent="pi_123")
    defaults.update(kw)
    return SimpleNamespace(**defaults)


@override_settings(**STRIPE)
class StripeGatewayTests(PaymentTestBase):
    def start_stripe(self):
        with mock.patch("stripe.checkout.Session.create", return_value=fake_session()) as create:
            res = self.start()
        return res, create

    def test_config_reports_stripe_for_card(self):
        methods = {m["code"]: m["provider"] for m in self.client.get("/api/payments/config/").data["methods"]}
        self.assertEqual(methods, {"card": "stripe", "bkash": "demo", "nagad": "demo"})

    def test_stripe_payment_cannot_be_completed_on_demo_page(self):
        self.start_stripe()
        res = self.client.post("/api/payments/demo/complete/", {"session_id": "cs_test_123", "outcome": "success"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.order().payment_status, "pending")

    def test_checkout_session_in_bdt(self):
        res, create = self.start_stripe()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["checkout_url"], "https://checkout.stripe.com/c/pay/cs_test_123")
        kwargs = create.call_args.kwargs
        items = kwargs["line_items"]
        self.assertEqual(items[0]["price_data"]["currency"], "bdt")
        self.assertEqual(items[0]["price_data"]["unit_amount"], 100000)  # ৳1,000.00 in poisha
        self.assertEqual(items[0]["quantity"], 2)
        self.assertEqual(items[1]["price_data"]["unit_amount"], 12000)   # ৳120 shipping
        self.assertIn("{CHECKOUT_SESSION_ID}", kwargs["success_url"])
        self.assertEqual(kwargs["metadata"]["order_id"], str(self.order_id))
        self.assertEqual(Payment.objects.get().provider, "stripe")

    def test_confirm_paid(self):
        self.start_stripe()
        with mock.patch("stripe.checkout.Session.retrieve", return_value=fake_session(payment_status="paid", status="complete")):
            res = self.client.post("/api/payments/confirm/", {"session_id": "cs_test_123"}, format="json")
        self.assertEqual(res.data["payment"]["status"], "succeeded")
        self.assertEqual(self.order().payment_status, "paid")

    def test_confirm_not_paid_yet_and_expired(self):
        self.start_stripe()
        with mock.patch("stripe.checkout.Session.retrieve", return_value=fake_session()):
            res = self.client.post("/api/payments/confirm/", {"session_id": "cs_test_123"}, format="json")
        self.assertEqual(res.data["payment"]["status"], "pending")
        with mock.patch("stripe.checkout.Session.retrieve", return_value=fake_session(status="expired")):
            res = self.client.post("/api/payments/confirm/", {"session_id": "cs_test_123"}, format="json")
        self.assertEqual(res.data["payment"]["status"], "failed")

    def test_amount_mismatch_is_rejected(self):
        self.start_stripe()
        with mock.patch("stripe.checkout.Session.retrieve", return_value=fake_session(payment_status="paid", amount_total=100)):
            res = self.client.post("/api/payments/confirm/", {"session_id": "cs_test_123"}, format="json")
        self.assertEqual(res.data["payment"]["status"], "failed")
        self.assertNotEqual(self.order().payment_status, "paid")

    def test_refund_when_stock_gone_after_stripe_payment(self):
        self.start_stripe()
        Product.objects.filter(pk=self.mouse.pk).update(stock_quantity=0)
        with mock.patch("stripe.checkout.Session.retrieve", return_value=fake_session(payment_status="paid")), \
                mock.patch("stripe.Refund.create") as refund:
            res = self.client.post("/api/payments/confirm/", {"session_id": "cs_test_123"}, format="json")
        refund.assert_called_once_with(payment_intent="pi_123")
        self.assertEqual(res.data["payment"]["status"], "refunded")

    # ---- webhook ----
    def signed_post(self, event, secret="whsec_testsecret"):
        payload = json.dumps(event)
        ts = int(time.time())
        sig = hmac.new(secret.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
        self.client.credentials()  # Stripe sends no JWT
        return self.client.generic("POST", "/api/payments/webhook/", payload, content_type="application/json",
                                   HTTP_STRIPE_SIGNATURE=f"t={ts},v1={sig}")

    def event(self, event_type, **session):
        obj = {"id": "cs_test_123", "object": "checkout.session", "payment_status": "paid",
               "amount_total": 212000, "payment_intent": "pi_123"}
        obj.update(session)
        return {"id": "evt_1", "object": "event", "type": event_type, "data": {"object": obj}}

    def test_webhook_with_valid_signature_fulfils_once(self):
        self.start_stripe()
        res = self.signed_post(self.event("checkout.session.completed"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.order().payment_status, "paid")
        self.signed_post(self.event("checkout.session.completed"))  # Stripe retry
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)

    def test_webhook_rejects_bad_signature(self):
        self.start_stripe()
        res = self.signed_post(self.event("checkout.session.completed"), secret="whsec_wrong")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.order().payment_status, "pending")

    def test_webhook_expired_session_fails_payment(self):
        self.start_stripe()
        self.signed_post(self.event("checkout.session.expired", payment_status="unpaid"))
        self.assertEqual(self.order().status, Order.Status.CANCELLED)

    @override_settings(STRIPE_WEBHOOK_SECRET="whsec_your_secret_here")
    def test_webhook_disabled_without_secret(self):
        res = self.signed_post(self.event("checkout.session.completed"))
        self.assertEqual(res.status_code, 503)
