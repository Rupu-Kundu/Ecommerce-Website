"""
Create the demo accounts for a local demo:

    python manage.py seed_demo_users

  demo_admin     (admin / staff — can use the Admin dashboard and Django admin)
  demo_customer  (normal customer)

Passwords come from DEMO_ADMIN_PASSWORD / DEMO_CUSTOMER_PASSWORD in the environment,
or default to the documented demo passwords. Existing accounts get their password reset.
Refuses to run when DJANGO_DEBUG is False (production) unless --force is given.
"""

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

DEFAULTS = {
    "demo_admin": ("DEMO_ADMIN_PASSWORD", "HaatboxAdmin#2026", True),
    "demo_customer": ("DEMO_CUSTOMER_PASSWORD", "HaatboxShop#2026", False),
}


class Command(BaseCommand):
    help = "Create demo admin and customer accounts (development / demo only)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Allow running with DEBUG=False.")

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError("Demo accounts are for local demos. Refusing to run with DEBUG=False (use --force).")
        User = get_user_model()
        for username, (env_name, default_pw, is_admin) in DEFAULTS.items():
            password = os.getenv(env_name, default_pw)
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@haatbox.example", "first_name": "Demo"},
            )
            user.is_staff = is_admin
            user.is_superuser = is_admin
            user.set_password(password)
            user.save()
            role = "admin" if is_admin else "customer"
            self.stdout.write(f"{'Created' if created else 'Updated'} {role}: {username} / {password}")
        self.stdout.write(self.style.SUCCESS("Demo accounts ready."))
