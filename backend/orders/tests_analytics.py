"""Dashboard analytics: GET /api/admin/stats/?days=7|30|90 (period KPIs vs the previous period)."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from products.models import Category, Product

from .analytics import LOCAL_TZ, change_pct
from .models import Order, OrderItem

User = get_user_model()
PASSWORD = "StrongPass!2024"
URL = "/api/admin/stats/"


def local_today():
    return timezone.now().astimezone(LOCAL_TZ).date()


def at(days_ago, hour=12, minute=0):
    """An aware datetime `days_ago` local (Dhaka) days before today, at hour:minute local time."""
    return datetime.combine(local_today() - timedelta(days=days_ago), time(hour, minute), tzinfo=LOCAL_TZ)


class AnalyticsTests(APITestCase):
    def setUp(self):
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.mouse = Product.objects.create(name="Mouse", category=cat, price=Decimal("1000"), stock_quantity=50)
        self.lamp = Product.objects.create(name="Lamp", category=cat, price=Decimal("3000"), stock_quantity=50)
        self.alice = User.objects.create_user("alice", "alice@example.com", PASSWORD)
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        token = self.client.post("/api/auth/login/", {"username": "boss", "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def order(self, when, items, payment_status="paid", status="paid", method="card", user=None):
        total = sum(p.price * q for p, q in items)
        o = Order.objects.create(
            user=user or self.alice, subtotal=total, total_amount=total,
            status=status, payment_status=payment_status, payment_method=method,
        )
        for p, q in items:
            OrderItem.objects.create(order=o, product=p, product_name=p.name, price=p.price, quantity=q)
        Order.objects.filter(pk=o.pk).update(created_at=when)
        return o

    def get(self, **params):
        return self.client.get(URL, params)

    def test_days_validation_and_permissions(self):
        for bad in ("0", "14", "abc", "-7"):
            with self.subTest(days=bad):
                res = self.get(days=bad)
                self.assertEqual(res.status_code, 400)
                self.assertIn("7, 30, 90", res.data["days"])
        for days in (7, 30, 90):
            data = self.get(days=days).data
            self.assertEqual((data["period"]["days"], len(data["daily"])), (days, days))
            self.assertEqual(data["daily"][-1]["date"], local_today().isoformat())
        self.assertEqual(self.get().data["period"]["days"], 30)  # default
        self.client.credentials()
        self.assertEqual(self.get(days=7).status_code, 401)
        token = self.client.post("/api/auth/login/", {"username": "alice", "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.get(days=7).status_code, 403)

    def test_kpis_compare_with_previous_period(self):
        # current 7 days: 2 paid orders (৳1,000 + ৳3,000), 1 COD not delivered yet, 1 unpaid attempt
        self.order(at(0), [(self.mouse, 1)])
        self.order(at(6), [(self.lamp, 1)], method="bkash")
        self.order(at(2), [(self.mouse, 2)], payment_status="due", status="processing", method="cod")
        self.order(at(1), [(self.lamp, 5)], payment_status="pending", status="pending")
        # previous 7 days: 1 paid order ৳2,000 — and one older order that is outside both periods
        self.order(at(9), [(self.mouse, 2)])
        self.order(at(20), [(self.lamp, 3)])
        k = self.get(days=7).data["kpis"]
        self.assertEqual(k["revenue"], {"value": "4000.00", "previous": "2000.00", "change_pct": 100.0})
        self.assertEqual(k["orders"], {"value": 3, "previous": 1, "change_pct": 200.0})  # COD counts, unpaid doesn't
        self.assertEqual(k["paid_orders"]["value"], 2)
        self.assertEqual(k["average_order_value"], {"value": "2000.00", "previous": "2000.00", "change_pct": 0.0})
        # all-time numbers are still there and unchanged in meaning
        data = self.get(days=7).data
        self.assertEqual(data["total_sales"], "15000.00")  # all paid orders, any date

    def test_daily_series_uses_bangladesh_days(self):
        # 00:30 in Dhaka today is 18:30 *yesterday* in UTC — it must count for today
        self.order(at(0, hour=0, minute=30), [(self.mouse, 1)])
        self.order(at(3), [(self.lamp, 1)])
        self.order(at(3, hour=20), [(self.mouse, 1)], payment_status="due", status="processing", method="cod")
        daily = {d["date"]: d for d in self.get(days=7).data["daily"]}
        self.assertEqual(len(daily), 7)
        today, three = local_today().isoformat(), (local_today() - timedelta(days=3)).isoformat()
        self.assertEqual((daily[today]["revenue"], daily[today]["orders"]), ("1000.00", 1))
        self.assertEqual((daily[three]["revenue"], daily[three]["orders"]), ("3000.00", 2))  # COD counted as order, not revenue
        self.assertEqual(sum(d["orders"] for d in daily.values()), 3)
        self.assertEqual(sum(1 for d in daily.values() if d["orders"] == 0), 5)  # zero-filled days

    def test_breakdowns_and_top_products(self):
        self.order(at(1), [(self.lamp, 2), (self.mouse, 1)])                     # ৳7,000 card
        self.order(at(2), [(self.mouse, 3)], method="nagad", status="delivered")  # ৳3,000
        self.order(at(3), [(self.mouse, 1)], payment_status="due", status="processing", method="cod")
        self.order(at(4), [(self.lamp, 1)], payment_status="refunded", status="cancelled")
        data = self.get(days=7).data
        self.assertEqual(data["status_breakdown"], {"paid": 1, "processing": 1, "shipped": 0, "delivered": 1, "cancelled": 1})
        methods = {m["method"]: (m["orders"], m["revenue"]) for m in data["payment_methods"]}
        self.assertEqual(methods, {"card": (2, "7000.00"), "bkash": (0, "0.00"), "nagad": (1, "3000.00"), "cod": (1, "0.00")})
        top = [(t["name"], t["quantity"], t["revenue"]) for t in data["top_products"]]
        self.assertEqual(top, [("Lamp", 2, "6000.00"), ("Mouse", 4, "4000.00")])  # paid orders only

    def test_new_customers_and_products(self):
        bob = User.objects.create_user("bob", "bob@example.com", PASSWORD)
        old = User.objects.create_user("old", "old@example.com", PASSWORD)
        User.objects.filter(pk=old.pk).update(date_joined=at(10))
        User.objects.filter(pk=self.alice.pk).update(date_joined=at(12))
        Product.objects.filter(pk=self.lamp.pk).update(created_at=at(8))
        k = self.get(days=7).data["kpis"]
        self.assertEqual(k["new_customers"], {"value": 1, "previous": 2, "change_pct": -50.0})  # bob vs old+alice; admin excluded
        self.assertEqual(k["new_products"], {"value": 1, "previous": 1, "change_pct": 0.0})
        self.assertTrue(bob.pk)

    def test_empty_store(self):
        data = self.get(days=90).data
        self.assertEqual(data["kpis"]["revenue"], {"value": "0.00", "previous": "0.00", "change_pct": None})
        self.assertEqual(data["top_products"], [])
        self.assertTrue(all(d["orders"] == 0 and d["revenue"] == "0.00" for d in data["daily"]))

    def test_change_pct(self):
        self.assertEqual(change_pct(150, 100), 50.0)
        self.assertEqual(change_pct(0, 100), -100.0)
        self.assertIsNone(change_pct(5, 0))  # nothing to compare with
        self.assertEqual(change_pct(Decimal("1"), Decimal("3")), -66.7)
