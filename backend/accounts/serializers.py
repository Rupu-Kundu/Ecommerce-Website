from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Public view of a user. `role` is 'admin' for staff, otherwise 'customer'."""

    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "phone", "role")
        read_only_fields = fields

    def get_role(self, obj):
        return "admin" if obj.is_staff else "customer"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = (
            "username", "email", "first_name", "last_name", "phone",
            "password", "password_confirm",
        )
        extra_kwargs = {"email": {"required": True}}

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        # Run Django's password rules (length, common passwords, etc.)
        candidate = User(username=attrs.get("username"), email=attrs.get("email"))
        validate_password(attrs["password"], user=candidate)
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        # New sign-ups are always customers; admins are created via createsuperuser/admin.
        return User.objects.create_user(password=password, **validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    """Standard JWT login that also returns the user's profile."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


# ---------------- Admin: customers ----------------


class AdminCustomerSerializer(serializers.ModelSerializer):
    """One row of the admin customer list (numbers come from queryset annotations)."""

    full_name = serializers.SerializerMethodField()
    orders_count = serializers.IntegerField(read_only=True)
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    last_order_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "full_name", "phone", "is_active",
            "date_joined", "last_login", "orders_count", "total_spent", "last_order_at",
        )
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()
