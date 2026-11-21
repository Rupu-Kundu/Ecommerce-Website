"""Ratings & reviews, product gallery photos, brand and product details (specifications)."""

import json
import os
import shutil
import tempfile
from decimal import Decimal

from django.test import override_settings
from rest_framework.test import APITestCase

from orders.models import Order, OrderItem

from .models import MAX_EXTRA_IMAGES, Product, ProductImage, Review
from .tests import PRODUCTS_URL, ProductTestBase, detail_url, make_image

TEMP_MEDIA = tempfile.mkdtemp()


def reviews_url(pk):
    return f"{PRODUCTS_URL}{pk}/reviews/"


class ReviewTests(ProductTestBase):
    def test_guest_reads_but_cannot_review(self):
        res = self.client.get(reviews_url(self.book.pk))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["summary"], {"average": None, "count": 0, "distribution": {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}})
        self.assertIsNone(res.data["my_review"])
        self.assertEqual(self.client.post(reviews_url(self.book.pk), {"rating": 5}).status_code, 401)

    def test_one_review_per_customer_created_then_updated(self):
        self.auth_as("cust")
        res = self.client.post(reviews_url(self.book.pk), {"rating": 4, "comment": "Clear and practical."})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual((res.data["author"], res.data["is_mine"], res.data["verified_purchase"]), ("cust", True, False))
        res = self.client.post(reviews_url(self.book.pk), {"rating": 2, "comment": "Changed my mind"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Review.objects.filter(product=self.book).count(), 1)
        data = self.client.get(reviews_url(self.book.pk)).data
        self.assertEqual((data["summary"]["average"], data["summary"]["count"], data["summary"]["distribution"]["2"]), (2.0, 1, 1))
        self.assertEqual(data["my_review"]["rating"], 2)

    def test_validation(self):
        self.auth_as("cust")
        for body in ({"rating": 0}, {"rating": 6}, {"rating": "x"}, {}, {"rating": 5, "comment": "x" * 1001}):
            with self.subTest(body=str(body)[:30]):
                self.assertEqual(self.client.post(reviews_url(self.book.pk), body).status_code, 400)
        self.assertEqual(self.client.post(reviews_url(self.hidden.pk), {"rating": 5}).status_code, 404)  # not for sale

    def test_verified_purchase_badge(self):
        order = Order.objects.create(user=self.customer, total_amount=Decimal("30"), status="delivered", payment_status="paid")
        OrderItem.objects.create(order=order, product=self.book, product_name="Django Guide", price=Decimal("30"), quantity=1)
        unpaid = Order.objects.create(user=self.admin, total_amount=Decimal("30"), payment_status="pending")
        OrderItem.objects.create(order=unpaid, product=self.book, product_name="Django Guide", price=Decimal("30"), quantity=1)
        Review.objects.create(product=self.book, user=self.customer, rating=5)
        Review.objects.create(product=self.book, user=self.admin, rating=3)
        flags = {r["author"]: r["verified_purchase"] for r in self.client.get(reviews_url(self.book.pk)).data["results"]}
        self.assertEqual(flags, {"cust": True, "boss": False})

    def test_delete_own_or_admin(self):
        mine = Review.objects.create(product=self.book, user=self.customer, rating=5)
        theirs = Review.objects.create(product=self.book, user=self.admin, rating=1)
        self.auth_as("cust")
        self.assertEqual(self.client.delete(f"{reviews_url(self.book.pk)}{theirs.pk}/").status_code, 403)
        self.assertEqual(self.client.delete(f"{reviews_url(self.book.pk)}{mine.pk}/").status_code, 204)
        self.client.credentials()
        self.assertEqual(self.client.delete(f"{reviews_url(self.book.pk)}{theirs.pk}/").status_code, 401)
        self.auth_as("boss")
        self.assertEqual(self.client.delete(f"{reviews_url(self.book.pk)}{theirs.pk}/").status_code, 204)

    def test_ratings_in_list_and_top_rated_sort(self):
        Review.objects.create(product=self.cheap, user=self.customer, rating=3)
        Review.objects.create(product=self.cheap, user=self.admin, rating=4)
        Review.objects.create(product=self.book, user=self.customer, rating=5)
        res = self.client.get(PRODUCTS_URL, {"ordering": "-rating_score"})
        rows = [(p["name"], p["average_rating"], p["rating_count"]) for p in res.data["results"]]
        self.assertEqual(rows[0], ("Django Guide", 5.0, 1))
        self.assertEqual(rows[1], ("Basic Phone", 3.5, 2))
        self.assertEqual(rows[2], ("Flagship Phone", None, 0))  # unrated last
        self.assertEqual(self.client.get(detail_url(self.cheap.pk)).data["average_rating"], 3.5)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class GalleryTests(ProductTestBase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def url(self, pk=None):
        return f"{PRODUCTS_URL}{pk or self.book.pk}/images/"

    def test_only_admin_can_add_photos(self):
        self.assertEqual(self.client.post(self.url(), {"image": make_image()}, format="multipart").status_code, 401)
        self.auth_as("cust")
        self.assertEqual(self.client.post(self.url(), {"image": make_image()}, format="multipart").status_code, 403)

    def test_add_list_and_delete_photos(self):
        self.auth_as("boss")
        a = self.client.post(self.url(), {"image": make_image("a.png"), "alt_text": "Side view"}, format="multipart")
        b = self.client.post(self.url(), {"image": make_image("b.png")}, format="multipart")
        self.assertEqual((a.status_code, b.status_code), (201, 201), a.data)
        self.assertEqual((a.data["position"], b.data["position"]), (1, 2))
        images = self.client.get(detail_url(self.book.pk)).data["images"]
        self.assertEqual([i["alt_text"] for i in images], ["Side view", ""])
        path = ProductImage.objects.get(pk=a.data["id"]).image.path
        self.assertTrue(os.path.exists(path))
        self.assertEqual(self.client.delete(f"{self.url()}{a.data['id']}/").status_code, 204)
        self.assertFalse(os.path.exists(path))  # file removed too
        self.assertEqual(self.client.delete(f"{self.url(self.cheap.pk)}{b.data['id']}/").status_code, 404)  # wrong product

    def test_limits_and_bad_files(self):
        self.auth_as("boss")
        fake = make_image()
        fake.file.write(b"not really")
        from django.core.files.uploadedfile import SimpleUploadedFile
        res = self.client.post(self.url(), {"image": SimpleUploadedFile("x.png", b"text", "image/png")}, format="multipart")
        self.assertEqual(res.status_code, 400)
        for _ in range(MAX_EXTRA_IMAGES):
            ProductImage.objects.create(product=self.book, image="products/gallery/x.png")
        res = self.client.post(self.url(), {"image": make_image()}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertIn("up to", res.data["detail"])

    def test_deleting_product_removes_gallery_files(self):
        self.auth_as("boss")
        res = self.client.post(self.url(), {"image": make_image()}, format="multipart")
        path = ProductImage.objects.get(pk=res.data["id"]).image.path
        self.assertEqual(self.client.delete(detail_url(self.book.pk)).status_code, 204)
        self.assertFalse(os.path.exists(path))


class DetailsTests(ProductTestBase):
    def test_brand_and_specifications(self):
        self.auth_as("boss")
        specs = [{"label": "Pages", "value": "320"}, {"label": " ", "value": ""}, {"label": "Language", "value": "English"}]
        res = self.client.patch(detail_url(self.book.pk), {"brand": "Penguin", "specifications": specs}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["specifications"], [{"label": "Pages", "value": "320"}, {"label": "Language", "value": "English"}])
        # multipart form (admin product form with a photo) sends the table as a JSON string
        res = self.client.patch(detail_url(self.book.pk), {"specifications": json.dumps(specs[:1])}, format="multipart")
        self.assertEqual(res.data["specifications"], [{"label": "Pages", "value": "320"}])
        too_many = [{"label": f"L{i}", "value": "v"} for i in range(21)]
        self.assertEqual(self.client.patch(detail_url(self.book.pk), {"specifications": too_many}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(detail_url(self.book.pk), {"specifications": "nope"}, format="json").status_code, 400)

    def test_search_by_brand(self):
        Product.objects.filter(pk=self.book.pk).update(brand="Penguin")
        self.assertEqual(self.names(self.client.get(PRODUCTS_URL, {"search": "penguin"})), ["Django Guide"])
