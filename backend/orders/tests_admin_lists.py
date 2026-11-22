"""Admin list filters added to the existing GET /api/orders/ and GET /api/products/."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Address
from products.models import Category, Product

from .models import Order

User = get_user_model()
PASSWORD = "StrongPass!2024"


class Base(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        self.rupa = User.objects.create_user("rupa", "rupa@example.com", PASSWORD, first_name="Rupa")
        self.mina = User.objects.create_user("mina", "mina@shop.bd", PASSWORD)
        addr = Address.objects.create(user=self.mina, recipient_name="Karim Mia", phone="+8801712345678", street_address="1 Road", city="Dhaka", postal_code="1205", country="BD")
        self.a = Order.objects.create(user=self.rupa, total_amount=Decimal("2000"), payment_method="card", payment_status="paid", status="paid")
        self.b = Order.objects.create(user=self.mina, address=addr, total_amount=Decimal("5000"), payment_method="cod", payment_status="due", status="processing")
        self.c = Order.objects.create(user=self.rupa, total_amount=Decimal("800"), payment_method="bkash", payment_status="refunded", status="cancelled")
        Order.objects.create(user=self.rupa, total_amount=Decimal("99"), payment_status="pending")  # unpaid attempt: never listed
        Order.objects.filter(pk=self.c.pk).update(created_at=timezone.now() - timedelta(days=45))
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.p_in = Product.objects.create(name="Kettle", category=cat, price=Decimal("10"), stock_quantity=20)
        self.p_low = Product.objects.create(name="Lamp", category=cat, price=Decimal("10"), stock_quantity=3)
        self.p_out = Product.objects.create(name="Mug", category=cat, price=Decimal("10"), stock_quantity=0)
        self.p_hidden = Product.objects.create(name="Old Fan", category=cat, price=Decimal("10"), stock_quantity=8, is_available=False)

    def login(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


class OrderFilterTests(Base):
    def ids(self, **params):
        return [o["id"] for o in self.client.get("/api/orders/", params).data["results"]]

    def test_admin_filters(self):
        self.login("boss")
        self.assertEqual(sorted(self.ids()), sorted([self.a.pk, self.b.pk, self.c.pk]))
        self.assertEqual(self.ids(search=f"#{self.b.pk}"), [self.b.pk])               # order number
        self.assertEqual(self.ids(search="mina@shop"), [self.b.pk])                  # customer email
        self.assertEqual(self.ids(search="karim"), [self.b.pk])                      # recipient name
        self.assertEqual(sorted(self.ids(search="rupa")), sorted([self.a.pk, self.c.pk]))
        self.assertEqual(self.ids(payment_method="cod"), [self.b.pk])
        self.assertEqual(self.ids(payment_status="refunded"), [self.c.pk])
        self.assertEqual(sorted(self.ids(payment_status="pending")), sorted([self.a.pk, self.b.pk, self.c.pk]))  # not a placed status → ignored
        self.assertNotIn(self.c.pk, self.ids(days="30"))
        self.assertEqual(self.ids(ordering="total_high"), [self.b.pk, self.a.pk, self.c.pk])
        self.assertEqual(self.ids(ordering="total_low"), [self.c.pk, self.a.pk, self.b.pk])
        self.assertEqual(self.ids(ordering="oldest")[0], self.c.pk)
        self.assertEqual(self.ids(status="processing", payment_method="cod"), [self.b.pk])

    def test_customers_cannot_use_admin_filters(self):
        self.login("rupa")
        mine = sorted(self.ids())
        self.assertEqual(mine, sorted([self.a.pk, self.c.pk]))
        self.assertEqual(sorted(self.ids(search="mina")), mine)   # ignored: still only her own orders
        self.assertEqual(sorted(self.ids(customer=self.mina.pk)), mine)


class ProductFilterTests(Base):
    def names(self, **params):
        return sorted(p["name"] for p in self.client.get("/api/products/", params).data["results"])

    def test_admin_availability_and_stock_filters(self):
        self.login("boss")
        self.assertEqual(self.names(available="false"), ["Old Fan"])
        self.assertEqual(self.names(available="true"), ["Kettle", "Lamp", "Mug"])
        self.assertEqual(self.names(stock="out"), ["Mug"])
        self.assertEqual(self.names(stock="low"), ["Lamp"])
        self.assertEqual(self.names(stock="in"), ["Kettle", "Old Fan"])
        self.assertEqual(self.names(stock="in", available="true"), ["Kettle"])
        stats = self.client.get("/api/admin/stats/").data
        self.assertEqual((stats["hidden_product_count"], stats["out_of_stock_count"]), (1, 1))

    def test_guests_never_see_hidden_products(self):
        self.assertEqual(self.names(available="false"), ["Kettle", "Lamp", "Mug"])  # filter ignored, hidden stays hidden
        self.assertEqual(self.names(stock="out"), ["Kettle", "Lamp", "Mug"])
