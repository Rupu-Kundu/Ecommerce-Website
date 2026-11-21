"""
Tools the Haatbox assistant can call. Each request gets its own set, bound to the
current user, so order and cart tools can only ever touch that user's data.

Tool inputs come from the model and are treated as untrusted: every value is
validated here, and all business rules (availability, stock, ownership) are the
same ones the regular API enforces.
"""

import json

from django.conf import settings

from anthropic import beta_tool
from django.db import transaction
from django.db.models import Q

from cart.models import Cart, CartItem
from cart.services import get_cart
from orders.models import Order
from orders.shipping import shipping_methods_payload
from payments.gateway import payment_methods_payload
from products.models import Category, Product

MAX_RESULTS = 8
STORE_LOCATION = {
    "name": "Haatbox Experience Centre",
    "address": "House 12, Road 5, Dhanmondi, Dhaka 1205",
    "hours": "Sat–Thu 9 AM–9 PM",
    "map_link": "/help#visit",
}
MAX_QUANTITY = 99


def _product_summary(p):
    return {
        "id": p.id,
        "name": p.name,
        "price_bdt": f"{p.price:.0f}",
        "category": p.category.name,
        "in_stock": p.stock_quantity > 0 and p.is_available,
        "brand": p.brand,
        "stock_quantity": p.stock_quantity,
        "link": f"/products/{p.id}",
    }


def _as_json(data):
    return json.dumps(data, ensure_ascii=False)


