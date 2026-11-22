"""
Admin-only customer management (read only). Customers are users with is_staff=False.

GET /api/admin/customers/        list: ?search= &status=active|inactive &orders=with|without
                                       &joined=7|30|90 &ordering= &page=
GET /api/admin/customers/<id>/   profile + order stats + saved addresses

A customer's orders come from the existing GET /api/orders/?customer=<id> (admin only).
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DecimalField, F, Max, Min, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from orders.models import Order
from orders.serializers import AddressSerializer

from .permissions import IsAdmin
from .serializers import AdminCustomerSerializer

User = get_user_model()

PLACED = Q(orders__payment_status__in=Order.PLACED_PAYMENT_STATUSES)
PAID = Q(orders__payment_status=Order.PaymentStatus.PAID)

ORDERINGS = {
    "newest": ["-date_joined", "-id"],
    "oldest": ["date_joined", "id"],
    "spent": [F("total_spent").desc(), "-id"],
    "orders": [F("orders_count").desc(), "-id"],
    "recent_order": [F("last_order_at").desc(nulls_last=True), "-id"],
    "name": ["username"],
}
JOINED_DAYS = {"7": 7, "30": 30, "90": 90}


def customers_with_stats():
    return User.objects.filter(is_staff=False).annotate(
        orders_count=Count("orders", filter=PLACED, distinct=True),
        total_spent=Coalesce(Sum("orders__total_amount", filter=PAID), Value(Decimal("0")), output_field=DecimalField()),
        last_order_at=Max("orders__created_at", filter=PLACED),
    )


class AdminCustomerListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        params = request.query_params
        qs = customers_with_stats()

        search = params.get("search", "").strip()[:100]
        if search:
            qs = qs.filter(
                Q(username__icontains=search) | Q(email__icontains=search) | Q(first_name__icontains=search)
                | Q(last_name__icontains=search) | Q(phone__icontains=search)
            )
        status = params.get("status")
        if status in ("active", "inactive"):
            qs = qs.filter(is_active=status == "active")
        orders = params.get("orders")
        if orders == "with":
            qs = qs.filter(orders_count__gt=0)
        elif orders == "without":
            qs = qs.filter(orders_count=0)
        if params.get("joined") in JOINED_DAYS:
            qs = qs.filter(date_joined__gte=timezone.now() - timedelta(days=JOINED_DAYS[params["joined"]]))

        qs = qs.order_by(*ORDERINGS.get(params.get("ordering"), ORDERINGS["newest"]))

        paginator = api_settings.DEFAULT_PAGINATION_CLASS()
        page = paginator.paginate_queryset(qs, request, view=self)
        response = paginator.get_paginated_response(AdminCustomerSerializer(page, many=True).data)

        everyone = User.objects.filter(is_staff=False)
        response.data["summary"] = {
            "total": everyone.count(),
            "active": everyone.filter(is_active=True).count(),
            "with_orders": everyone.filter(orders__payment_status__in=Order.PLACED_PAYMENT_STATUSES).distinct().count(),
            "new_last_30_days": everyone.filter(date_joined__gte=timezone.now() - timedelta(days=30)).count(),
        }
        return response


class AdminCustomerDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        customer = get_object_or_404(customers_with_stats(), pk=pk)  # staff accounts → 404
        placed = customer.orders.filter(payment_status__in=Order.PLACED_PAYMENT_STATUSES)
        paid = placed.filter(payment_status=Order.PaymentStatus.PAID)
        stats = placed.aggregate(first=Min("created_at"), last=Max("created_at"))
        paid_stats = paid.aggregate(n=Count("id"), avg=Avg("total_amount"))
        by_status = dict(placed.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        return Response({
            **AdminCustomerSerializer(customer).data,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "stats": {
                "orders_count": customer.orders_count,
                "paid_orders": paid_stats["n"],
                "total_spent": f"{customer.total_spent:.2f}",
                "average_order_value": f"{paid_stats['avg'] or 0:.2f}",
                "first_order_at": stats["first"],
                "last_order_at": stats["last"],
                "cancelled_orders": by_status.get(Order.Status.CANCELLED, 0),
                "open_orders": sum(by_status.get(s, 0) for s in (Order.Status.PAID, Order.Status.PROCESSING, Order.Status.SHIPPED)),
                "cod_due": f"{placed.filter(payment_status=Order.PaymentStatus.DUE).exclude(status=Order.Status.CANCELLED).aggregate(s=Sum('total_amount'))['s'] or 0:.2f}",
            },
            "addresses": AddressSerializer(customer.addresses.all(), many=True).data,
            "reviews_count": customer.reviews.count(),
            "chats_count": customer.support_conversations.count(),
        })
