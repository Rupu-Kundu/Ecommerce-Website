"""Cash on delivery: the order is confirmed without an online payment; cash is collected on delivery."""

from decimal import Decimal

from django.test import override_settings

from cart.models import CartItem
from orders.models import Order

from .models import Payment
from .tests import ADDRESS, PaymentTestBase, User, PASSWORD

COD_URL = "/api/payments/cod/"


class CashOnDeliveryTests(PaymentTestBase):
    def setUp(self):
        super().setUp()
        # replace the base order with a cash-on-delivery one
        self.order_id = self.client.post(
            "/api/orders/", {"shipping_method": "standard", "payment_method": "cod", "address": ADDRESS}, format="json"
        ).data["id"]

    def place(self):
        return self.client.post(COD_URL, {"order_id": self.order_id}, format="json")

    def test_config_lists_cod(self):
        cod = [m for m in self.client.get("/api/payments/config/").data["methods"] if m["code"] == "cod"][0]
        self.assertEqual((cod["label"], cod["available"], cod["demo"], cod["max_amount"]), ("Cash on delivery", True, False, "50000.00"))

    def test_place_order_reduces_stock_and_clears_cart(self):
        res = self.place()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["status"], res.data["payment_status"], res.data["amount_due"]), ("processing", "due", "2120.00"))
        order = self.order()
        self.assertEqual((order.payment_method, order.payment_status_display if False else order.get_payment_status_display()), ("cod", "Pay on delivery"))
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)
        self.assertFalse(CartItem.objects.filter(cart__user=self.user).exists())
        self.assertEqual(Payment.objects.get(order=order).provider, "cod")
        # listed in order history like a paid order
        self.assertIn(self.order_id, [o["id"] for o in self.client.get("/api/orders/").data["results"]])
        # placing twice does nothing
        self.assertEqual(self.place().status_code, 400)
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 3)

    def test_no_online_session_for_cod(self):
        self.assertEqual(self.client.post("/api/payments/session/", {"order_id": self.order_id}, format="json").status_code, 400)

    def test_card_order_cannot_be_placed_as_cod(self):
        card_id = self.client.post("/api/orders/", {"shipping_method": "standard", "address": ADDRESS}, format="json").data["id"]
        self.assertEqual(self.client.post(COD_URL, {"order_id": card_id}, format="json").status_code, 400)

    def test_other_customer_gets_404(self):
        User.objects.create_user("bob", "bob@example.com", PASSWORD)
        self.login("bob")
        self.assertEqual(self.place().status_code, 404)

    @override_settings(COD_MAX_AMOUNT=Decimal("1000"))
    def test_limit(self):
        res = self.place()
        self.assertEqual(res.status_code, 400)
        self.assertIn("up to ৳1,000", res.data["detail"])
        self.assertEqual(self.order().status, "cancelled")
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)

    @override_settings(PAYMENTS_ALLOW_COD=False)
    def test_disabled(self):
        res = self.client.post("/api/orders/", {"shipping_method": "standard", "payment_method": "cod", "address": ADDRESS}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("payment_method", res.data)

    def test_stock_ran_out(self):
        self.mouse.stock_quantity = 1
        self.mouse.save()
        res = self.place()
        self.assertEqual(res.status_code, 400)
        self.assertIn("Only 1", res.data["detail"])

    def admin(self):
        User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        self.login("boss")

    def status(self, value):
        return self.client.patch(f"/api/orders/{self.order_id}/status/", {"status": value}, format="json")

    def test_delivered_means_cash_collected(self):
        self.place()
        self.admin()
        self.assertEqual(self.status("shipped").status_code, 200)
        self.assertEqual(self.client.get("/api/admin/stats/").data["total_sales"], "0.00")  # not collected yet
        res = self.status("delivered")
        self.assertEqual((res.data["status"], res.data["payment_status"]), ("delivered", "paid"))
        self.assertEqual(Payment.objects.get(order_id=self.order_id).status, "succeeded")
        self.assertEqual(self.client.get("/api/admin/stats/").data["total_sales"], "2120.00")

    def test_cancel_returns_stock_and_cannot_reopen(self):
        self.place()
        self.admin()
        self.assertEqual(self.status("cancelled").status_code, 200)
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)
        self.assertEqual(Payment.objects.get(order_id=self.order_id).status, "failed")
        res = self.status("processing")
        self.assertEqual(res.status_code, 400)
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)
        self.assertEqual(self.status("cancelled").status_code, 200)  # cancelling again changes nothing
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)

    def test_buy_now_cod_keeps_cart(self):
        res = self.client.post("/api/orders/", {
            "shipping_method": "standard", "payment_method": "cod", "address": ADDRESS,
            "items": [{"product_id": self.lamp.pk, "quantity": 1}],
        }, format="json")
        self.order_id = res.data["id"]
        self.assertEqual(self.place().status_code, 201)
        self.assertTrue(CartItem.objects.filter(cart__user=self.user, product=self.mouse).exists())
        self.assertEqual(Order.objects.get(pk=self.order_id).payment_status, "due")
