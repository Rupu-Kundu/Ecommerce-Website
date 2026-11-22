"""
Admin payment management (read only). Built on the existing Payment model — every
checkout attempt (Card/Stripe, bKash, Nagad, demo gateway, cash on delivery) is a row.

GET /api/admin/payments/        ?search= &status= &method= &provider= &days=7|30|90
                                &order=<id> &ordering=newest|oldest|amount_high|amount_low &page=
GET /api/admin/payments/<id>/   the transaction + its order (items, address) + customer
                                + the order's other payment attempts

Payments are never created or changed here: money moves only through the payment flow
(and cash on delivery is settled by marking the order Delivered).
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from orders.models import Order
from orders.serializers import OrderSerializer

from .models import Payment

ORDERINGS = {
    "newest": ["-created_at", "-id"],
    "oldest": ["created_at", "id"],
    "amount_high": ["-amount", "-created_at"],
    "amount_low": ["amount", "-created_at"],
}
PERIODS = {"7": 7, "30": 30, "90": 90}


class AdminPaymentSerializer(serializers.ModelSerializer):
    provider_label = serializers.CharField(source="get_provider_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    method = serializers.CharField(source="order.payment_method", read_only=True)
    method_label = serializers.CharField(source="order.get_payment_method_display", read_only=True)
    order = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id", "transaction_id", "provider", "provider_label", "method", "method_label",
            "amount", "status", "status_label", "created_at", "updated_at", "order", "customer",
        )
        read_only_fields = fields

    def get_order(self, obj):
        o = obj.order
        return {
            "id": o.id, "status": o.status, "status_label": o.get_status_display(),
            "payment_status": o.payment_status, "total_amount": f"{o.total_amount:.2f}",
        }

    def get_customer(self, obj):
        u = obj.user
        return {"id": u.id, "username": u.username, "email": u.email, "full_name": u.get_full_name(), "is_staff": u.is_staff}


def filtered_payments(params):
    """Apply every list filter except `status` (the summary shows all statuses)."""
    qs = Payment.objects.select_related("order", "user")
    search = params.get("search", "").strip()[:100]
    if search:
        q = Q(transaction_id__icontains=search) | Q(user__username__icontains=search) | Q(user__email__icontains=search)
        if search.lstrip("#").isdigit():
            q |= Q(order_id=int(search.lstrip("#")))
        qs = qs.filter(q)
    method = params.get("method")
    if method in Order.PaymentMethod.values:
        qs = qs.filter(order__payment_method=method)
    provider = params.get("provider")
    if provider in Payment.Provider.values:
        qs = qs.filter(provider=provider)
    if params.get("days") in PERIODS:
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=PERIODS[params["days"]]))
    order = params.get("order", "")
    if order.isdigit():
        qs = qs.filter(order_id=int(order))
    return qs


def summarize(qs):
    rows = {r["status"]: r for r in qs.values("status").annotate(n=Count("id"), total=Sum("amount"))}

    def part(status):
        r = rows.get(status, {})
        return {"count": r.get("n", 0), "amount": f"{r.get('total') or Decimal('0'):.2f}"}

    succeeded, failed = part(Payment.Status.SUCCEEDED), part(Payment.Status.FAILED)
    finished = succeeded["count"] + failed["count"]
    return {
        "total": sum(r["n"] for r in rows.values()),
        "succeeded": succeeded,
        "pending": part(Payment.Status.PENDING),
        "failed": failed,
        "refunded": part(Payment.Status.REFUNDED),
        # share of finished attempts (succeeded or failed) that succeeded
        "success_rate": round(succeeded["count"] / finished * 100, 1) if finished else None,
    }


class AdminPaymentListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        params = request.query_params
        base = filtered_payments(params)
        qs = base
        if params.get("status") in Payment.Status.values:
            qs = qs.filter(status=params["status"])
        qs = qs.order_by(*ORDERINGS.get(params.get("ordering"), ORDERINGS["newest"]))
        paginator = api_settings.DEFAULT_PAGINATION_CLASS()
        page = paginator.paginate_queryset(qs, request, view=self)
        response = paginator.get_paginated_response(AdminPaymentSerializer(page, many=True).data)
        response.data["summary"] = summarize(base)
        return response


class AdminPaymentDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        payment = get_object_or_404(Payment.objects.select_related("order", "user"), pk=pk)
        order = Order.objects.select_related("address", "user").prefetch_related("items__product").get(pk=payment.order_id)
        attempts = payment.order.payments.select_related("order", "user").exclude(pk=payment.pk).order_by("-created_at")
        u = payment.user
        return Response({
            **AdminPaymentSerializer(payment).data,
            "customer": {
                "id": u.id, "username": u.username, "email": u.email, "full_name": u.get_full_name(),
                "phone": u.phone, "is_staff": u.is_staff,
            },
            "order_detail": OrderSerializer(order, context={"request": request}).data,
            "other_attempts": AdminPaymentSerializer(attempts, many=True).data,
        })
