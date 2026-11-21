import json
import logging

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from orders.models import Order
from orders.serializers import OrderSerializer
from orders.views import orders_for

from . import gateway
from .models import Payment
from .services import PaymentError, fail_payment, fulfil_payment, start_payment

logger = logging.getLogger(__name__)


class SessionIdSerializer(serializers.Serializer):
    session_id = serializers.CharField(max_length=255)


class OrderIdSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()


class DemoCompleteSerializer(SessionIdSerializer):
    outcome = serializers.ChoiceField(choices=["success", "failure"])


MESSAGES = {
    Payment.Status.SUCCEEDED: "Thank you! Your order has been placed.",
    Payment.Status.FAILED: "Payment failed or was cancelled. You have not been charged.",
    Payment.Status.PENDING: "Payment is still being processed.",
    Payment.Status.REFUNDED: "Your payment was refunded.",
}


def payment_response(request, payment):
    order = orders_for(request.user).get(pk=payment.order_id)
    return Response({
        "payment": {
            "status": payment.status,
            "provider": payment.provider,
            "amount": f"{payment.amount:.2f}",
            "transaction_id": payment.transaction_id,
        },
        "detail": getattr(payment, "problem", None) or MESSAGES[payment.status],
        "order": OrderSerializer(order, context={"request": request}).data,
    })


def client_ip(request):
    return request.META.get("REMOTE_ADDR")


def own_payment(request, session_id):
    return get_object_or_404(Payment, transaction_id=session_id, user=request.user)


class PaymentConfigView(APIView):
    """GET /api/payments/config/ — available payment methods and their mode (no secrets)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "currency": settings.PAYMENT_CURRENCY.upper(),
            "methods": gateway.payment_methods_payload(),
        })


class CreatePaymentSessionView(APIView):
    """POST /api/payments/session/ {order_id} — start paying for your unpaid order."""

    def post(self, request):
        serializer = OrderIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = get_object_or_404(Order, pk=serializer.validated_data["order_id"], user=request.user)
        try:
            payment, url = start_payment(order, request.user, client_ip(request))
        except PaymentError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Could not create payment session for order %s", order.pk)
            return Response(
                {"detail": "The payment provider is unavailable. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {"provider": payment.provider, "session_id": payment.transaction_id, "checkout_url": url, "order_id": order.pk},
            status=status.HTTP_201_CREATED,
        )


class ConfirmPaymentView(APIView):
    """
    POST /api/payments/confirm/ {session_id, status?}
    Called by the return page after Stripe / bKash / Nagad redirect the customer back.
    The server asks the provider for the real payment status — it never trusts the
    browser's word for it. (bKash's ?status= is only used to skip executing a
    payment the customer cancelled.)
    """

    def post(self, request):
        serializer = SessionIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = own_payment(request, serializer.validated_data["session_id"])

        if payment.provider != Payment.Provider.DEMO and payment.status == Payment.Status.PENDING:
            try:
                is_paid, is_failed, amount, reference = gateway.verify(
                    payment, {"status": request.data.get("status")}, client_ip(request)
                )
            except Exception:
                logger.exception("Could not verify %s payment %s", payment.provider, payment.transaction_id)
                return Response(
                    {"detail": "Could not verify the payment. Please refresh in a moment."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            if is_paid:
                payment = fulfil_payment(payment.transaction_id, amount, reference)
            elif is_failed:
                payment = fail_payment(payment.transaction_id)
        return payment_response(request, payment)


class CancelPaymentView(APIView):
    """POST /api/payments/cancel/ {order_id} — customer left the payment page."""

    def post(self, request):
        serializer = OrderIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = get_object_or_404(Order, pk=serializer.validated_data["order_id"], user=request.user)
        payment = order.payments.filter(status=Payment.Status.PENDING).first() or order.payments.first()
        if payment is None:
            return Response({"detail": "No payment found for this order."}, status=status.HTTP_404_NOT_FOUND)
        if payment.status == Payment.Status.PENDING:
            if payment.provider == Payment.Provider.STRIPE:
                gateway.expire_session(payment.transaction_id)
            payment = fail_payment(payment.transaction_id)
        return payment_response(request, payment)


class DemoCompletePaymentView(APIView):
    """
    POST /api/payments/demo/complete/ {session_id, outcome: success|failure}
    Only for demo test payments (Card / bKash / Nagad without credentials).
    Disabled in production unless PAYMENTS_ALLOW_DEMO is on.
    """

    def post(self, request):
        if not gateway.demo_allowed():
            return Response({"detail": "Demo payments are disabled."}, status=status.HTTP_403_FORBIDDEN)
        serializer = DemoCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = own_payment(request, serializer.validated_data["session_id"])
        if payment.provider != Payment.Provider.DEMO:
            return Response({"detail": "Not a demo payment."}, status=status.HTTP_400_BAD_REQUEST)
        if payment.status != Payment.Status.PENDING:
            return payment_response(request, payment)  # already finished — nothing to do
        if serializer.validated_data["outcome"] == "success":
            payment = fulfil_payment(payment.transaction_id)
        else:
            payment = fail_payment(payment.transaction_id)
        return payment_response(request, payment)


class StripeWebhookView(APIView):
    """
    POST /api/payments/webhook/ — Stripe → server notifications.
    The Stripe-Signature header is verified with STRIPE_WEBHOOK_SECRET; unsigned or
    forged requests are rejected. Handling is idempotent (Stripe may retry).
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.STRIPE_WEBHOOK_SECRET or "your_secret" in settings.STRIPE_WEBHOOK_SECRET:
            return Response({"detail": "Webhook secret not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        signature = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        try:
            gateway.construct_webhook_event(request.body, signature)
        except Exception:
            return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

        # Signature verified → the raw JSON body is authentic and safe to read.
        event = json.loads(request.body)
        session = event["data"]["object"]
        session_id = session.get("id")
        if not Payment.objects.filter(transaction_id=session_id).exists():
            return Response({"received": True})  # not one of ours

        event_type = event["type"]
        if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            if session.get("payment_status") == "paid":
                fulfil_payment(session_id, gateway.from_minor_units(session["amount_total"]), session.get("payment_intent"))
        elif event_type in ("checkout.session.expired", "checkout.session.async_payment_failed"):
            fail_payment(session_id)
        return Response({"received": True})
