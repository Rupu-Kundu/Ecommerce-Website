from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import Product

from .models import Cart, CartItem
from .serializers import AddToCartSerializer, UpdateCartItemSerializer, serialize_cart
from .services import get_cart, sync_cart

# All cart endpoints require login (DEFAULT_PERMISSION_CLASSES = IsAuthenticated).


def stock_error(product, already_in_cart=0):
    msg = f'Only {product.stock_quantity} of "{product.name}" in stock.'
    if already_in_cart:
        msg += f" You already have {already_in_cart} in your cart."
    return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class CartView(APIView):
    """GET /api/cart/ — the user's cart. Unavailable items are removed automatically."""

    def get(self, request):
        cart = get_cart(request.user)
        notices = sync_cart(cart)
        return Response(serialize_cart(cart, request, notices))


class CartItemCreateView(APIView):
    """POST /api/cart/items/ {product_id, quantity} — add a product (adds to existing quantity)."""

    def post(self, request):
        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_id = serializer.validated_data["product_id"]
        quantity = serializer.validated_data["quantity"]

        cart = get_cart(request.user)
        with transaction.atomic():
            # Lock the cart row so two quick clicks can't create inconsistent quantities.
            Cart.objects.select_for_update().get(pk=cart.pk)
            product = Product.objects.filter(pk=product_id, is_available=True).first()
            if product is None or product.stock_quantity == 0:
                return Response(
                    {"detail": "This product is not available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            item = CartItem.objects.filter(cart=cart, product=product).first()
            current = item.quantity if item else 0
            if current + quantity > product.stock_quantity:
                return stock_error(product, already_in_cart=current)

            if item:
                item.quantity = current + quantity
                item.save(update_fields=["quantity"])
            else:
                CartItem.objects.create(cart=cart, product=product, quantity=quantity)

        return Response(serialize_cart(cart, request), status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    """
    PATCH  /api/cart/items/<id>/ {quantity} — set quantity (increase or decrease)
    DELETE /api/cart/items/<id>/            — remove the item
    Users can only touch items in their own cart (others get 404).
    """

    def get_item(self, request, pk):
        return get_object_or_404(
            CartItem.objects.select_related("product", "cart"), pk=pk, cart__user=request.user
        )

    def patch(self, request, pk):
        item = self.get_item(request, pk)
        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity"]

        product = item.product
        if not product.is_available or product.stock_quantity == 0:
            return Response(
                {"detail": "This product is no longer available."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if quantity > product.stock_quantity:
            return stock_error(product)

        item.quantity = quantity
        item.save(update_fields=["quantity"])
        return Response(serialize_cart(item.cart, request))

    def delete(self, request, pk):
        item = self.get_item(request, pk)
        cart = item.cart
        item.delete()
        return Response(serialize_cart(cart, request))
