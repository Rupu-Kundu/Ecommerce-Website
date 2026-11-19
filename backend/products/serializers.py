from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "description")


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
