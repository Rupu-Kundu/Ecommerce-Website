from django.db.models import Count
from rest_framework import filters, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsAdminOrReadOnly

from .models import LOW_STOCK_THRESHOLD, Category, Product
from .serializers import CategorySerializer, ProductSerializer


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET    /api/products/        list (public)  ?search= &category= &ordering= &page=
    POST   /api/products/        create (admin)
    GET    /api/products/<id>/   detail (public)
    PUT    /api/products/<id>/   update (admin)
    PATCH  /api/products/<id>/   partial update (admin)
    DELETE /api/products/<id>/   delete (admin)
    """

    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    # JSON for normal requests; multipart/form for image uploads
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description", "category__name"]
    ordering_fields = ["price", "created_at", "name", "stock_quantity"]
    ordering = ["-created_at"]

    def perform_update(self, serializer):
        old_image = serializer.instance.image.name if serializer.instance.image else None
        product = serializer.save()
        # A new photo was uploaded: remove the replaced file from disk.
        if old_image and product.image.name != old_image:
            product.image.storage.delete(old_image)

    def perform_destroy(self, instance):
        image = instance.image
        instance.delete()
        if image:
            image.delete(save=False)  # don't leave orphaned files in media/

    def get_queryset(self):
        qs = Product.objects.select_related("category")

        # Customers and guests only see available products; admins see everything.
        user = self.request.user
        if not (user.is_authenticated and user.is_staff):
            qs = qs.filter(is_available=True)

        # ?category=<id or slug>
        category = self.request.query_params.get("category")
        if category:
            if category.isdigit():
                qs = qs.filter(category_id=category)
            else:
                qs = qs.filter(category__slug=category)

        # ?low_stock=true — products at or below the low-stock threshold (admin dashboard)
        if self.request.query_params.get("low_stock") in ("1", "true"):
            qs = qs.filter(stock_quantity__lte=LOW_STOCK_THRESHOLD)
        return qs


class CategoryViewSet(viewsets.ModelViewSet):
    """
    GET    /api/categories/        all categories (public, not paginated)
    POST   /api/categories/        create (admin)
    PUT    /api/categories/<id>/   update (admin)
    DELETE /api/categories/<id>/   delete (admin) — refused while products use it
    """

    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count("products")).order_by("name")

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.products.exists():
            return Response(
                {"detail": f'"{category.name}" still has products. Move or delete them first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
