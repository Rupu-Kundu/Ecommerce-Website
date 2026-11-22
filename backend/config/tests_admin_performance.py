"""
Performance guard for the admin dashboard lists: the number of SQL queries must not grow
with the number of rows on the page (no N+1 queries).
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem
from payments.models import Payment
from products.models import Category, Product, Review

User = get_user_model()
PASSWORD = "StrongPass!2024"


class AdminListQueryCountTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        token = self.client.post("/api/auth/login/", {"username": "boss", "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.n = 0

    def add_rows(self, count):
        for _ in range(count):
            self.n += 1
            u = User.objects.create_user(f"c{self.n}", f"c{self.n}@example.com", PASSWORD)
            p = Product.objects.create(name=f"P{self.n}", category=self.cat, price=Decimal("10"), stock_quantity=5)
            Review.objects.create(product=p, user=u, rating=4)
            o = Order.objects.create(user=u, total_amount=Decimal("10"), payment_status="paid", status="paid")
            OrderItem.objects.create(order=o, product=p, product_name=p.name, price=Decimal("10"), quantity=1)
            Payment.objects.create(order=o, user=u, provider="demo", transaction_id=f"t{self.n}", amount=Decimal("10"), status="succeeded")

    def queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get(url)
        self.assertEqual(res.status_code, 200, url)
        return len(ctx.captured_queries)

    def test_query_count_does_not_grow_with_rows(self):
        urls = ["/api/admin/customers/", "/api/admin/payments/", "/api/orders/", "/api/products/", "/api/admin/stats/?days=30"]
        self.add_rows(3)
        few = {u: self.queries(u) for u in urls}
        self.add_rows(12)  # a full page (12 per page) and more
        many = {u: self.queries(u) for u in urls}
        self.assertEqual(few, many)
