from django.utils.text import slugify
from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    # Optional when creating: generated from the name if left empty.
    slug = serializers.SlugField(max_length=120, required=False, allow_blank=True)
    product_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "description", "product_count")

    def validate(self, attrs):
        if not attrs.get("slug") and attrs.get("name"):
            attrs["slug"] = slugify(attrs["name"])[:120]
        slug = attrs.get("slug")
        if slug:
            clash = Category.objects.filter(slug=slug)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"slug": "A category with this slug already exists."})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    # Write with a category id; read back the category's name and slug too.
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)

    class Meta:
        model = Product
        fields = (
            "id", "name", "description",
            "category", "category_name", "category_slug",
            "price", "stock_quantity", "image", "is_available",
            "created_at", "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def to_internal_value(self, data):
        # In multipart/form data (used for image uploads) DRF treats a missing boolean
        # like an unchecked checkbox, i.e. False. New products should default to available.
        if not self.partial and hasattr(data, "getlist") and "is_available" not in data:
            data = data.copy()
            data["is_available"] = True
        return super().to_internal_value(data)

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than 0.")
        return value