def build_tools(user):
    """
    Return (tools, state). `state["cart_updated"]` becomes True if the cart changed;
    `state["handoff"]` becomes True when the customer should be offered a person (live chat).
    """
    state = {"cart_updated": False, "handoff": False}
    logged_in = bool(user and user.is_authenticated)

    @beta_tool
    def search_products(query: str = "", category: str = "", max_price_bdt: int = 0, sort: str = "relevance") -> str:
        """Search the Haatbox catalogue. Only products that are currently for sale are returned.

        Args:
            query: Words to look for in the product name, description or category (English). Empty = any product.
            category: Optional category slug from list_categories (e.g. "electronics"). Empty = all categories.
            max_price_bdt: Optional highest price in Bangladeshi Taka. 0 = no limit.
            sort: "relevance", "price_low", "price_high" or "newest".
        """
        qs = Product.objects.select_related("category").filter(is_available=True)
        for word in str(query).split()[:6]:
            qs = qs.filter(Q(name__icontains=word) | Q(description__icontains=word) | Q(category__name__icontains=word))
        if category:
            qs = qs.filter(category__slug=str(category).strip().lower())
        if isinstance(max_price_bdt, int) and max_price_bdt > 0:
            qs = qs.filter(price__lte=max_price_bdt)
        order = {"price_low": "price", "price_high": "-price", "newest": "-created_at"}.get(sort, "name")
        products = list(qs.order_by(order)[:MAX_RESULTS])
        return _as_json({"count": len(products), "products": [_product_summary(p) for p in products]})

    @beta_tool
    def list_categories() -> str:
        """List all product categories with their slugs and how many products each has."""
        cats = Category.objects.order_by("name")
        return _as_json([
            {"name": c.name, "slug": c.slug, "products": c.products.filter(is_available=True).count()} for c in cats
        ])

    @beta_tool
    def get_product(product_id: int) -> str:
        """Get full details of one product (description, price, stock).

        Args:
            product_id: The product id from search_products.
        """
        p = Product.objects.select_related("category").filter(pk=product_id, is_available=True).first()
        if p is None:
            return _as_json({"error": "Product not found or not for sale."})
        from django.db.models import Avg, Count
        stats = p.reviews.aggregate(avg=Avg("rating"), n=Count("id"))
        return _as_json({
            **_product_summary(p), "description": p.description, "details": p.specifications,
            "rating": round(stats["avg"], 1) if stats["avg"] else None, "rating_count": stats["n"],
            "photos": 1 + p.images.count() if p.image else p.images.count(),
        })

    @beta_tool
    def get_store_info() -> str:
        """Store policies: shipping methods and costs, payment methods (Card, bKash, Nagad, Cash on delivery), returns, currency."""
        return _as_json({
            "currency": "BDT (৳)",
            "shipping": shipping_methods_payload(),
            "payment_methods": [
                {"method": m["label"], "available": m["available"], "test_mode": m["demo"]}
                for m in payment_methods_payload()
            ],
            "cash_on_delivery": f"Choose COD at checkout and pay the rider in cash (orders up to ৳{settings.COD_MAX_AMOUNT:,.0f}).",
            "returns": "Unused items in original packaging can be returned within 7 days of delivery via support.",
            "delivery_area": "All of Bangladesh",
            "buy_now": "Every product has a 'Buy now' button that checks out just that item.",
            "support": "Live chat with the Haatbox team (Sat–Thu 9 AM–9 PM) or support@haatbox.com.bd",
            "store_location": STORE_LOCATION,
        })

    @beta_tool
    def get_my_orders(limit: int = 5) -> str:
        """The logged-in customer's recent orders (payment received), newest first.

        Args:
            limit: How many orders to return (1-10).
        """
        if not logged_in:
            return _as_json({"error": "The customer is not logged in. Ask them to log in to see their orders."})
        limit = max(1, min(int(limit or 5), 10))
        orders = Order.objects.filter(
            user=user, payment_status__in=Order.PLACED_PAYMENT_STATUSES
        ).prefetch_related("items")[:limit]
        return _as_json([
            {
                "order_id": o.id,
                "date": o.created_at.strftime("%d %b %Y"),
                "status": o.get_status_display(),
                "payment": f"{o.get_payment_status_display()} via {o.get_payment_method_display()}",
                "total_bdt": f"{o.total_amount:.0f}",
                "items": [f"{i.quantity} × {i.product_name}" for i in o.items.all()],
                "link": f"/orders/{o.id}",
            }
            for o in orders
        ])

    @beta_tool
    def add_to_cart(product_id: int, quantity: int = 1) -> str:
        """Add a product to the logged-in customer's cart. Only call this when the customer clearly asked to add it.

        Args:
            product_id: The product id from search_products.
            quantity: How many to add (1-99).
        """
        if not logged_in:
            return _as_json({"error": "The customer is not logged in. Ask them to log in, then try again."})
        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return _as_json({"error": "Quantity must be a whole number."})
        if not 1 <= quantity <= MAX_QUANTITY:
            return _as_json({"error": "Quantity must be between 1 and 99."})
        cart = get_cart(user)
        with transaction.atomic():
            Cart.objects.select_for_update().get(pk=cart.pk)
            product = Product.objects.filter(pk=product_id, is_available=True).first()
            if product is None or product.stock_quantity == 0:
                return _as_json({"error": "That product is not available."})
            item = CartItem.objects.filter(cart=cart, product=product).first()
            current = item.quantity if item else 0
            if current + quantity > product.stock_quantity:
                return _as_json({"error": f"Only {product.stock_quantity} in stock; the cart already has {current}."})
            if item:
                item.quantity = current + quantity
                item.save(update_fields=["quantity"])
            else:
                CartItem.objects.create(cart=cart, product=product, quantity=quantity)
        state["cart_updated"] = True
        total = sum(i.quantity for i in cart.items.all())
        return _as_json({"added": f"{quantity} × {product.name}", "items_in_cart": total, "cart_link": "/cart"})

    @beta_tool
    def request_human_agent(reason: str = "") -> str:
        """Offer the customer a live chat with a person on the Haatbox team.

        Call this when the customer asks for a human/agent/representative, has a complaint,
        or has a problem you cannot solve (a wrong or damaged item, a refund, a payment that
        went through but no order, changing an order or address).

        Args:
            reason: A few words on what the customer needs help with.
        """
        state["handoff"] = True
        return _as_json({
            "ok": True,
            "note": "A 'Chat with our team' button is now shown under your reply. Tell the customer to tap it; "
                    "this conversation will be shared with the team so they don't have to repeat themselves. "
                    "The team is online Sat–Thu 9 AM–9 PM and replies within a few minutes in those hours.",
        })

    tools = [search_products, list_categories, get_product, get_store_info, get_my_orders, add_to_cart, request_human_agent]
    return tools, state
