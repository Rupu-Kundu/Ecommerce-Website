"""URL configuration for the e-commerce backend."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts.admin_views import AdminCustomerDetailView, AdminCustomerListView
from orders.urls import order_urlpatterns
from orders.views import AdminStatsView
from payments.admin_views import AdminPaymentDetailView, AdminPaymentListView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('products.urls')),
    path('api/cart/', include('cart.urls')),
    path('api/checkout/', include('orders.urls')),
    path('api/orders/', include(order_urlpatterns)),
    path('api/payments/', include('payments.urls')),
    path('api/chat/', include('assistant.urls')),
    path('api/support/', include('support.urls')),
    path('api/admin/stats/', AdminStatsView.as_view(), name='admin-stats'),
    path('api/admin/customers/', AdminCustomerListView.as_view(), name='admin-customers'),
    path('api/admin/customers/<int:pk>/', AdminCustomerDetailView.as_view(), name='admin-customer-detail'),
    path('api/admin/payments/', AdminPaymentListView.as_view(), name='admin-payments'),
    path('api/admin/payments/<int:pk>/', AdminPaymentDetailView.as_view(), name='admin-payment-detail'),
]

# Serve uploaded media files during development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
