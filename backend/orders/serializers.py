import re

from rest_framework import serializers

from accounts.models import Address

from .shipping import SHIPPING_METHODS

PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-()]{5,18}[0-9]$")
POSTAL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\s\-]{1,9}$")


class AddressSerializer(serializers.ModelSerializer):
    """Shipping address + delivery contact (recipient name and phone)."""

    class Meta:
        model = Address
        fields = (
            "id", "recipient_name", "phone", "street_address",
            "city", "postal_code", "country",
        )
        read_only_fields = ("id",)

    # Note: DRF CharFields already trim whitespace and reject blank values.

    def validate_recipient_name(self, value):
        if len(value) < 2:
            raise serializers.ValidationError("Enter the recipient's full name.")
        return value

    def validate_phone(self, value):
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number (digits, optional +, spaces or dashes).")
        return value

    def validate_postal_code(self, value):
        if not POSTAL_RE.match(value):
            raise serializers.ValidationError("Enter a valid postal code.")
        return value


class BuyNowItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)


class CheckoutSerializer(serializers.Serializer):
    """
    Either pick a saved address (address_id) or send a new one (address).
    `items` (optional) = "Buy now": order just these products instead of the cart.
    """

    address_id = serializers.IntegerField(required=False)
    address = AddressSerializer(required=False)
    shipping_method = serializers.ChoiceField(choices=list(SHIPPING_METHODS.keys()))
    payment_method = serializers.ChoiceField(choices=["card", "bkash", "nagad"], default="card")
    items = BuyNowItemSerializer(many=True, required=False, allow_empty=False, max_length=1)

    def validate(self, attrs):
        has_id = "address_id" in attrs
        has_new = "address" in attrs
        if has_id == has_new:
            raise serializers.ValidationError(
                {"address": "Provide either a saved address_id or a new address."}
            )
        if has_id:
            user = self.context["request"].user
            address = Address.objects.filter(pk=attrs["address_id"], user=user).first()
            if address is None:
                raise serializers.ValidationError({"address_id": "Address not found."})
            attrs["address_obj"] = address
        return attrs

    def validate_payment_method(self, value):
        from payments.gateway import METHOD_LABELS, provider_for  # avoid circular import

        if provider_for(value) is None:
            raise serializers.ValidationError(f"{METHOD_LABELS[value]} payments are not available right now.")
        return value


# ---------------- Orders ----------------

from .models import Order, OrderItem  # noqa: E402
from .shipping import SHIPPING_METHODS as _METHODS  # noqa: E402


class OrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product.id", read_only=True, default=None)
    image = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ("id", "product_id", "product_name", "price", "quantity", "line_total", "image")

    def get_line_total(self, obj):
        return f"{obj.price * obj.quantity:.2f}"

    def get_image(self, obj):
        if obj.product and obj.product.image:
            request = self.context.get("request")
            url = obj.product.image.url
            return request.build_absolute_uri(url) if request else url
        return None


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    address = AddressSerializer(read_only=True)
    shipping_method_label = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    payment_status_label = serializers.CharField(source="get_payment_status_display", read_only=True)
    payment_method_label = serializers.CharField(source="get_payment_method_display", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "status", "status_label", "payment_status", "payment_status_label",
            "payment_method", "payment_method_label", "from_cart",
            "subtotal", "shipping_method", "shipping_method_label", "shipping_cost", "total_amount",
            "item_count", "items", "address", "customer", "created_at", "updated_at",
        )
        read_only_fields = fields

    def get_shipping_method_label(self, obj):
        return _METHODS.get(obj.shipping_method, {}).get("label", obj.shipping_method)

    def get_item_count(self, obj):
        return sum(item.quantity for item in obj.items.all())

    def get_customer(self, obj):
        return {"id": obj.user_id, "username": obj.user.username, "email": obj.user.email}


# Order statuses that only make sense once the payment has been received.
REQUIRES_PAYMENT = {
    Order.Status.PAID, Order.Status.PROCESSING, Order.Status.SHIPPED, Order.Status.DELIVERED,
}


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)

    def validate_status(self, value):
        order = self.context["order"]
        if value == Order.Status.PENDING:
            raise serializers.ValidationError("An order cannot be moved back to pending.")
        if value in REQUIRES_PAYMENT and order.payment_status != Order.PaymentStatus.PAID:
            raise serializers.ValidationError(
                f"Order #{order.pk} is not paid; it cannot be marked {value}."
            )
        return value
