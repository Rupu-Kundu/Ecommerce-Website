from rest_framework import filters, generics, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny

from accounts.permissions import IsAdminOrReadOnly

from .models import Category, Product
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
    ordering_fields = ["price", "created_at", "name"]
    ordering = ["-created_at"]

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
        return qs


class CategoryListView(generics.ListAPIView):
    """GET /api/categories/ — all categories (public, not paginated)."""

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    pagination_class = None
