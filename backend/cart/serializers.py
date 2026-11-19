from rest_framework import serializers

from products.models import Product

from .models import CartItem
from .services import cart_items, cart_subtotal

MAX_QUANTITY_PER_ITEM = 99


class CartProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "price", "image", "stock_quantity", "is_available", "category_name")


class CartItemSerializer(serializers.ModelSerializer):
    product = CartProductSerializer(read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ("id", "product", "quantity", "line_total")

    def get_line_total(self, obj):
        return f"{obj.product.price * obj.quantity:.2f}"


def serialize_cart(cart, request, notices=None):
    """Full cart payload returned by every cart endpoint."""
    items = list(cart_items(cart))
    return {
        "id": cart.id,
        "items": CartItemSerializer(items, many=True, context={"request": request}).data,
        "total_items": sum(item.quantity for item in items),
        "subtotal": f"{cart_subtotal(items):.2f}",
        "notices": notices or [],
    }


class AddToCartSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY_PER_ITEM, default=1)


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY_PER_ITEM)
