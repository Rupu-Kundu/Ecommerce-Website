"""Role-based permissions. Admin = user with is_staff=True; everyone else is a customer."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    """Only admin users."""

    message = "Admin access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsAdminOrReadOnly(BasePermission):
    """Anyone can read (GET/HEAD/OPTIONS); only admins can create, update, or delete."""

    message = "Admin access required."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
