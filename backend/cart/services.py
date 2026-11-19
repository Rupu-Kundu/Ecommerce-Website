"""Cart helpers shared by the cart API and checkout."""

from decimal import Decimal

from .models import Cart


def get_cart(user):
    """Each user has exactly one cart, created on first use. It lives in the database,
    so it is preserved across logout/login and devices."""
    cart, _ = Cart.objects.get_or_create(user=user)
    return cart


def cart_items(cart):
    return cart.items.select_related("product", "product__category").order_by("added_at", "id")


def sync_cart(cart):
    """
    Bring the cart in line with current stock:
      - remove items whose product is unavailable or out of stock
      - lower quantities that exceed the stock now available
    Returns a list of human-readable notices describing what changed.
    """
    notices = []
    for item in cart_items(cart):
        product = item.product
        if not product.is_available or product.stock_quantity == 0:
            notices.append(f'"{product.name}" is no longer available and was removed from your cart.')
            item.delete()
        elif item.quantity > product.stock_quantity:
            notices.append(
                f'Only {product.stock_quantity} of "{product.name}" left in stock — quantity updated.'
            )
            item.quantity = product.stock_quantity
            item.save(update_fields=["quantity"])
    return notices


def cart_subtotal(items):
    """Subtotal from the products' CURRENT prices in the database (never from the client)."""
    return sum((item.product.price * item.quantity for item in items), Decimal("0.00"))
