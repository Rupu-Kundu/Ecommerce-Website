from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Address
from cart.serializers import serialize_cart
from cart.services import cart_items, cart_subtotal, get_cart, sync_cart

from .serializers import AddressSerializer, CheckoutSerializer
from .shipping import SHIPPING_METHODS, shipping_cost, shipping_methods_payload


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

    Server-side checkout verification:
      1. Validate the shipping address and shipping method.
      2. Re-check the cart against current stock (removes/adjusts items).
         If anything changed → 409 with the updated cart so the user can review it.
      3. Recalculate prices from the database (client prices are never trusted).
      4. Save the address to the user's account.
    Returns the verified order summary. The order itself is created after payment (next step).
    """

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        cart = get_cart(request.user)
        with transaction.atomic():
            notices = sync_cart(cart)
            items = list(cart_items(cart))

            if not items:
                return Response(
                    {"detail": "Your cart is empty.", "cart": serialize_cart(cart, request, notices)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if notices:
                return Response(
                    {
                        "detail": "Your cart changed because of stock updates. Please review it.",
                        "cart": serialize_cart(cart, request, notices),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            address = data.get("address_obj") or self.save_address(request.user, data["address"])

        subtotal = cart_subtotal(items)
        method_code = data["shipping_method"]
        shipping = shipping_cost(method_code, subtotal)
        method = SHIPPING_METHODS[method_code]

        return Response(
            {
                "address": AddressSerializer(address).data,
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
                "subtotal": f"{subtotal:.2f}",
                "shipping_method": {"code": method_code, "label": method["label"]},
                "shipping_cost": f"{shipping:.2f}",
                "total": f"{subtotal + shipping:.2f}",
            }
        )

    @staticmethod
    def save_address(user, fields):
        """Reuse an identical saved address instead of creating duplicates."""
        existing = Address.objects.filter(user=user, **fields).first()
        if existing:
            return existing
        is_first = not Address.objects.filter(user=user).exists()
        return Address.objects.create(user=user, is_default=is_first, **fields)
