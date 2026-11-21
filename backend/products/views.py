from django.db.models import Avg, Count, FloatField, Max, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsAdminOrReadOnly

from .models import LOW_STOCK_THRESHOLD, MAX_EXTRA_IMAGES, Category, Product, ProductImage, Review
from .serializers import CategorySerializer, ProductImageSerializer, ProductSerializer, ReviewSerializer

MAX_REVIEWS_SHOWN = 50


def buyers_of(product):
    """Ids of customers who have a paid order containing this product (verified purchase)."""
    from orders.models import Order, OrderItem  # orders depends on products

    return set(OrderItem.objects.filter(
        product=product, order__payment_status=Order.PaymentStatus.PAID
    ).values_list("order__user_id", flat=True))


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET    /api/products/        list (public)  ?search= &category= &ordering= &page=
                                 ordering: price, -price, name, -created_at, -rating_score (top rated)
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
    search_fields = ["name", "brand", "description", "category__name"]
    ordering_fields = ["price", "created_at", "name", "stock_quantity", "rating_score"]
    ordering = ["-created_at"]

    def perform_update(self, serializer):
        old_image = serializer.instance.image.name if serializer.instance.image else None
        product = serializer.save()
        # A new photo was uploaded: remove the replaced file from disk.
        if old_image and product.image.name != old_image:
            product.image.storage.delete(old_image)

    def perform_destroy(self, instance):
        image = instance.image
        extra = [img.image for img in instance.images.all()]
        instance.delete()
        if image:
            image.delete(save=False)  # don't leave orphaned files in media/
        for file in extra:
            file.delete(save=False)

    def get_queryset(self):
        qs = (
            Product.objects.select_related("category")
            .prefetch_related("images")
            .annotate(
                average_rating=Avg("reviews__rating"),
                rating_count=Count("reviews", distinct=True),
                rating_score=Coalesce(Avg("reviews__rating"), Value(0.0), output_field=FloatField()),
            )
        )

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

    # ---------- gallery photos (admin) ----------

    @action(detail=True, methods=["post"], url_path="images", permission_classes=[IsAdmin],
            parser_classes=[MultiPartParser, FormParser])
    def add_image(self, request, pk=None):
        """POST /api/products/<id>/images/  (multipart: image, alt_text?) — add a gallery photo."""
        product = self.get_object()
        if product.images.count() >= MAX_EXTRA_IMAGES:
            return Response({"detail": f"A product can have up to {MAX_EXTRA_IMAGES} extra photos."},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = ProductImageSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        position = (product.images.aggregate(m=Max("position"))["m"] or 0) + 1
        serializer.save(product=product, position=position)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"images/(?P<image_id>\d+)", permission_classes=[IsAdmin])
    def remove_image(self, request, pk=None, image_id=None):
        """DELETE /api/products/<id>/images/<image_id>/ — remove a gallery photo (and its file)."""
        photo = get_object_or_404(ProductImage, pk=image_id, product_id=pk)
        file = photo.image
        photo.delete()
        file.delete(save=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---------- ratings & reviews ----------

    def get_permissions(self):
        if self.action == "reviews":
            return [AllowAny()] if self.request.method == "GET" else [IsAuthenticated()]
        if self.action == "delete_review":
            return [IsAuthenticated()]
        return super().get_permissions()

    @action(detail=True, methods=["get", "post"])
    def reviews(self, request, pk=None):
        """
        GET  /api/products/<id>/reviews/ → {summary: {average, count, distribution}, my_review, results}
        POST /api/products/<id>/reviews/ {rating 1-5, comment?} — add or update your review (login required)
        """
        product = self.get_object()
        buyers = buyers_of(product)
        context = {"request": request, "buyers": buyers}
        if request.method == "POST":
            mine = Review.objects.filter(product=product, user=request.user).first()
            serializer = ReviewSerializer(mine, data=request.data, context=context)
            serializer.is_valid(raise_exception=True)
            serializer.save(product=product, user=request.user)
            return Response(serializer.data, status=status.HTTP_200_OK if mine else status.HTTP_201_CREATED)

        reviews = product.reviews.select_related("user")
        stats = reviews.aggregate(average=Avg("rating"), count=Count("id"))
        distribution = {str(n): 0 for n in range(5, 0, -1)}
        for row in reviews.values("rating").annotate(n=Count("id")):
            distribution[str(row["rating"])] = row["n"]
        mine = reviews.filter(user=request.user).first() if request.user.is_authenticated else None
        return Response({
            "summary": {
                "average": round(stats["average"], 1) if stats["average"] is not None else None,
                "count": stats["count"],
                "distribution": distribution,
            },
            "my_review": ReviewSerializer(mine, context=context).data if mine else None,
            "results": ReviewSerializer(reviews[:MAX_REVIEWS_SHOWN], many=True, context=context).data,
        })

    @action(detail=True, methods=["delete"], url_path=r"reviews/(?P<review_id>\d+)")
    def delete_review(self, request, pk=None, review_id=None):
        """DELETE /api/products/<id>/reviews/<review_id>/ — your own review, or any review (admin)."""
        review = get_object_or_404(Review, pk=review_id, product_id=pk)
        if review.user_id != request.user.id and not request.user.is_staff:
            return Response({"detail": "You can only delete your own review."}, status=status.HTTP_403_FORBIDDEN)
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
