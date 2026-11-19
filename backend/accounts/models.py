from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user. Admins are users with is_staff=True; everyone else is a customer."""

    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.username


class Address(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses"
    )
    recipient_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    street_address = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "addresses"
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        return f"{self.recipient_name}, {self.street_address}, {self.city}"
