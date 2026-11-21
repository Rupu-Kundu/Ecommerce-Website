"""
Payment lifecycle:

  start_payment  → creates a Payment (pending) + provider session for an unpaid order
  fulfil_payment → payment succeeded: re-check stock, reduce stock, mark order paid,
                   clear the cart. Idempotent — calling it twice (redirect + webhook,
                   page refresh, double click) never creates a second order or
                   reduces stock twice.
  fail_payment   → payment failed/cancelled: order cancelled, stock untouched.
  place_cod_order → cash on delivery: re-check + reduce stock, confirm the order
                   (status Processing, payment "Pay on delivery"), clear the cart.
                   The admin marking it Delivered turns the payment into Paid.
"""

import uuid

from django.conf import settings
from django.db import transaction

from cart.models import CartItem
from orders.models import Order
from orders.services import cancel_unpaid_order
from products.models import Product

import logging

from . import gateway
from .errors import PaymentError  # noqa: F401  (re-exported for views)
from .models import Payment




def check_stock(order, products=None):
    """Return a list of problems if any order item can no longer be supplied."""
    problems = []
    products = products or {}
    for item in order.items.all():
        product = products.get(item.product_id) or item.product
        if product is None or not product.is_available:
            problems.append(f'"{item.product_name}" is no longer available.')
        elif product.stock_quantity < item.quantity:
            problems.append(
                f'Only {product.stock_quantity} of "{item.product_name}" left in stock.'
            )
    return problems


def start_payment(order, user, client_ip=None):
    if order.payment_status != Order.PaymentStatus.PENDING or order.status != Order.Status.PENDING:
        raise PaymentError(f"Order #{order.pk} is not awaiting payment.")
    problems = check_stock(order)
    if problems:
        cancel_unpaid_order(order)
        raise PaymentError(" ".join(problems) + " Please review your cart and check out again.")

    # Only the newest attempt for an order stays open: close older Stripe sessions
    # so they can no longer be paid.
    for old in order.payments.filter(status=Payment.Status.PENDING, provider=Payment.Provider.STRIPE):
        gateway.expire_session(old.transaction_id)

    provider, session_id, url = gateway.create_session(order, user, client_ip)
    with transaction.atomic():
        order.payments.filter(status=Payment.Status.PENDING).update(status=Payment.Status.FAILED)
        payment = Payment.objects.create(
            order=order,
            user=user,
            provider=provider,
            transaction_id=session_id,
            amount=order.total_amount,
        )
    return payment, url


logger = logging.getLogger(__name__)


def _refund_and_cancel(payment, order, reason, payment_intent_id=None):
    try:
        note = gateway.refund(payment, payment_intent_id)
    except Exception:
        logger.exception("Automatic refund failed for payment %s", payment.transaction_id)
        note = "Our team will refund your payment manually."
    if payment.provider == Payment.Provider.NAGAD:
        logger.warning("Nagad payment %s needs a manual refund (order %s).", payment.transaction_id, order.pk)
    reason = f"{reason} {note}"
    payment.status = Payment.Status.REFUNDED
    payment.save(update_fields=["status", "updated_at"])
    if order.payment_status != Order.PaymentStatus.PAID:  # never undo another successful payment
        order.status = Order.Status.CANCELLED
        order.payment_status = Order.PaymentStatus.REFUNDED
        order.save(update_fields=["status", "payment_status", "updated_at"])
    payment.problem = reason
    return payment


@transaction.atomic
def fulfil_payment(transaction_id, amount_paid=None, payment_intent_id=None):
    payment = Payment.objects.select_for_update().get(transaction_id=transaction_id)
    if payment.status in (Payment.Status.SUCCEEDED, Payment.Status.REFUNDED):
        return payment  # already handled — no duplicate order, no double stock reduction

    order = Order.objects.select_for_update().get(pk=payment.order_id)

    if amount_paid is not None and amount_paid != payment.amount:
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        payment.problem = "Paid amount does not match the order total."
        return payment
    if order.payment_status == Order.PaymentStatus.PAID:
        return _refund_and_cancel(payment, order, "This order was already paid.", payment_intent_id)
    if order.status == Order.Status.CANCELLED:
        return _refund_and_cancel(payment, order, "This order was cancelled.", payment_intent_id)

    # Lock the products and re-check stock on the server before reducing it.
    items = list(order.items.all())
    products = {
        p.pk: p for p in Product.objects.select_for_update().filter(pk__in=[i.product_id for i in items])
    }
    problems = check_stock(order, products)
    if problems:
        return _refund_and_cancel(payment, order, " ".join(problems), payment_intent_id)

    for item in items:
        product = products[item.product_id]
        product.stock_quantity -= item.quantity  # never negative: checked above under lock
        product.save(update_fields=["stock_quantity", "updated_at"])

    payment.status = Payment.Status.SUCCEEDED
    payment.save(update_fields=["status", "updated_at"])
    order.status = Order.Status.PAID
    order.payment_status = Order.PaymentStatus.PAID
    order.save(update_fields=["status", "payment_status", "updated_at"])
    if order.from_cart:
        CartItem.objects.filter(cart__user=order.user).delete()  # clear the cart after checkout
    # "Buy now" orders leave the customer's cart untouched.
    return payment


@transaction.atomic
def fail_payment(transaction_id):
    payment = Payment.objects.select_for_update().get(transaction_id=transaction_id)
    if payment.status != Payment.Status.PENDING:
        return payment
    payment.status = Payment.Status.FAILED
    payment.save(update_fields=["status", "updated_at"])
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    if order.payment_status == Order.PaymentStatus.PENDING:
        cancel_unpaid_order(order)
    return payment


def place_cod_order(order, user):
    """Confirm an unpaid order as cash on delivery. Raises PaymentError with a friendly message."""
    problem = None
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.payment_method != Order.PaymentMethod.COD:
            raise PaymentError(f"Order #{order.pk} is not a cash-on-delivery order.")
        if order.payment_status != Order.PaymentStatus.PENDING or order.status != Order.Status.PENDING:
            raise PaymentError(f"Order #{order.pk} has already been placed.")
        if not gateway.cod_enabled():
            raise PaymentError("Cash on delivery is not available right now.")
        items = list(order.items.all())
        products = {p.pk: p for p in Product.objects.select_for_update().filter(pk__in=[i.product_id for i in items])}
        problems = check_stock(order, products)
        if order.total_amount > settings.COD_MAX_AMOUNT:
            problem = (f"Cash on delivery is available for orders up to ৳{settings.COD_MAX_AMOUNT:,.0f}. "
                       "Please pay online with Card, bKash or Nagad.")
        elif problems:
            problem = " ".join(problems) + " Please review your cart and check out again."
        if problem:
            # Cancel the unusable order and COMMIT that before reporting the problem
            # (raising inside this block would roll the cancellation back).
            cancel_unpaid_order(order)
        else:
            for item in items:
                product = products[item.product_id]
                product.stock_quantity -= item.quantity
                product.save(update_fields=["stock_quantity", "updated_at"])
            Payment.objects.create(
                order=order, user=user, provider=Payment.Provider.COD,
                transaction_id=f"cod_{uuid.uuid4().hex}", amount=order.total_amount,
            )
            order.status = Order.Status.PROCESSING
            order.payment_status = Order.PaymentStatus.DUE
            order.save(update_fields=["status", "payment_status", "updated_at"])
            if order.from_cart:
                CartItem.objects.filter(cart__user=order.user).delete()
    if problem:
        raise PaymentError(problem)
    return order
