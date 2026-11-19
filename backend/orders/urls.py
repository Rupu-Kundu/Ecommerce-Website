from django.urls import path

from .views import CheckoutView, SavedAddressListView, ShippingMethodListView

urlpatterns = [
    path("", CheckoutView.as_view(), name="checkout"),
    path("shipping-methods/", ShippingMethodListView.as_view(), name="shipping-methods"),
    path("addresses/", SavedAddressListView.as_view(), name="saved-addresses"),
]
