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


class CheckoutSerializer(serializers.Serializer):
    """Either pick a saved address (address_id) or send a new one (address)."""

    address_id = serializers.IntegerField(required=False)
    address = AddressSerializer(required=False)
    shipping_method = serializers.ChoiceField(choices=list(SHIPPING_METHODS.keys()))

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
