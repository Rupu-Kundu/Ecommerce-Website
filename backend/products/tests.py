import io
import shutil
import tempfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, Product

User = get_user_model()
PASSWORD = "StrongPass!2024"
PRODUCTS_URL = "/api/products/"
CATEGORIES_URL = "/api/categories/"

TEMP_MEDIA = tempfile.mkdtemp()


def detail_url(pk):
    return f"{PRODUCTS_URL}{pk}/"


def make_image(name="test.png"):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class ProductTestBase(APITestCase):
    def setUp(self):
        self.phones = Category.objects.create(name="Phones", slug="phones")
        self.books = Category.objects.create(name="Books", slug="books")
        self.cheap = Product.objects.create(
            name="Basic Phone", description="simple", category=self.phones,
            price=Decimal("50.00"), stock_quantity=5,
        )
        self.pricey = Product.objects.create(
            name="Flagship Phone", description="camera", category=self.phones,
            price=Decimal("900.00"), stock_quantity=2,
        )
        self.book = Product.objects.create(
            name="Django Guide", description="learn web dev", category=self.books,
            price=Decimal("30.00"), stock_quantity=10,
        )
        self.hidden = Product.objects.create(
            name="Hidden Item", category=self.books, price=Decimal("10.00"),
            stock_quantity=0, is_available=False,
        )
        self.customer = User.objects.create_user("cust", "cust@example.com", PASSWORD)
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)

    def auth_as(self, username):
        access = self.client.post(
            "/api/auth/login/", {"username": username, "password": PASSWORD}
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    @staticmethod
    def names(res):
        return [p["name"] for p in res.data["results"]]


class PublicProductTests(ProductTestBase):
    def test_guest_can_list_products_paginated(self):
        res = self.client.get(PRODUCTS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for key in ("count", "next", "previous", "results"):
            self.assertIn(key, res.data)
        self.assertEqual(res.data["count"], 3)  # hidden product excluded

    def test_guest_does_not_see_unavailable_products(self):
        res = self.client.get(PRODUCTS_URL)
        self.assertNotIn("Hidden Item", self.names(res))
        self.assertEqual(self.client.get(detail_url(self.hidden.pk)).status_code, 404)

    def test_admin_sees_unavailable_products(self):
        self.auth_as("boss")
        res = self.client.get(PRODUCTS_URL)
        self.assertEqual(res.data["count"], 4)

    def test_guest_can_view_detail(self):
        res = self.client.get(detail_url(self.book.pk))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "Django Guide")
        self.assertEqual(res.data["category_name"], "Books")
        self.assertEqual(res.data["price"], "30.00")

    def test_detail_404_for_missing_product(self):
        self.assertEqual(self.client.get(detail_url(99999)).status_code, 404)

    def test_search_by_name_and_description(self):
        self.assertEqual(self.names(self.client.get(PRODUCTS_URL, {"search": "flagship"})), ["Flagship Phone"])
        self.assertEqual(self.names(self.client.get(PRODUCTS_URL, {"search": "web dev"})), ["Django Guide"])

    def test_filter_by_category_id_and_slug(self):
        by_id = self.client.get(PRODUCTS_URL, {"category": self.phones.pk})
        by_slug = self.client.get(PRODUCTS_URL, {"category": "phones"})
        self.assertEqual(sorted(self.names(by_id)), ["Basic Phone", "Flagship Phone"])
        self.assertEqual(sorted(self.names(by_slug)), ["Basic Phone", "Flagship Phone"])

    def test_sort_by_price(self):
        asc = self.names(self.client.get(PRODUCTS_URL, {"ordering": "price"}))
        desc = self.names(self.client.get(PRODUCTS_URL, {"ordering": "-price"}))
        self.assertEqual(asc, ["Django Guide", "Basic Phone", "Flagship Phone"])
        self.assertEqual(desc, list(reversed(asc)))

    def test_search_filter_and_sort_combined(self):
        res = self.client.get(PRODUCTS_URL, {"category": "phones", "search": "phone", "ordering": "-price"})
        self.assertEqual(self.names(res), ["Flagship Phone", "Basic Phone"])

    def test_pagination_page_size_12(self):
        for i in range(15):
            Product.objects.create(name=f"Extra {i}", category=self.books, price=Decimal("1.00"))
        page1 = self.client.get(PRODUCTS_URL)
        self.assertEqual(len(page1.data["results"]), 12)
        self.assertIsNotNone(page1.data["next"])
        page2 = self.client.get(PRODUCTS_URL, {"page": 2})
        self.assertEqual(len(page2.data["results"]), 18 - 12)

    def test_guest_can_list_categories(self):
        res = self.client.get(CATEGORIES_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([c["slug"] for c in res.data], ["books", "phones"])


class ProductWritePermissionTests(ProductTestBase):
    def payload(self):
        return {"name": "New Phone", "category": self.phones.pk, "price": "199.99", "stock_quantity": 7}

    def test_guest_cannot_create(self):
        self.assertEqual(self.client.post(PRODUCTS_URL, self.payload()).status_code, 401)

    def test_customer_cannot_create_update_delete(self):
        self.auth_as("cust")
        self.assertEqual(self.client.post(PRODUCTS_URL, self.payload()).status_code, 403)
        self.assertEqual(self.client.put(detail_url(self.book.pk), self.payload()).status_code, 403)
        self.assertEqual(self.client.delete(detail_url(self.book.pk)).status_code, 403)
        self.assertTrue(Product.objects.filter(pk=self.book.pk).exists())

    def test_admin_can_create(self):
        self.auth_as("boss")
        res = self.client.post(PRODUCTS_URL, self.payload())
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["category_name"], "Phones")
        self.assertTrue(Product.objects.filter(name="New Phone").exists())

    def test_admin_can_update_with_put(self):
        self.auth_as("boss")
        data = self.payload() | {"name": "Renamed Guide", "category": self.books.pk, "price": "35.00"}
        res = self.client.put(detail_url(self.book.pk), data)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.book.refresh_from_db()
        self.assertEqual(self.book.name, "Renamed Guide")
        self.assertEqual(self.book.price, Decimal("35.00"))

    def test_admin_can_delete(self):
        self.auth_as("boss")
        self.assertEqual(self.client.delete(detail_url(self.book.pk)).status_code, 204)
        self.assertFalse(Product.objects.filter(pk=self.book.pk).exists())

    def test_invalid_data_rejected(self):
        self.auth_as("boss")
        bad = self.payload() | {"price": "0", "stock_quantity": -1, "category": 99999}
        res = self.client.post(PRODUCTS_URL, bad)
        self.assertEqual(res.status_code, 400)
        for field in ("price", "stock_quantity", "category"):
            self.assertIn(field, res.data)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ProductImageUploadTests(ProductTestBase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def test_admin_can_upload_image_on_create(self):
        self.auth_as("boss")
        data = {"name": "Photo Phone", "category": self.phones.pk, "price": "120.00",
                "stock_quantity": 3, "image": make_image()}
        res = self.client.post(PRODUCTS_URL, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("/media/products/", res.data["image"])
        self.assertTrue(Product.objects.get(name="Photo Phone").image)
        # is_available was not sent → new product must default to available
        self.assertTrue(res.data["is_available"])

    def test_multipart_create_respects_explicit_unavailable(self):
        self.auth_as("boss")
        data = {"name": "Off Phone", "category": self.phones.pk, "price": "120.00",
                "is_available": "false", "image": make_image()}
        res = self.client.post(PRODUCTS_URL, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data["is_available"])

    def test_admin_can_add_image_with_patch(self):
        self.auth_as("boss")
        res = self.client.patch(detail_url(self.book.pk), {"image": make_image()}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("/media/products/", res.data["image"])
        # PATCH of only the image must not change availability
        self.assertTrue(res.data["is_available"])

    def test_non_image_file_rejected(self):
        self.auth_as("boss")
        fake = SimpleUploadedFile("notes.png", b"not an image", content_type="image/png")
        res = self.client.patch(detail_url(self.book.pk), {"image": fake}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertIn("image", res.data)


class SeedCommandTests(APITestCase):
    def test_seed_creates_records_and_is_idempotent(self):
        call_command("seed_products", verbosity=0)
        cats, prods = Category.objects.count(), Product.objects.count()
        self.assertGreater(cats, 0)
        self.assertGreater(prods, 0)
        call_command("seed_products", verbosity=0)
        self.assertEqual(Category.objects.count(), cats)
        self.assertEqual(Product.objects.count(), prods)


class PriceCurrencyMigrationTests(APITestCase):
    """The one-time USD → BDT migration uses a single fixed rate and rounds to whole taka."""

    def test_usd_to_bdt_conversion_and_reverse(self):
        import importlib

        from django.apps import apps

        migration = importlib.import_module("products.migrations.0002_convert_prices_usd_to_bdt")
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        a = Product.objects.create(name="A", category=cat, price=Decimal("49.99"))
        b = Product.objects.create(name="B", category=cat, price=Decimal("899.00"))

        migration.usd_to_bdt(apps, None)
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(migration.USD_TO_BDT, Decimal("120"))
        self.assertEqual(a.price, Decimal("5999"))     # 49.99 × 120 = 5998.8 → 5999
        self.assertEqual(b.price, Decimal("107880"))   # 899 × 120

        migration.bdt_to_usd(apps, None)
        b.refresh_from_db()
        self.assertEqual(b.price, Decimal("899.00"))
