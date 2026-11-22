"""
Sales analytics for the admin dashboard (used by GET /api/admin/stats/?days=7|30|90).

A period is the last N calendar days in Bangladesh time, including today; it is compared
with the N days just before it. Definitions (all from real database rows):

  revenue          = sum of order totals with payment received (payment_status "paid";
                     a cash-on-delivery order counts once it is delivered)
  orders           = orders really placed (paid, refunded, or confirmed cash on delivery)
  average order    = revenue / number of paid orders
  new customers    = non-staff accounts created in the period
  new products     = products added in the period
"""

from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from products.models import Product

from .models import Order, OrderItem

LOCAL_TZ = ZoneInfo("Asia/Dhaka")
ALLOWED_DAYS = (7, 30, 90)
DEFAULT_DAYS = 30
TOP_PRODUCTS = 5


def period_bounds(days, now=None):
    """→ (start, end, previous_start) as aware datetimes; end is exclusive (tomorrow 00:00 local)."""
    today = (now or timezone.now()).astimezone(LOCAL_TZ).date()
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=LOCAL_TZ)
    start = end - timedelta(days=days)
    return start, end, start - timedelta(days=days)


def change_pct(current, previous):
    """% change vs the previous period; None when there is nothing to compare with."""
    current, previous = Decimal(current or 0), Decimal(previous or 0)
    if previous == 0:
        return None
    return round(float((current - previous) / previous * 100), 1)


def _kpi(current, previous, money=False):
    fmt = (lambda v: f"{Decimal(v or 0):.2f}") if money else (lambda v: int(v or 0))
    return {"value": fmt(current), "previous": fmt(previous), "change_pct": change_pct(current, previous)}


def _totals(orders):
    paid = orders.filter(payment_status=Order.PaymentStatus.PAID)
    agg = paid.aggregate(revenue=Sum("total_amount"), n=Count("id"))
    revenue = agg["revenue"] or Decimal("0")
    return {
        "revenue": revenue,
        "paid": agg["n"],
        "orders": orders.count(),
        "aov": (revenue / agg["n"]) if agg["n"] else Decimal("0"),
    }


def build_period_stats(days, now=None, request=None):
    start, end, prev_start = period_bounds(days, now)
    placed = Order.objects.filter(payment_status__in=Order.PLACED_PAYMENT_STATUSES)
    current = placed.filter(created_at__gte=start, created_at__lt=end)
    previous = placed.filter(created_at__gte=prev_start, created_at__lt=start)
    cur, prev = _totals(current), _totals(previous)

    customers = get_user_model().objects.filter(is_staff=False)
    new_customers = customers.filter(date_joined__gte=start, date_joined__lt=end).count()
    prev_customers = customers.filter(date_joined__gte=prev_start, date_joined__lt=start).count()
    new_products = Product.objects.filter(created_at__gte=start, created_at__lt=end).count()
    prev_products = Product.objects.filter(created_at__gte=prev_start, created_at__lt=start).count()

    # One row per day (zero-filled) for the trend chart.
    by_day = {
        row["day"]: row
        for row in current.annotate(day=TruncDate("created_at", tzinfo=LOCAL_TZ)).values("day").annotate(orders=Count("id"))
    }
    paid_by_day = {
        row["day"]: row["revenue"]
        for row in current.filter(payment_status=Order.PaymentStatus.PAID)
        .annotate(day=TruncDate("created_at", tzinfo=LOCAL_TZ)).values("day").annotate(revenue=Sum("total_amount"))
    }
    first_day = start.astimezone(LOCAL_TZ).date()
    daily = []
    for i in range(days):
        day = first_day + timedelta(days=i)
        daily.append({
            "date": day.isoformat(),
            "revenue": f"{paid_by_day.get(day) or 0:.2f}",
            "orders": by_day.get(day, {}).get("orders", 0),
        })

    status_counts = dict(current.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
    methods = {
        row["payment_method"]: row
        for row in current.values("payment_method").annotate(
            orders=Count("id"),
        )
    }
    method_revenue = dict(
        current.filter(payment_status=Order.PaymentStatus.PAID)
        .values_list("payment_method").annotate(r=Sum("total_amount")).values_list("payment_method", "r")
    )
    top = (
        OrderItem.objects.filter(order__in=current.filter(payment_status=Order.PaymentStatus.PAID))
        .values("product_id", "product_name")
        .annotate(units=Sum("quantity"), revenue=Sum(F("price") * F("quantity")))
        .order_by("-revenue", "product_name")[:TOP_PRODUCTS]
    )
    images = {p.pk: p.image for p in Product.objects.filter(pk__in=[t["product_id"] for t in top if t["product_id"]])}

    def image_url(product_id):
        image = images.get(product_id)
        if not image:
            return None
        return request.build_absolute_uri(image.url) if request else image.url

    return {
        "period": {
            "days": days,
            "start": first_day.isoformat(),
            "end": (end.astimezone(LOCAL_TZ).date() - timedelta(days=1)).isoformat(),
            "previous_start": prev_start.astimezone(LOCAL_TZ).date().isoformat(),
            "previous_end": (first_day - timedelta(days=1)).isoformat(),
        },
        "kpis": {
            "revenue": _kpi(cur["revenue"], prev["revenue"], money=True),
            "orders": _kpi(cur["orders"], prev["orders"]),
            "average_order_value": _kpi(cur["aov"], prev["aov"], money=True),
            "paid_orders": _kpi(cur["paid"], prev["paid"]),
            "new_customers": _kpi(new_customers, prev_customers),
            "new_products": _kpi(new_products, prev_products),
        },
        "daily": daily,
        "status_breakdown": {code: status_counts.get(code, 0) for code in Order.Status.values if code != Order.Status.PENDING},
        "payment_methods": [
            {
                "method": code,
                "label": label,
                "orders": methods.get(code, {}).get("orders", 0),
                "revenue": f"{method_revenue.get(code) or 0:.2f}",
            }
            for code, label in Order.PaymentMethod.choices
        ],
        "top_products": [
            {
                "product_id": t["product_id"],
                "name": t["product_name"],
                "quantity": t["units"],
                "revenue": f"{t['revenue']:.2f}",
                "image": image_url(t["product_id"]),
            }
            for t in top
        ],
    }
