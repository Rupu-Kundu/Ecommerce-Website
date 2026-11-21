from django.utils.text import slugify
from rest_framework import serializers

from .models import Category, Product, ProductImage, Review


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


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "position")
        read_only_fields = ("id", "position")


class ProductSerializer(serializers.ModelSerializer):
    # Write with a category id; read back the category's name and slug too.
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)  # extra gallery photos
    average_rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id", "name", "brand", "description", "specifications",
            "category", "category_name", "category_slug",
            "price", "stock_quantity", "image", "images", "is_available",
            "average_rating", "rating_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    # Ratings come from queryset annotations (list/detail); computed when missing (create/update).
    def get_average_rating(self, obj):
        avg = getattr(obj, "average_rating", None)
        if not hasattr(obj, "average_rating"):
            from django.db.models import Avg
            avg = obj.reviews.aggregate(a=Avg("rating"))["a"]
        return round(float(avg), 1) if avg is not None else None

    def get_rating_count(self, obj):
        return obj.rating_count if hasattr(obj, "rating_count") else obj.reviews.count()

    def validate_specifications(self, value):
        """[{"label": "...", "value": "..."}] — max 20 rows (a JSON string is accepted from forms)."""
        if isinstance(value, str):
            import json
            try:
                value = json.loads(value or "[]")
            except ValueError:
                raise serializers.ValidationError("Specifications must be a list of {label, value}.")
        if not isinstance(value, list) or len(value) > 20:
            raise serializers.ValidationError("Use up to 20 rows of {label, value}.")
        clean = []
        for row in value:
            if not isinstance(row, dict):
                raise serializers.ValidationError("Each row needs a label and a value.")
            label, val = str(row.get("label", "")).strip(), str(row.get("value", "")).strip()
            if not label or not val:
                continue  # skip empty rows from the form
            if len(label) > 60 or len(val) > 200:
                raise serializers.ValidationError("Labels can be 60 characters and values 200 characters at most.")
            clean.append({"label": label, "value": val})
        return clean

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


class ReviewSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    verified_purchase = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ("id", "rating", "comment", "author", "verified_purchase", "is_mine", "created_at", "updated_at")
        read_only_fields = ("id", "author", "verified_purchase", "is_mine", "created_at", "updated_at")
        extra_kwargs = {"rating": {"min_value": 1, "max_value": 5}, "comment": {"max_length": 1000}}

    def get_author(self, obj):
        return obj.user.first_name or obj.user.username

    def get_verified_purchase(self, obj):
        buyers = self.context.get("buyers")
        return obj.user_id in buyers if buyers is not None else False

    def get_is_mine(self, obj):
        user = self.context.get("request").user if self.context.get("request") else None
        return bool(user and user.is_authenticated and obj.user_id == user.id)
