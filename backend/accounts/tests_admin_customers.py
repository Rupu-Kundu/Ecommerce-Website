"""Admin customer management: GET /api/admin/customers/ (+ <id>/) and GET /api/orders/?customer=."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Address
from orders.models import Order
from products.models import Category, Product, Review

User = get_user_model()
PASSWORD = "StrongPass!2024"
URL = "/api/admin/customers/"


class AdminCustomerTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        self.rupa = User.objects.create_user("rupa", "rupa@example.com", PASSWORD, first_name="Rupa", last_name="Das", phone="01712345678")
        self.mina = User.objects.create_user("mina", "mina@shop.bd", PASSWORD, first_name="Mina")
        self.kabir = User.objects.create_user("kabir", "kabir@example.com", PASSWORD, is_active=False)
        User.objects.filter(pk=self.kabir.pk).update(date_joined=timezone.now() - timedelta(days=60))
        User.objects.filter(pk=self.mina.pk).update(date_joined=timezone.now() - timedelta(days=10))
        # rupa: 2 paid + 1 COD due + 1 cancelled COD + 1 unpaid attempt; mina: 1 paid
        for total, ps, st in [("2000", "paid", "delivered"), ("3000", "paid", "shipped"), ("1500", "due", "processing"),
                              ("800", "due", "cancelled"), ("9999", "pending", "pending")]:
            Order.objects.create(user=self.rupa, total_amount=Decimal(total), payment_status=ps, status=st, payment_method="cod" if ps == "due" else "card")
        self.mina_order = Order.objects.create(user=self.mina, total_amount=Decimal("700"), payment_status="paid", status="paid")
        Address.objects.create(user=self.rupa, recipient_name="Rupa Das", phone="+8801712345678", street_address="12 Lake Road", city="Dhaka", postal_code="1205", country="Bangladesh")
        cat = Category.objects.create(name="Books", slug="books")
        book = Product.objects.create(name="Book", category=cat, price=Decimal("100"), stock_quantity=3)
        Review.objects.create(product=book, user=self.rupa, rating=5)
        self.login("boss")

    def login(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def names(self, **params):
        return [c["username"] for c in self.client.get(URL, params).data["results"]]

    def test_admin_only(self):
        self.client.credentials()
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.assertEqual(self.client.get(f"{URL}{self.rupa.pk}/").status_code, 401)
        self.login("rupa")
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.get(f"{URL}{self.mina.pk}/").status_code, 403)

    def test_list_rows_summary_and_no_staff(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 3)  # the admin is not a customer
        rows = {c["username"]: c for c in res.data["results"]}
        self.assertNotIn("boss", rows)
        rupa = rows["rupa"]
        self.assertEqual((rupa["full_name"], rupa["phone"], rupa["orders_count"], rupa["total_spent"]), ("Rupa Das", "01712345678", 4, "5000.00"))
        self.assertIsNotNone(rupa["last_order_at"])
        self.assertEqual((rows["kabir"]["orders_count"], rows["kabir"]["total_spent"], rows["kabir"]["last_order_at"]), (0, "0.00", None))
        self.assertNotIn("password", rupa)
        self.assertEqual(res.data["summary"], {"total": 3, "active": 2, "with_orders": 2, "new_last_30_days": 2})

    def test_search_and_filters(self):
        self.assertEqual(self.names(search="RUPA"), ["rupa"])          # username/name, any case
        self.assertEqual(self.names(search="shop.bd"), ["mina"])       # email
        self.assertEqual(self.names(search="0171234"), ["rupa"])       # phone
        self.assertEqual(self.names(search="nobody"), [])
        self.assertEqual(self.names(status="inactive"), ["kabir"])
        self.assertEqual(sorted(self.names(status="active")), ["mina", "rupa"])
        self.assertEqual(self.names(orders="without"), ["kabir"])
        self.assertEqual(sorted(self.names(orders="with")), ["mina", "rupa"])
        self.assertEqual(sorted(self.names(joined="30")), ["mina", "rupa"])
        self.assertEqual(self.names(joined="7"), ["rupa"])
        self.assertEqual(sorted(self.names(status="bogus", orders="bogus", joined="5")), ["kabir", "mina", "rupa"])  # unknown values ignored

    def test_ordering(self):
        self.assertEqual(self.names(), ["rupa", "mina", "kabir"])                       # newest first (default)
        self.assertEqual(self.names(ordering="oldest"), ["kabir", "mina", "rupa"])
        self.assertEqual(self.names(ordering="spent"), ["rupa", "mina", "kabir"])
        self.assertEqual(self.names(ordering="orders"), ["rupa", "mina", "kabir"])
        self.assertEqual(self.names(ordering="recent_order")[-1], "kabir")              # no orders → last
        self.assertEqual(self.names(ordering="name"), ["kabir", "mina", "rupa"])

    def test_pagination(self):
        for i in range(14):
            User.objects.create_user(f"bulk{i:02}", f"bulk{i}@example.com", PASSWORD)
        first = self.client.get(URL).data
        self.assertEqual((first["count"], len(first["results"])), (17, 12))
        self.assertIsNotNone(first["next"])
        second = self.client.get(URL, {"page": 2}).data
        self.assertEqual(len(second["results"]), 5)
        self.assertEqual(self.client.get(URL, {"page": 9}).status_code, 404)

    def test_detail(self):
        res = self.client.get(f"{URL}{self.rupa.pk}/")
        self.assertEqual(res.status_code, 200)
        s = res.data["stats"]
        self.assertEqual((s["orders_count"], s["paid_orders"], s["total_spent"], s["average_order_value"]), (4, 2, "5000.00", "2500.00"))
        self.assertEqual((s["cancelled_orders"], s["open_orders"], s["cod_due"]), (1, 2, "1500.00"))
        self.assertEqual([a["city"] for a in res.data["addresses"]], ["Dhaka"])
        self.assertEqual((res.data["reviews_count"], res.data["chats_count"]), (1, 0))
        self.assertEqual(self.client.get(f"{URL}{self.admin.pk}/").status_code, 404)  # staff are not customers
        self.assertEqual(self.client.get(f"{URL}99999/").status_code, 404)
        empty = self.client.get(f"{URL}{self.kabir.pk}/").data["stats"]
        self.assertEqual((empty["orders_count"], empty["total_spent"], empty["last_order_at"]), (0, "0.00", None))

    def test_orders_filter_by_customer(self):
        ids = [o["id"] for o in self.client.get("/api/orders/", {"customer": self.mina.pk}).data["results"]]
        self.assertEqual(ids, [self.mina_order.pk])
        self.assertEqual(self.client.get("/api/orders/", {"customer": self.rupa.pk}).data["count"], 4)  # unpaid attempt hidden
        # customers can't use it to see other people's orders
        self.login("rupa")
        self.assertEqual(self.client.get("/api/orders/", {"customer": self.mina.pk}).data["count"], 4)  # still only her own
