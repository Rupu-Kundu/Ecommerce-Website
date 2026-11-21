"""Security & production-readiness tests (Day 2 · Step 7)."""

from django.contrib.auth import get_user_model
from django.db.models import ProtectedError
from rest_framework.test import APIRequestFactory, APITestCase

from .exceptions import api_exception_handler

User = get_user_model()
PASSWORD = "StrongPass!2024"


class ErrorHandlingTests(APITestCase):
    def test_unexpected_error_returns_generic_json_500(self):
        with self.assertLogs("api", level="ERROR"):
            response = api_exception_handler(RuntimeError("database password is hunter2"), {"view": None})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data, {"detail": "Something went wrong on our side. Please try again."})
        self.assertNotIn("hunter2", str(response.data))

    def test_protected_delete_returns_400(self):
        response = api_exception_handler(ProtectedError("in use", set()), {"view": None})
        self.assertEqual(response.status_code, 400)

    def test_unknown_endpoint_and_bad_json(self):
        self.assertEqual(self.client.get("/api/does-not-exist/").status_code, 404)
        res = self.client.generic("POST", "/api/auth/login/", "{not json", content_type="application/json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)


class AccessControlTests(APITestCase):
    PROTECTED = [
        ("get", "/api/auth/me/"), ("get", "/api/cart/"), ("post", "/api/cart/items/"),
        ("post", "/api/checkout/"), ("get", "/api/orders/"), ("post", "/api/orders/"),
        ("get", "/api/orders/1/"), ("post", "/api/payments/session/"), ("get", "/api/admin/stats/"),
        ("post", "/api/products/"), ("post", "/api/categories/"), ("patch", "/api/orders/1/status/"),
    ]
    ADMIN_ONLY = [
        ("get", "/api/admin/stats/"), ("post", "/api/products/"), ("post", "/api/categories/"),
        ("patch", "/api/orders/1/status/"),
    ]

    def test_guests_are_rejected(self):
        for method, url in self.PROTECTED:
            with self.subTest(url=url, method=method):
                self.assertEqual(getattr(self.client, method)(url).status_code, 401)

    def test_customers_cannot_use_admin_endpoints(self):
        User.objects.create_user("cust", "c@example.com", PASSWORD)
        token = self.client.post("/api/auth/login/", {"username": "cust", "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        for method, url in self.ADMIN_ONLY:
            with self.subTest(url=url, method=method):
                self.assertEqual(getattr(self.client, method)(url, {}, format="json").status_code, 403)

    def test_public_endpoints_stay_public(self):
        for url in ("/api/products/", "/api/categories/", "/api/checkout/shipping-methods/", "/api/payments/config/"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)


class HeadersAndCorsTests(APITestCase):
    def test_security_headers(self):
        res = self.client.get("/api/products/")
        self.assertEqual(res["X-Frame-Options"], "DENY")
        self.assertEqual(res["X-Content-Type-Options"], "nosniff")
        self.assertEqual(res["Referrer-Policy"], "same-origin")

    def test_cors_only_for_allowed_origin(self):
        ok = self.client.get("/api/products/", HTTP_ORIGIN="http://localhost:5173")
        bad = self.client.get("/api/products/", HTTP_ORIGIN="https://evil.example")
        self.assertEqual(ok.get("Access-Control-Allow-Origin"), "http://localhost:5173")
        self.assertIsNone(bad.get("Access-Control-Allow-Origin"))
