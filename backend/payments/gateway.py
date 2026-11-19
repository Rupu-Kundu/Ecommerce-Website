"""
Payment provider adapter.

- Stripe test mode is used when STRIPE_SECRET_KEY in backend/.env is a real key.
- Otherwise a built-in DEMO test gateway is used, so the whole flow can be tested
  locally without a Stripe account. Switching needs no code change — only the key.

Card details never touch this server: with Stripe the customer pays on Stripe's
hosted Checkout page; the demo gateway asks for no card details at all.
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

from .models import Payment


def stripe_enabled():
    key = settings.STRIPE_SECRET_KEY or ""
    is_placeholder = "your_key" in key or key.endswith("_here")
    return key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")) and not is_placeholder


def active_provider():
    return Payment.Provider.STRIPE if stripe_enabled() else Payment.Provider.DEMO


def _stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def to_minor_units(amount):
    """BDT has 2 decimal places in Stripe: ৳1,250.00 → 125000 (poisha)."""
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_minor_units(value):
    return (Decimal(value) / 100).quantize(Decimal("0.01"))


def create_session(order, user):
    """Start a payment for `order`. Returns (provider, session_id, checkout_url)."""
    frontend = settings.FRONTEND_URL
    if not stripe_enabled():
        session_id = f"demo_{uuid.uuid4().hex}"
        url = f"{frontend}/payment/demo?session_id={session_id}&order={order.pk}"
        return Payment.Provider.DEMO, session_id, url

    currency = settings.PAYMENT_CURRENCY
    line_items = [
        {
            "price_data": {
                "currency": currency,
                "unit_amount": to_minor_units(item.price),
                "product_data": {"name": item.product_name},
            },
            "quantity": item.quantity,
        }
        for item in order.items.all()
    ]
    if order.shipping_cost > 0:
        line_items.append({
            "price_data": {
                "currency": currency,
                "unit_amount": to_minor_units(order.shipping_cost),
                "product_data": {"name": f"Shipping ({order.shipping_method})"},
            },
            "quantity": 1,
        })

    session = _stripe().checkout.Session.create(
        mode="payment",
        line_items=line_items,
        customer_email=user.email or None,
        client_reference_id=str(order.pk),
        metadata={"order_id": str(order.pk), "user_id": str(user.pk)},
        success_url=f"{frontend}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{frontend}/payment/cancel?order={order.pk}",
    )
    return Payment.Provider.STRIPE, session.id, session.url


def retrieve_session(session_id):
    """Stripe only. Returns (is_paid, is_expired, amount_paid, payment_intent_id)."""
    session = _stripe().checkout.Session.retrieve(session_id)
    is_paid = session.payment_status == "paid"
    is_expired = session.status == "expired"
    amount = from_minor_units(session.amount_total) if session.amount_total is not None else None
    return is_paid, is_expired, amount, session.payment_intent


def expire_session(session_id):
    """Stripe only: stop an open Checkout Session from being paid later."""
    try:
        _stripe().checkout.Session.expire(session_id)
    except Exception:  # already completed/expired — nothing to do
        pass


def refund(payment_intent_id):
    if payment_intent_id:
        _stripe().Refund.create(payment_intent=payment_intent_id)


def construct_webhook_event(payload, signature):
    """Verify the Stripe-Signature header. Raises ValueError / SignatureVerificationError."""
    return _stripe().Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
