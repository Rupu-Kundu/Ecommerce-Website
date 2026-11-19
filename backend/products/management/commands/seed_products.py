"""
Create sample categories and products for development.

Usage:
    python manage.py seed_products

Safe to run more than once: existing records (matched by name) are left alone.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Category, Product

CATEGORIES = [
    ("Electronics", "electronics", "Phones, laptops, and gadgets."),
    ("Clothing", "clothing", "Shirts, pants, and everyday wear."),
    ("Books", "books", "Fiction, non-fiction, and study guides."),
    ("Home & Kitchen", "home-kitchen", "Cookware, decor, and home essentials."),
]

# (name, category slug, price, stock, description)
PRODUCTS = [
    ("Wireless Earbuds", "electronics", "49.99", 40, "Bluetooth earbuds with charging case."),
    ("Smartphone X10", "electronics", "399.00", 15, "6.5-inch display, 128 GB storage."),
    ("Laptop Pro 14", "electronics", "899.00", 8, "14-inch laptop, 16 GB RAM, 512 GB SSD."),
    ("USB-C Charger 65W", "electronics", "24.50", 60, "Fast charger for phones and laptops."),
    ("Cotton T-Shirt", "clothing", "12.99", 100, "Soft 100% cotton crew-neck t-shirt."),
    ("Denim Jeans", "clothing", "39.90", 35, "Classic straight-fit blue jeans."),
    ("Winter Jacket", "clothing", "79.00", 3, "Warm padded jacket for cold weather."),
    ("Python Crash Course", "books", "29.95", 25, "Beginner-friendly Python programming book."),
    ("Atomic Habits", "books", "18.00", 50, "Practical guide to building good habits."),
    ("Non-stick Frying Pan", "home-kitchen", "22.75", 30, "28 cm non-stick pan, induction ready."),
    ("Ceramic Mug Set", "home-kitchen", "15.40", 0, "Set of 4 ceramic coffee mugs."),
    ("Desk Lamp LED", "home-kitchen", "19.99", 18, "Adjustable LED desk lamp, 3 brightness levels."),
]


class Command(BaseCommand):
    help = "Seed the database with sample categories and products."

    @transaction.atomic
    def handle(self, *args, **options):
        categories = {}
        cat_created = 0
        for name, slug, description in CATEGORIES:
            category, created = Category.objects.get_or_create(
                slug=slug, defaults={"name": name, "description": description}
            )
            categories[slug] = category
            cat_created += created

        prod_created = 0
        for name, cat_slug, price, stock, description in PRODUCTS:
            _, created = Product.objects.get_or_create(
                name=name,
                defaults={
                    "category": categories[cat_slug],
                    "price": Decimal(price),
                    "stock_quantity": stock,
                    "description": description,
                    "is_available": stock > 0,
                },
            )
            prod_created += created

        self.stdout.write(
            self.style.SUCCESS(
                f"Categories: {cat_created} created, {len(CATEGORIES) - cat_created} already existed. "
                f"Products: {prod_created} created, {len(PRODUCTS) - prod_created} already existed."
            )
        )
