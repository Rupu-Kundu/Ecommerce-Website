"""
Payment provider adapter — one entry point for every payment method.

  Card  → Stripe Checkout (test or live)   when STRIPE_SECRET_KEY is set
  bKash → bKash Tokenized Checkout          when BKASH_* credentials are set   (payments/bkash.py)
  Nagad → Nagad Merchant API                when NAGAD_* credentials are set   (payments/nagad.py)

A method without credentials uses the built-in DEMO test gateway (simulated
Card / bKash / Nagad pages, no real money) — but only while PAYMENTS_ALLOW_DEMO
is on (development / tests). In production it is off, so the method is simply
unavailable until it is configured.

Card numbers, wallet PINs and OTPs never touch this server: customers enter them on
Stripe / bKash / Nagad pages; the demo pages never send them anywhere.
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings

from . import bkash, nagad
from .errors import PaymentError
from .models import Payment

METHOD_LABELS = {"card": "Card", "bkash": "bKash", "nagad": "Nagad"}


def stripe_enabled():
    key = settings.STRIPE_SECRET_KEY or ""
    is_placeholder = "your_key" in key or key.endswith("_here")
    return key.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")) and not is_placeholder


def demo_allowed():
    return settings.PAYMENTS_ALLOW_DEMO


def real_provider_for(method):
    if method == "card" and stripe_enabled():
        return Payment.Provider.STRIPE
    if method == "bkash" and bkash.enabled():
        return Payment.Provider.BKASH
    if method == "nagad" and nagad.enabled():
        return Payment.Provider.NAGAD
    return None


def provider_for(method):
    """The provider that will handle `method`, or None if the method is unavailable."""
    return real_provider_for(method) or (Payment.Provider.DEMO if demo_allowed() else None)


def payment_methods_payload():
    methods = []
    for code, label in METHOD_LABELS.items():
        provider = provider_for(code)
        methods.append({
            "code": code,
            "label": label,
            "provider": provider,
            "available": provider is not None,
            "demo": provider == Payment.Provider.DEMO,
        })
    return methods


def active_provider():
    """Provider for card payments (kept for backwards compatibility)."""
    return provider_for("card")


def _stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def to_minor_units(amount):
    """BDT has 2 decimal places in Stripe: ৳1,250.00 → 125000 (poisha)."""
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_minor_units(value):
    return (Decimal(value) / 100).quantize(Decimal("0.01"))


def create_session(order, user, client_ip=None):
    """Start a payment for `order`. Returns (provider, session_id, checkout_url)."""
    frontend = settings.FRONTEND_URL
    provider = provider_for(order.payment_method)
    if provider is None:
        raise PaymentError(f"{METHOD_LABELS.get(order.payment_method, 'This')} payments are not available right now.")

    if provider == Payment.Provider.DEMO:
        session_id = f"demo_{uuid.uuid4().hex}"
        url = f"{frontend}/payment/demo?session_id={session_id}&order={order.pk}"
        return provider, session_id, url
    if provider == Payment.Provider.BKASH:
        payment_id, url = bkash.create_payment(order, user, f"{frontend}/payment/success/bkash")
        return provider, payment_id, url
    if provider == Payment.Provider.NAGAD:
        reference, url = nagad.create_payment(order, user, f"{frontend}/payment/success/nagad", client_ip)
        return provider, reference, url

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


def verify(payment, params=None, client_ip=None):
    """
    Ask the real provider whether `payment` was paid.
    Returns (is_paid, is_failed, amount_paid, provider_reference).
    """
    params = params or {}
    if payment.provider == Payment.Provider.STRIPE:
        is_paid, is_expired, amount, intent = retrieve_session(payment.transaction_id)
        return is_paid, is_expired, amount, intent
    if payment.provider == Payment.Provider.BKASH:
        return bkash.verify(payment.transaction_id, params.get("status"))
    if payment.provider == Payment.Provider.NAGAD:
        return nagad.verify(payment.transaction_id, client_ip)
    return False, False, None, None  # demo payments are completed on the demo page


def refund(payment, reference):
    """Give the money back (used when stock ran out during payment). Returns a note."""
    if payment.provider == Payment.Provider.STRIPE:
        if reference:
            _stripe().Refund.create(payment_intent=reference)
        return "Your payment was refunded."
    if payment.provider == Payment.Provider.BKASH:
        bkash.refund(payment.transaction_id, reference, payment.amount)
        return "Your payment was refunded to your bKash account."
    if payment.provider == Payment.Provider.NAGAD:
        # Nagad refunds are issued from the Nagad merchant panel.
        return "Your payment will be refunded to your Nagad account."
    return "Your payment was refunded."


def construct_webhook_event(payload, signature):
    """Verify the Stripe-Signature header. Raises ValueError / SignatureVerificationError."""
    return _stripe().Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
