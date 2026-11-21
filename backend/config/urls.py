"""URL configuration for the e-commerce backend."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from orders.urls import order_urlpatterns
from orders.views import AdminStatsView

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
]

# Serve uploaded media files during development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
