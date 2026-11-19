from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import include, path
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, APITestCase
from rest_framework.views import APIView

from .permissions import IsAdmin, IsAdminOrReadOnly

User = get_user_model()

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"
PASSWORD = "StrongPass!2024"


class RegisterTests(APITestCase):
    def payload(self, **overrides):
        data = {
            "username": "alice",
            "email": "Alice@Example.com",
            "password": PASSWORD,
            "password_confirm": PASSWORD,
        }
        data.update(overrides)
        return data

    def test_register_creates_customer_and_returns_tokens(self):
        res = self.client.post(REGISTER_URL, self.payload())
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["role"], "customer")
        self.assertEqual(res.data["user"]["email"], "alice@example.com")
        self.assertNotIn("password", res.data["user"])
        user = User.objects.get(username="alice")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_staff)

    def test_register_cannot_make_self_admin(self):
        res = self.client.post(REGISTER_URL, self.payload(is_staff=True, is_superuser=True))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="alice")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_register_rejects_mismatched_passwords(self):
        res = self.client.post(REGISTER_URL, self.payload(password_confirm="Different!2024"))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", res.data)

    def test_register_rejects_weak_password(self):
        res = self.client.post(REGISTER_URL, self.payload(password="123", password_confirm="123"))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user("bob", "alice@example.com", PASSWORD)
        res = self.client.post(REGISTER_URL, self.payload(email="ALICE@example.com"))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res.data)

    def test_register_requires_email(self):
        data = self.payload()
        data.pop("email")
        res = self.client.post(REGISTER_URL, data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class LoginRefreshLogoutMeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("carol", "carol@example.com", PASSWORD)

    def login(self):
        return self.client.post(LOGIN_URL, {"username": "carol", "password": PASSWORD})

    def test_login_returns_tokens_and_user(self):
        res = self.login()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["username"], "carol")

    def test_login_wrong_password_rejected(self):
        res = self.client.post(LOGIN_URL, {"username": "carol", "password": "wrong"})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_token(self):
        res = self.client.get(ME_URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_rejects_invalid_token(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        res = self.client.get(ME_URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_token_returns_current_user(self):
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.get(ME_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "carol")
        self.assertEqual(res.data["role"], "customer")

    def test_refresh_returns_new_tokens_and_old_refresh_is_blocked(self):
        refresh = self.login().data["refresh"]
        res = self.client.post(REFRESH_URL, {"refresh": refresh})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        # Rotation + blacklist: the old refresh token can't be used again
        res2 = self.client.post(REFRESH_URL, {"refresh": refresh})
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self):
        tokens = self.login().data
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        res = self.client.post(LOGOUT_URL, {"refresh": tokens["refresh"]})
        self.assertEqual(res.status_code, status.HTTP_205_RESET_CONTENT)
        res2 = self.client.post(REFRESH_URL, {"refresh": tokens["refresh"]})
        self.assertEqual(res2.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self):
        refresh = self.login().data["refresh"]
        res = self.client.post(LOGOUT_URL, {"refresh": refresh})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_rejects_another_users_token(self):
        User.objects.create_user("dave", "dave@example.com", PASSWORD)
        dave_refresh = self.client.post(
            LOGIN_URL, {"username": "dave", "password": PASSWORD}
        ).data["refresh"]
        access = self.login().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.post(LOGOUT_URL, {"refresh": dave_refresh})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_role_reported(self):
        User.objects.create_user("admin1", "admin1@example.com", PASSWORD, is_staff=True)
        res = self.client.post(LOGIN_URL, {"username": "admin1", "password": PASSWORD})
        self.assertEqual(res.data["user"]["role"], "admin")


# --- Role permission tests, using small throwaway views ---

class AdminOnlyView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({"ok": True})


class AdminOrReadOnlyView(APIView):
    permission_classes = [IsAdminOrReadOnly]

    def get(self, request):
        return Response({"ok": True})

    def post(self, request):
        return Response({"ok": True})


test_urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    path("test/admin-only/", AdminOnlyView.as_view()),
    path("test/admin-or-read/", AdminOrReadOnlyView.as_view()),
]


@override_settings(ROOT_URLCONF=__name__)
class RolePermissionTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user("cust", "cust@example.com", PASSWORD)
        self.admin = User.objects.create_user("boss", "boss@example.com", PASSWORD, is_staff=True)

    def auth_as(self, username):
        access = self.client.post(
            LOGIN_URL, {"username": username, "password": PASSWORD}
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_admin_only_blocks_guest(self):
        self.assertEqual(self.client.get("/test/admin-only/").status_code, 401)

    def test_admin_only_blocks_customer(self):
        self.auth_as("cust")
        self.assertEqual(self.client.get("/test/admin-only/").status_code, 403)

    def test_admin_only_allows_admin(self):
        self.auth_as("boss")
        self.assertEqual(self.client.get("/test/admin-only/").status_code, 200)

    def test_read_only_allows_guest_get_but_not_post(self):
        self.assertEqual(self.client.get("/test/admin-or-read/").status_code, 200)
        self.assertEqual(self.client.post("/test/admin-or-read/").status_code, 401)

    def test_read_only_blocks_customer_write(self):
        self.auth_as("cust")
        self.assertEqual(self.client.get("/test/admin-or-read/").status_code, 200)
        self.assertEqual(self.client.post("/test/admin-or-read/").status_code, 403)

    def test_read_only_allows_admin_write(self):
        self.auth_as("boss")
        self.assertEqual(self.client.post("/test/admin-or-read/").status_code, 200)


urlpatterns = test_urlpatterns  # used by @override_settings(ROOT_URLCONF=__name__)
