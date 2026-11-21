"""Deployment checks for payments — shown by `python manage.py check --deploy`."""

from django.conf import settings
from django.core.checks import Warning, register

from . import bkash, nagad
from .gateway import stripe_enabled


@register(deploy=True)
def payment_configuration_check(app_configs, **kwargs):
    problems = []
    missing = [name for name, ok in (("Card (Stripe)", stripe_enabled()), ("bKash", bkash.enabled()), ("Nagad", nagad.enabled())) if not ok]
    if missing:
        problems.append(Warning(
            f"No real payment gateway configured for: {', '.join(missing)}.",
            hint="Set STRIPE_*, BKASH_* and NAGAD_* in .env. Unconfigured methods are hidden "
                 "in production (or use the demo gateway if PAYMENTS_ALLOW_DEMO is on).",
            id="payments.W001",
        ))
    webhook = settings.STRIPE_WEBHOOK_SECRET or ""
    if stripe_enabled() and not (webhook.startswith("whsec_") and "your_secret" not in webhook):
        problems.append(Warning(
            "Stripe is enabled but STRIPE_WEBHOOK_SECRET is missing, so webhooks are rejected.",
            hint="Create a webhook endpoint for /api/payments/webhook/ in Stripe and set its signing secret.",
            id="payments.W002",
        ))
    if settings.PAYMENTS_ALLOW_DEMO and not settings.DEBUG:
        problems.append(Warning(
            "PAYMENTS_ALLOW_DEMO is on in production: customers could place orders with simulated payments.",
            hint="Remove PAYMENTS_ALLOW_DEMO (or set it to False) on the live server.",
            id="payments.W003",
        ))
    return problems
