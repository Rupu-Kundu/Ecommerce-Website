"""
Payment lifecycle:

  start_payment  → creates a Payment (pending) + provider session for an unpaid order
  fulfil_payment → payment succeeded: re-check stock, reduce stock, mark order paid,
                   clear the cart. Idempotent — calling it twice (redirect + webhook,
                   page refresh, double click) never creates a second order or
                   reduces stock twice.
  fail_payment   → payment failed/cancelled: order cancelled, stock untouched.
"""

from django.db import transaction

from cart.models import CartItem
from orders.models import Order
from orders.services import cancel_unpaid_order
from products.models import Product

from . import gateway
from .models import Payment


class PaymentError(Exception):
    pass


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


def start_payment(order, user):
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

    provider, session_id, url = gateway.create_session(order, user)
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


def _refund_and_cancel(payment, order, reason, payment_intent_id=None):
    if payment.provider == Payment.Provider.STRIPE:
        gateway.refund(payment_intent_id)
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
        return _refund_and_cancel(payment, order, "This order was already paid; the duplicate payment was refunded.", payment_intent_id)
    if order.status == Order.Status.CANCELLED:
        return _refund_and_cancel(payment, order, "This order was cancelled; the payment was refunded.", payment_intent_id)

    # Lock the products and re-check stock on the server before reducing it.
    items = list(order.items.all())
    products = {
        p.pk: p for p in Product.objects.select_for_update().filter(pk__in=[i.product_id for i in items])
    }
    problems = check_stock(order, products)
    if problems:
        return _refund_and_cancel(payment, order, " ".join(problems) + " Your payment was refunded.", payment_intent_id)

    for item in items:
        product = products[item.product_id]
        product.stock_quantity -= item.quantity  # never negative: checked above under lock
        product.save(update_fields=["stock_quantity", "updated_at"])

    payment.status = Payment.Status.SUCCEEDED
    payment.save(update_fields=["status", "updated_at"])
    order.status = Order.Status.PAID
    order.payment_status = Order.PaymentStatus.PAID
    order.save(update_fields=["status", "payment_status", "updated_at"])
    CartItem.objects.filter(cart__user=order.user).delete()  # clear the cart after checkout
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
