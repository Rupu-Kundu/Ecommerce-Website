"""Checkout verification and order creation, shared by the checkout and order APIs."""

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from accounts.models import Address
from cart.serializers import serialize_cart
from cart.services import cart_items, cart_subtotal, get_cart, sync_cart

from products.models import Product

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

    return _summary(request, data, items, from_cart=True)


def _summary(request, data, items, from_cart):
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
        "payment_method": data.get("payment_method", "card"),
        "from_cart": from_cart,
    }


class BuyNowItem:
    """Same shape as a cart item (product + quantity) so orders are built the same way."""

    def __init__(self, product, quantity):
        self.product = product
        self.quantity = quantity


def prepare_buy_now(request, data):
    """
    "Buy now": check out only the given product(s), leaving the cart untouched.
    Stock and price come from the database, exactly like a cart checkout.
    """
    items = []
    for line in data["items"]:
        product = Product.objects.filter(pk=line["product_id"], is_available=True).first()
        if product is None or product.stock_quantity == 0:
            raise CheckoutProblem(Response({"detail": "This product is no longer available."}, status=status.HTTP_400_BAD_REQUEST))
        if line["quantity"] > product.stock_quantity:
            raise CheckoutProblem(Response(
                {"detail": f'Only {product.stock_quantity} of "{product.name}" in stock.'},
                status=status.HTTP_400_BAD_REQUEST,
            ))
        items.append(BuyNowItem(product, line["quantity"]))
    return _summary(request, data, items, from_cart=False)


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
        payment_method=checkout["payment_method"],
        from_cart=checkout["from_cart"],
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


@transaction.atomic
def change_order_status(order, new_status):
    """
    Admin status change. Cash-on-delivery side effects:
      - delivered → the rider collected the cash: payment becomes Paid,
      - cancelled → nothing was paid, so the reserved stock goes back.
    """
    from payments.models import Payment  # avoid a circular import

    order = Order.objects.select_for_update().get(pk=order.pk)
    previous = order.status
    order.status = new_status
    fields = ["status", "updated_at"]
    if order.payment_status == Order.PaymentStatus.DUE:
        cod_payments = order.payments.filter(provider=Payment.Provider.COD, status=Payment.Status.PENDING)
        if new_status == Order.Status.DELIVERED:
            order.payment_status = Order.PaymentStatus.PAID
            fields.append("payment_status")
            cod_payments.update(status=Payment.Status.SUCCEEDED)
        elif new_status == Order.Status.CANCELLED and previous != Order.Status.CANCELLED:
            items = list(order.items.all())
            products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=[i.product_id for i in items])}
            for item in items:
                product = products.get(item.product_id)
                if product:
                    product.stock_quantity += item.quantity
                    product.save(update_fields=["stock_quantity", "updated_at"])
            cod_payments.update(status=Payment.Status.FAILED)
    order.save(update_fields=fields)
    return order


class CannotCancel(Exception):
    """The customer can no longer cancel this order; the message is safe to show."""


def customer_can_cancel(order):
    """Cash-on-delivery orders can be cancelled by the customer until they are shipped."""
    return (
        order.payment_method == Order.PaymentMethod.COD
        and order.payment_status == Order.PaymentStatus.DUE
        and order.status in (Order.Status.PAID, Order.Status.PROCESSING)
    )


@transaction.atomic
def cancel_by_customer(order):
    """Customer cancels their COD order: status Cancelled, reserved stock goes back."""
    order = Order.objects.select_for_update().get(pk=order.pk)  # re-check under lock (admin may be shipping it)
    if order.status == Order.Status.CANCELLED:
        raise CannotCancel(f"Order #{order.pk} is already cancelled.")
    if not customer_can_cancel(order):
        if order.payment_method != Order.PaymentMethod.COD:
            raise CannotCancel("Only cash-on-delivery orders can be cancelled here. Please contact support for help with this order.")
        raise CannotCancel(f"Order #{order.pk} has already been {order.get_status_display().lower()}, so it can't be cancelled. Please contact support.")
    return change_order_status(order, Order.Status.CANCELLED)
