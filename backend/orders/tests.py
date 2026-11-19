from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Address
from cart.models import Cart, CartItem
from products.models import Category, Product

from .models import Order

User = get_user_model()
PASSWORD = "StrongPass!2024"
CHECKOUT_URL = "/api/checkout/"

ADDRESS = {
    "recipient_name": "Rupa Das",
    "phone": "+880 1712-345678",
    "street_address": "12 Lake Road",
    "city": "Dhaka",
    "postal_code": "1205",
    "country": "Bangladesh",
}


class CheckoutTestBase(APITestCase):
    def setUp(self):
        cat = Category.objects.create(name="Gadgets", slug="gadgets")
        self.mouse = Product.objects.create(name="Mouse", category=cat, price=Decimal("1000.00"), stock_quantity=5)
        self.lamp = Product.objects.create(name="Lamp", category=cat, price=Decimal("3000.00"), stock_quantity=2)
        self.user = User.objects.create_user("alice", "alice@example.com", PASSWORD)
        access = self.client.post(
            "/api/auth/login/", {"username": "alice", "password": PASSWORD}
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.cart = Cart.objects.create(user=self.user)

    def fill_cart(self, *pairs):
        for product, qty in pairs:
            CartItem.objects.create(cart=self.cart, product=product, quantity=qty)

    def checkout(self, **overrides):
        data = {"shipping_method": "standard", "address": dict(ADDRESS)}
        data.update(overrides)
        return self.client.post(CHECKOUT_URL, data, format="json")


class ShippingAndAddressListTests(CheckoutTestBase):
    def test_shipping_methods_listed(self):
        res = self.client.get("/api/checkout/shipping-methods/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual([m["code"] for m in res.data], ["standard", "express"])

    def test_saved_addresses_only_own(self):
        other = User.objects.create_user("bob", "bob@example.com", PASSWORD)
        Address.objects.create(user=other, **ADDRESS)
        Address.objects.create(user=self.user, **ADDRESS)
        res = self.client.get("/api/checkout/addresses/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)


class CheckoutTests(CheckoutTestBase):
    def test_requires_login(self):
        self.client.credentials()
        self.assertEqual(self.checkout().status_code, 401)
        self.assertEqual(self.client.get("/api/checkout/addresses/").status_code, 401)

    def test_successful_checkout_saves_address_and_returns_summary(self):
        self.fill_cart((self.mouse, 2))  # ৳2,000 → under the ৳5,000 free-shipping threshold
        res = self.checkout()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["subtotal"], "2000.00")
        self.assertEqual(res.data["shipping_cost"], "120.00")
        self.assertEqual(res.data["total"], "2120.00")
        self.assertEqual(res.data["shipping_method"]["code"], "standard")
        self.assertEqual(res.data["items"][0]["line_total"], "2000.00")
        address = Address.objects.get(user=self.user)
        self.assertEqual(address.city, "Dhaka")
        self.assertTrue(address.is_default)
        self.assertEqual(res.data["address"]["id"], address.pk)

    def test_free_standard_shipping_over_threshold(self):
        self.fill_cart((self.lamp, 2))  # ৳6,000
        res = self.checkout()
        self.assertEqual(res.data["shipping_cost"], "0.00")
        self.assertEqual(res.data["total"], "6000.00")

    def test_express_shipping(self):
        self.fill_cart((self.lamp, 2))
        res = self.checkout(shipping_method="express")
        self.assertEqual(res.data["shipping_cost"], "300.00")
        self.assertEqual(res.data["total"], "6300.00")

    def test_invalid_shipping_method(self):
        self.fill_cart((self.mouse, 1))
        res = self.checkout(shipping_method="teleport")
        self.assertEqual(res.status_code, 400)
        self.assertIn("shipping_method", res.data)

    def test_address_validation(self):
        self.fill_cart((self.mouse, 1))
        bad = dict(ADDRESS, recipient_name="  ", phone="abc", postal_code="!!", city="")
        res = self.checkout(address=bad)
        self.assertEqual(res.status_code, 400)
        for field in ("recipient_name", "phone", "postal_code", "city"):
            self.assertIn(field, res.data["address"])
        missing = {k: v for k, v in ADDRESS.items() if k != "country"}
        res = self.checkout(address=missing)
        self.assertIn("country", res.data["address"])
        self.assertFalse(Address.objects.exists())

    def test_requires_exactly_one_address_source(self):
        self.fill_cart((self.mouse, 1))
        res = self.client.post(CHECKOUT_URL, {"shipping_method": "standard"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_reuse_saved_address_by_id(self):
        self.fill_cart((self.mouse, 1))
        saved = Address.objects.create(user=self.user, **ADDRESS)
        res = self.client.post(CHECKOUT_URL, {"shipping_method": "standard", "address_id": saved.pk}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["address"]["id"], saved.pk)
        self.assertEqual(Address.objects.count(), 1)

    def test_cannot_use_another_users_address(self):
        self.fill_cart((self.mouse, 1))
        other = User.objects.create_user("bob", "bob@example.com", PASSWORD)
        theirs = Address.objects.create(user=other, **ADDRESS)
        res = self.client.post(CHECKOUT_URL, {"shipping_method": "standard", "address_id": theirs.pk}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("address_id", res.data)

    def test_same_address_not_duplicated(self):
        self.fill_cart((self.mouse, 1))
        self.checkout()
        self.checkout()
        self.assertEqual(Address.objects.filter(user=self.user).count(), 1)

    def test_empty_cart_rejected(self):
        res = self.checkout()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["detail"], "Your cart is empty.")

    def test_stock_change_returns_409_with_updated_cart(self):
        self.fill_cart((self.mouse, 1), (self.lamp, 2))
        self.lamp.stock_quantity = 1
        self.lamp.save()
        res = self.checkout()
        self.assertEqual(res.status_code, 409)
        self.assertEqual(len(res.data["cart"]["notices"]), 1)
        self.assertEqual(CartItem.objects.get(product=self.lamp).quantity, 1)
        # Second attempt (after the user has reviewed) succeeds
        self.assertEqual(self.checkout().status_code, 200)

    def test_prices_come_from_database_not_client(self):
        self.fill_cart((self.mouse, 2))
        self.mouse.price = Decimal("1250.00")
        self.mouse.save()
        # Client tries to sneak in its own prices — they are ignored.
        res = self.checkout(subtotal="1.00", total="1.00", items=[{"product_id": self.mouse.pk, "price": "0.01"}])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["subtotal"], "2500.00")
        self.assertEqual(res.data["total"], "2620.00")

    def test_checkout_does_not_create_order_or_change_stock(self):
        # Order creation and stock reduction happen after payment (next steps).
        self.fill_cart((self.mouse, 2))
        self.checkout()
        self.assertEqual(Order.objects.count(), 0)
        self.mouse.refresh_from_db()
        self.assertEqual(self.mouse.stock_quantity, 5)
        self.assertEqual(CartItem.objects.count(), 1)
