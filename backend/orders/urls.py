from django.urls import path

from .views import (
    CheckoutView,
    OrderCancelView,
    OrderDetailView,
    OrderListCreateView,
    OrderStatusUpdateView,
    SavedAddressListView,
    ShippingMethodListView,
)

# Mounted at /api/checkout/
checkout_urlpatterns = [
    path("", CheckoutView.as_view(), name="checkout"),
    path("shipping-methods/", ShippingMethodListView.as_view(), name="shipping-methods"),
    path("addresses/", SavedAddressListView.as_view(), name="saved-addresses"),
]

# Mounted at /api/orders/
order_urlpatterns = [
    path("", OrderListCreateView.as_view(), name="order-list"),
    path("<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("<int:pk>/status/", OrderStatusUpdateView.as_view(), name="order-status"),
    path("<int:pk>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
]

urlpatterns = checkout_urlpatterns
