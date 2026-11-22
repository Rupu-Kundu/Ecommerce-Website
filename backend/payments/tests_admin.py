"""Admin payment management: GET /api/admin/payments/ (+ <id>/) — read only, admins only."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem

from .models import Payment

User = get_user_model()
PASSWORD = "StrongPass!2024"
URL = "/api/admin/payments/"


class AdminPaymentTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)
        self.rupa = User.objects.create_user("rupa", "rupa@example.com", PASSWORD, first_name="Rupa")
        self.mina = User.objects.create_user("mina", "mina@shop.bd", PASSWORD)

        def order(user, total, method, ps="paid", st="paid"):
            o = Order.objects.create(user=user, total_amount=Decimal(total), subtotal=Decimal(total), payment_method=method, payment_status=ps, status=st)
            OrderItem.objects.create(order=o, product_name="Yoga Mat", price=Decimal(total), quantity=1)
            return o

        self.o1 = order(self.rupa, "2000", "card")
        self.o2 = order(self.mina, "3000", "bkash")
        self.o3 = order(self.rupa, "950", "cod", ps="due", st="processing")
        self.p_failed = Payment.objects.create(order=self.o1, user=self.rupa, provider="demo", transaction_id="demo_aaa111", amount=Decimal("2000"), status="failed")
        self.p1 = Payment.objects.create(order=self.o1, user=self.rupa, provider="stripe", transaction_id="cs_test_abc", amount=Decimal("2000"), status="succeeded")
        self.p2 = Payment.objects.create(order=self.o2, user=self.mina, provider="bkash", transaction_id="TRX-BK-77", amount=Decimal("3000"), status="refunded")
        self.p3 = Payment.objects.create(order=self.o3, user=self.rupa, provider="cod", transaction_id="cod_xyz", amount=Decimal("950"), status="pending")
        Payment.objects.filter(pk=self.p2.pk).update(created_at=timezone.now() - timedelta(days=40))
        self.login("boss")

    def login(self, username):
        token = self.client.post("/api/auth/login/", {"username": username, "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def ids(self, **params):
        return [p["id"] for p in self.client.get(URL, params).data["results"]]

    def test_admin_only_and_read_only(self):
        self.client.credentials()
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.login("rupa")
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.get(f"{URL}{self.p1.pk}/").status_code, 403)
        self.login("boss")
        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                self.assertEqual(getattr(self.client, method)(f"{URL}{self.p1.pk}/", {}, format="json").status_code, 405)
        self.assertEqual(self.client.post(URL, {}, format="json").status_code, 405)

    def test_list_rows_and_summary(self):
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 4)
        row = next(p for p in res.data["results"] if p["id"] == self.p1.pk)
        self.assertEqual((row["method"], row["method_label"], row["provider_label"], row["status_label"]), ("card", "Card", "Stripe", "Succeeded"))
        self.assertEqual((row["order"]["id"], row["customer"]["username"]), (self.o1.pk, "rupa"))
        s = res.data["summary"]
        self.assertEqual(s["total"], 4)
        self.assertEqual(s["succeeded"], {"count": 1, "amount": "2000.00"})
        self.assertEqual(s["refunded"], {"count": 1, "amount": "3000.00"})
        self.assertEqual(s["pending"], {"count": 1, "amount": "950.00"})
        self.assertEqual(s["success_rate"], 50.0)  # 1 succeeded of 2 finished (1 failed)

    def test_search_filters_sorting(self):
        self.assertEqual(self.ids(search="cs_test"), [self.p1.pk])                       # transaction id
        self.assertEqual(sorted(self.ids(search="mina@shop")), [self.p2.pk])             # customer email
        self.assertEqual(sorted(self.ids(search=f"#{self.o1.pk}")), sorted([self.p1.pk, self.p_failed.pk]))  # order number
        self.assertEqual(self.ids(status="failed"), [self.p_failed.pk])
        self.assertEqual(self.ids(method="cod"), [self.p3.pk])
        self.assertEqual(self.ids(provider="bkash"), [self.p2.pk])
        self.assertNotIn(self.p2.pk, self.ids(days="30"))                                # 40 days old
        self.assertEqual(sorted(self.ids(order=self.o1.pk)), sorted([self.p1.pk, self.p_failed.pk]))
        self.assertEqual(self.ids(ordering="amount_high")[0], self.p2.pk)
        self.assertEqual(self.ids(ordering="amount_low")[0], self.p3.pk)
        self.assertEqual(self.ids(ordering="oldest")[0], self.p2.pk)
        self.assertEqual(len(self.ids(status="nope", method="nope", provider="nope", days="5")), 4)  # unknown values ignored
        # the summary follows the other filters but always shows every status
        res = self.client.get(URL, {"status": "failed", "search": "rupa"}).data
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["summary"]["total"], 3)

    def test_pagination(self):
        for i in range(12):
            Payment.objects.create(order=self.o2, user=self.mina, provider="demo", transaction_id=f"demo_bulk_{i}", amount=Decimal("10"), status="failed")
        first = self.client.get(URL).data
        self.assertEqual((first["count"], len(first["results"])), (16, 12))
        self.assertEqual(len(self.client.get(URL, {"page": 2}).data["results"]), 4)

    def test_detail_with_order_customer_and_attempts(self):
        res = self.client.get(f"{URL}{self.p1.pk}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["transaction_id"], "cs_test_abc")
        self.assertEqual((res.data["customer"]["username"], res.data["customer"]["full_name"]), ("rupa", "Rupa"))
        self.assertEqual(res.data["order_detail"]["id"], self.o1.pk)
        self.assertEqual(res.data["order_detail"]["items"][0]["product_name"], "Yoga Mat")
        self.assertEqual([a["id"] for a in res.data["other_attempts"]], [self.p_failed.pk])
        self.assertEqual(self.client.get(f"{URL}999999/").status_code, 404)
