from django.urls import path

from .views import (
    CancelPaymentView,
    ConfirmPaymentView,
    CreatePaymentSessionView,
    DemoCompletePaymentView,
    PaymentConfigView,
    StripeWebhookView,
)

urlpatterns = [
    path("config/", PaymentConfigView.as_view(), name="payment-config"),
    path("session/", CreatePaymentSessionView.as_view(), name="payment-session"),
    path("confirm/", ConfirmPaymentView.as_view(), name="payment-confirm"),
    path("cancel/", CancelPaymentView.as_view(), name="payment-cancel"),
    path("demo/complete/", DemoCompletePaymentView.as_view(), name="payment-demo-complete"),
    path("webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
