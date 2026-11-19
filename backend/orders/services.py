"""Checkout verification and order creation, shared by the checkout and order APIs."""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from accounts.models import Address
from cart.serializers import serialize_cart
from cart.services import cart_items, cart_subtotal, get_cart, sync_cart

from .models import Order, OrderItem
from .shipping import shipping_cost


class CheckoutProblem(Exception):
    """Raised when the cart can't be checked out; carries the API response to return."""

    def __init__(self, response):
        super().__init__(response.data.get("detail"))
        self.response = response


def save_address(user, fields):
    """Reuse an identical saved address instead of creating duplicates."""
    existing = Address.objects.filter(user=user, **fields).first()
    if existing:
        return existing
    is_first = not Address.objects.filter(user=user).exists()
    return Address.objects.create(user=user, is_default=is_first, **fields)


def prepare_checkout(request, data):
    """
    Server-side checkout verification:
      1. re-check the cart against current stock (removes/adjusts items),
      2. recalculate prices from the database,
      3. save/resolve the shipping address.
    Raises CheckoutProblem (400 empty cart / 409 cart changed).

    The cart clean-up is committed in its own transaction BEFORE any error is raised,
    so the user sees (and keeps) the corrected cart and can simply try again.
    """
    cart = get_cart(request.user)
    with transaction.atomic():
        notices = sync_cart(cart)
    items = list(cart_items(cart))

    if not items:
        raise CheckoutProblem(Response(
            {"detail": "Your cart is empty.", "cart": serialize_cart(cart, request, notices)},
            status=status.HTTP_400_BAD_REQUEST,
        ))
    if notices:
        raise CheckoutProblem(Response(
            {
                "detail": "Your cart changed because of stock updates. Please review it.",
                "cart": serialize_cart(cart, request, notices),
            },
            status=status.HTTP_409_CONFLICT,
        ))

    address = data.get("address_obj") or save_address(request.user, data["address"])
    subtotal = cart_subtotal(items)
    method = data["shipping_method"]
    shipping = shipping_cost(method, subtotal)
    return {
        "items": items,
        "address": address,
        "subtotal": subtotal,
        "shipping_method": method,
        "shipping_cost": shipping,
        "total": subtotal + shipping,
    }


@transaction.atomic
def create_order(request, checkout):
    """
    Create an order from a verified checkout (see prepare_checkout).
    Status: pending, payment: pending.
    Cart items are COPIED into order items with the current name and price.
    The cart is cleared and stock reduced only after successful payment.
    Any older unpaid order of this user is cancelled, so abandoned attempts
    never pile up as duplicate orders.
    """
    for old in Order.objects.select_for_update().filter(
        user=request.user, payment_status=Order.PaymentStatus.PENDING
    ):
        cancel_unpaid_order(old)

    order = Order.objects.create(
        user=request.user,
        address=checkout["address"],
        subtotal=checkout["subtotal"],
        shipping_method=checkout["shipping_method"],
        shipping_cost=checkout["shipping_cost"],
        total_amount=checkout["total"],
    )
    OrderItem.objects.bulk_create([
        OrderItem(
            order=order,
            product=item.product,
            product_name=item.product.name,
            price=item.product.price,
            quantity=item.quantity,
        )
        for item in checkout["items"]
    ])
    return order


def cancel_unpaid_order(order):
    """Mark an order whose payment never completed as cancelled/failed (stock untouched)."""
    from payments.models import Payment  # avoid circular import

    order.status = Order.Status.CANCELLED
    order.payment_status = Order.PaymentStatus.FAILED
    order.save(update_fields=["status", "payment_status", "updated_at"])
    order.payments.filter(status=Payment.Status.PENDING).update(status=Payment.Status.FAILED)
