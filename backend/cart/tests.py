from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from products.models import Category, Product

from .models import Cart, CartItem

User = get_user_model()
PASSWORD = "StrongPass!2024"
CART_URL = "/api/cart/"
ITEMS_URL = "/api/cart/items/"


def item_url(pk):
    return f"{ITEMS_URL}{pk}/"


class CartTestBase(APITestCase):
    def setUp(self):
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.mouse = Product.objects.create(name="Mouse", category=cat, price=Decimal("10.50"), stock_quantity=5)
        self.keyboard = Product.objects.create(name="Keyboard", category=cat, price=Decimal("25.00"), stock_quantity=3)
        self.user = User.objects.create_user("alice", "alice@example.com", PASSWORD)
        self.other = User.objects.create_user("bob", "bob@example.com", PASSWORD)
        self.login("alice")

    def login(self, username):
        access = self.client.post(
            "/api/auth/login/", {"username": username, "password": PASSWORD}
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def add(self, product, quantity=1):
        return self.client.post(ITEMS_URL, {"product_id": product.pk, "quantity": quantity}, format="json")


class CartAuthTests(CartTestBase):
    def test_guest_cannot_use_cart(self):
        self.client.credentials()
        self.assertEqual(self.client.get(CART_URL).status_code, 401)
        self.assertEqual(self.add(self.mouse).status_code, 401)
        self.assertEqual(self.client.patch(item_url(1), {"quantity": 2}).status_code, 401)
        self.assertEqual(self.client.delete(item_url(1)).status_code, 401)

    def test_cannot_touch_another_users_item(self):
        self.add(self.mouse)
        item_id = CartItem.objects.get().pk
        self.login("bob")
        self.assertEqual(self.client.patch(item_url(item_id), {"quantity": 2}).status_code, 404)
        self.assertEqual(self.client.delete(item_url(item_id)).status_code, 404)
        self.assertEqual(CartItem.objects.get().quantity, 1)


class CartBehaviourTests(CartTestBase):
    def test_empty_cart(self):
        res = self.client.get(CART_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"], [])
        self.assertEqual(res.data["subtotal"], "0.00")
        self.assertEqual(res.data["total_items"], 0)

    def test_add_product_and_subtotal(self):
        res = self.add(self.mouse, 2)
        self.assertEqual(res.status_code, 201)
        res = self.add(self.keyboard, 1)
        self.assertEqual(res.data["total_items"], 3)
        self.assertEqual(res.data["subtotal"], "46.00")  # 2*10.50 + 25.00
        lines = {i["product"]["name"]: i["line_total"] for i in res.data["items"]}
        self.assertEqual(lines, {"Mouse": "21.00", "Keyboard": "25.00"})

    def test_adding_same_product_increases_quantity(self):
        self.add(self.mouse, 1)
        res = self.add(self.mouse, 2)
        self.assertEqual(len(res.data["items"]), 1)
        self.assertEqual(res.data["items"][0]["quantity"], 3)

    def test_increase_and_decrease_quantity(self):
        item_id = self.add(self.mouse, 1).data["items"][0]["id"]
        res = self.client.patch(item_url(item_id), {"quantity": 4}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["quantity"], 4)
        res = self.client.patch(item_url(item_id), {"quantity": 2}, format="json")
        self.assertEqual(res.data["items"][0]["quantity"], 2)
        self.assertEqual(res.data["subtotal"], "21.00")

    def test_quantity_must_be_at_least_one(self):
        item_id = self.add(self.mouse).data["items"][0]["id"]
        self.assertEqual(self.client.patch(item_url(item_id), {"quantity": 0}, format="json").status_code, 400)
        self.assertEqual(self.add(self.keyboard, 0).status_code, 400)

    def test_remove_product(self):
        item_id = self.add(self.mouse).data["items"][0]["id"]
        self.add(self.keyboard)
        res = self.client.delete(item_url(item_id))
        self.assertEqual(res.status_code, 200)
        self.assertEqual([i["product"]["name"] for i in res.data["items"]], ["Keyboard"])
        self.assertEqual(res.data["subtotal"], "25.00")

    def test_cannot_exceed_stock(self):
        res = self.add(self.keyboard, 4)
        self.assertEqual(res.status_code, 400)
        self.add(self.keyboard, 2)
        res = self.add(self.keyboard, 2)  # 2 + 2 > 3
        self.assertEqual(res.status_code, 400)
        self.assertIn("already have 2", res.data["detail"])
        item_id = CartItem.objects.get().pk
        self.assertEqual(self.client.patch(item_url(item_id), {"quantity": 4}, format="json").status_code, 400)

    def test_cannot_add_unavailable_or_missing_product(self):
        self.mouse.is_available = False
        self.mouse.save()
        self.assertEqual(self.add(self.mouse).status_code, 400)
        res = self.client.post(ITEMS_URL, {"product_id": 99999}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_unavailable_items_removed_on_get(self):
        self.add(self.mouse, 1)
        self.add(self.keyboard, 3)
        self.mouse.is_available = False
        self.mouse.save()
        self.keyboard.stock_quantity = 1
        self.keyboard.save()
        res = self.client.get(CART_URL)
        self.assertEqual([i["product"]["name"] for i in res.data["items"]], ["Keyboard"])
        self.assertEqual(res.data["items"][0]["quantity"], 1)  # lowered to stock
        self.assertEqual(len(res.data["notices"]), 2)
        self.assertEqual(res.data["subtotal"], "25.00")

    def test_out_of_stock_item_removed_on_get(self):
        self.add(self.mouse, 1)
        self.mouse.stock_quantity = 0
        self.mouse.save()
        res = self.client.get(CART_URL)
        self.assertEqual(res.data["items"], [])
        self.assertIn("no longer available", res.data["notices"][0])

    def test_subtotal_uses_current_price(self):
        self.add(self.mouse, 2)
        self.mouse.price = Decimal("12.00")
        self.mouse.save()
        self.assertEqual(self.client.get(CART_URL).data["subtotal"], "24.00")

    def test_cart_preserved_after_logout_and_login(self):
        self.add(self.mouse, 2)
        self.client.credentials()  # "logout"
        self.login("alice")
        res = self.client.get(CART_URL)
        self.assertEqual(res.data["items"][0]["quantity"], 2)
        self.assertEqual(Cart.objects.filter(user=self.user).count(), 1)

    def test_carts_are_separate_per_user(self):
        self.add(self.mouse, 2)
        self.login("bob")
        self.assertEqual(self.client.get(CART_URL).data["items"], [])
