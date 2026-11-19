from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Address, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "first_name", "last_name", "is_staff", "is_active")
    fieldsets = BaseUserAdmin.fieldsets + (("Contact", {"fields": ("phone",)}),)
    add_fieldsets = BaseUserAdmin.add_fieldsets + (("Contact", {"fields": ("email", "phone")}),)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("recipient_name", "user", "city", "country", "is_default")
    list_filter = ("country", "is_default")
    search_fields = ("recipient_name", "user__username", "city", "postal_code")
