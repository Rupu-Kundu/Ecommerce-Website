from django.contrib.auth import get_user_model
from django.db.models import Count, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.views import APIView

from accounts.models import Address
from accounts.permissions import IsAdmin

from products.models import LOW_STOCK_THRESHOLD, Product

from .models import Order, OrderItem
from .serializers import (
    AddressSerializer,
    CheckoutSerializer,
    OrderSerializer,
    OrderStatusUpdateSerializer,
)
from .services import CheckoutProblem, create_order, prepare_buy_now, prepare_checkout
from .shipping import SHIPPING_METHODS, shipping_methods_payload

# ---------------- Checkout (Day 2 · Step 2) ----------------


class ShippingMethodListView(APIView):
    """GET /api/checkout/shipping-methods/ — available shipping options."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(shipping_methods_payload())


class SavedAddressListView(generics.ListAPIView):
    """GET /api/checkout/addresses/ — the user's saved addresses (to reuse at checkout)."""

    serializer_class = AddressSerializer
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)


class CheckoutView(APIView):
    """
    POST /api/checkout/  {shipping_method, address | address_id}
    Verifies the cart and address and returns the server-calculated summary
    (no order is created here — see POST /api/orders/).
    """

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            checkout = prepare_checkout(request, serializer.validated_data)
        except CheckoutProblem as problem:
            return problem.response

        items = checkout["items"]
        method = checkout["shipping_method"]
        return Response(
            {
                "address": AddressSerializer(checkout["address"]).data,
                "items": [
                    {
                        "product_id": item.product.id,
                        "name": item.product.name,
                        "price": f"{item.product.price:.2f}",
                        "quantity": item.quantity,
                        "line_total": f"{item.product.price * item.quantity:.2f}",
                    }
                    for item in items
                ],
                "total_items": sum(item.quantity for item in items),
                "subtotal": f"{checkout['subtotal']:.2f}",
                "shipping_method": {"code": method, "label": SHIPPING_METHODS[method]["label"]},
                "shipping_cost": f"{checkout['shipping_cost']:.2f}",
                "total": f"{checkout['total']:.2f}",
            }
        )


# ---------------- Orders (Day 2 · Step 4) ----------------


def orders_for(user):
    qs = Order.objects.select_related("address", "user").prefetch_related(
        Prefetch("items", queryset=OrderItem.objects.select_related("product"))
    )
    # Customers only ever see their own orders; admins see everyone's.
    return qs if user.is_staff else qs.filter(user=user)


class OrderListCreateView(APIView):
    """
    GET  /api/orders/   order history — orders whose payment was received (paid, or
                        refunded). Unpaid or failed checkout attempts are not listed.
    POST /api/orders/   {shipping_method, payment_method, address | address_id, items?}
                        — create an order from the cart, or ("Buy now") from `items` only.
                        The order waits for payment; see /api/payments/.
    """

    def get(self, request):
        queryset = orders_for(request.user).filter(
            payment_status__in=[Order.PaymentStatus.PAID, Order.PaymentStatus.REFUNDED]
        )
        # ?status=shipped — filter by order status (used by the admin dashboard)
        status_filter = request.query_params.get("status")
        if status_filter in Order.Status.values:
            queryset = queryset.filter(status=status_filter)
        paginator = api_settings.DEFAULT_PAGINATION_CLASS()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = OrderSerializer(page, many=True, context={"request": request}).data
        return paginator.get_paginated_response(data)

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            checkout = prepare_buy_now(request, data) if data.get("items") else prepare_checkout(request, data)
        except CheckoutProblem as problem:
            return problem.response
        order = create_order(request, checkout)
        order = orders_for(request.user).get(pk=order.pk)
        return Response(
            OrderSerializer(order, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrderDetailView(APIView):
    """GET /api/orders/<id>/ — one order (owner or admin; others get 404)."""

    def get(self, request, pk):
        order = get_object_or_404(orders_for(request.user), pk=pk)
        return Response(OrderSerializer(order, context={"request": request}).data)


class OrderStatusUpdateView(APIView):
    """PATCH /api/orders/<id>/status/ {status} — admin only."""

    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        order = get_object_or_404(Order, pk=pk)
        serializer = OrderStatusUpdateSerializer(data=request.data, context={"order": order})
        serializer.is_valid(raise_exception=True)
        order.status = serializer.validated_data["status"]
        order.save(update_fields=["status", "updated_at"])
        order = orders_for(request.user).get(pk=order.pk)
        return Response(OrderSerializer(order, context={"request": request}).data)


# ---------------- Admin dashboard (Day 2 · Step 5) ----------------


class AdminStatsView(APIView):
    """GET /api/admin/stats/ — numbers for the admin dashboard (admin only)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        placed = Order.objects.filter(
            payment_status__in=[Order.PaymentStatus.PAID, Order.PaymentStatus.REFUNDED]
        )
        paid = Order.objects.filter(payment_status=Order.PaymentStatus.PAID)
        by_status = dict(placed.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
        products = Product.objects.aggregate(
            total=Count("id"),
            # every product that needs restocking (same rule as ?low_stock=true)
            low_stock=Count("id", filter=Q(stock_quantity__lte=LOW_STOCK_THRESHOLD)),
            out_of_stock=Count("id", filter=Q(stock_quantity=0)),
        )
        recent = orders_for(request.user).filter(pk__in=placed.values("pk"))[:5]
        return Response({
            "total_sales": f"{paid.aggregate(s=Sum('total_amount'))['s'] or 0:.2f}",
            "sales_count": paid.count(),
            "order_count": placed.count(),
            "open_orders": placed.filter(
                status__in=[Order.Status.PAID, Order.Status.PROCESSING, Order.Status.SHIPPED]
            ).count(),
            "orders_by_status": {code: by_status.get(code, 0) for code in Order.Status.values},
            "product_count": products["total"],
            "low_stock_count": products["low_stock"],
            "out_of_stock_count": products["out_of_stock"],
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
            "customer_count": get_user_model().objects.filter(is_staff=False).count(),
            "recent_orders": OrderSerializer(recent, many=True, context={"request": request}).data,
        })
