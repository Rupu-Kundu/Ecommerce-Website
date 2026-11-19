"""
Create sample categories and products for development. Prices are in BDT (৳).

Usage:
    python manage.py seed_products

Safe to run more than once: existing records (matched by name / slug) are left alone,
so it never changes or duplicates products that already exist.
Product images are uploaded separately (see docs/IMAGE_CREDITS.md).
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from products.models import Category, Product

CATEGORIES = [
    ("Electronics", "electronics", "Phones, laptops, audio, and gadgets."),
    ("Clothing", "clothing", "Everyday wear, footwear, and accessories."),
    ("Books", "books", "Bestsellers, self-help, and programming guides."),
    ("Home & Kitchen", "home-kitchen", "Cookware, appliances, and home essentials."),
    ("Sports & Outdoors", "sports-outdoors", "Fitness gear and outdoor essentials."),
    ("Beauty & Personal Care", "beauty-personal-care", "Skincare, fragrance, and grooming."),
]

# (name, category slug, price in BDT, stock, description)
PRODUCTS = [
    # Electronics
    ("Wireless Earbuds", "electronics", "5999", 40, "Bluetooth earbuds with charging case."),
    ("Smartphone X10", "electronics", "47880", 15, "6.5-inch display, 128 GB storage."),
    ("Laptop Pro 14", "electronics", "107880", 8, "14-inch laptop, 16 GB RAM, 512 GB SSD."),
    ("USB-C Charger 65W", "electronics", "2940", 60, "Fast charger for phones and laptops."),
    ("Smart Watch Fit 2", "electronics", "6499", 25, "1.8-inch AMOLED display, heart-rate and sleep tracking, 7-day battery."),
    ("Portable Bluetooth Speaker", "electronics", "3290", 30, "Compact speaker with 12-hour battery and rich bass."),
    ("Smart Home Speaker", "electronics", "8990", 12, "Voice-controlled speaker with room-filling 360° sound."),
    # Clothing
    ("Cotton T-Shirt", "clothing", "1559", 100, "Soft 100% cotton crew-neck t-shirt."),
    ("Denim Jeans", "clothing", "4788", 35, "Classic straight-fit blue jeans."),
    ("Winter Jacket", "clothing", "9480", 3, "Warm padded jacket for cold weather."),
    ("Classic Cotton Hoodie", "clothing", "2450", 40, "Soft fleece-lined hoodie with a kangaroo pocket."),
    ("Running Sneakers", "clothing", "5890", 20, "Lightweight, breathable sneakers with a cushioned sole."),
    ("Braided Leather Belt", "clothing", "1290", 35, "Genuine braided leather with a brushed metal buckle."),
    # Books
    ("Python Crash Course", "books", "3594", 25, "Beginner-friendly Python programming book."),
    ("Atomic Habits", "books", "2160", 50, "Practical guide to building good habits."),
    ("The Psychology of Money", "books", "1250", 45, "Morgan Housel's timeless lessons on wealth, greed, and happiness."),
    ("How Innovation Works", "books", "1450", 25, "Matt Ridley on how new ideas really come to life."),
    # Home & Kitchen
    ("Non-stick Frying Pan", "home-kitchen", "2730", 30, "28 cm non-stick pan, induction ready."),
    ("Ceramic Mug Set", "home-kitchen", "1848", 0, "Set of 4 ceramic coffee mugs."),
    ("Desk Lamp LED", "home-kitchen", "2399", 18, "Adjustable LED desk lamp, 3 brightness levels."),
    ("Electric Kettle 1.7L", "home-kitchen", "2650", 18, "Fast-boil electric kettle with temperature gauge and auto shut-off."),
    ("Acacia Wood Cutting Board", "home-kitchen", "1190", 28, "Solid acacia wood board with handle, gentle on knives."),
    # Sports & Outdoors
    ("Yoga Mat 6mm", "sports-outdoors", "1850", 30, "Non-slip 6 mm exercise mat with carry strap."),
    ("Hex Dumbbell Pair (5 kg)", "sports-outdoors", "4500", 15, "Rubber-coated hex dumbbells with knurled chrome handles, sold as a pair."),
    ("Football Size 5", "sports-outdoors", "1650", 40, "Match-quality size 5 football with machine-stitched panels."),
    ("Insulated Water Bottle 750ml", "sports-outdoors", "1190", 50, "Double-wall stainless steel; keeps drinks cold for 24 hours."),
    # Beauty & Personal Care
    ("Vitamin C Face Serum 30ml", "beauty-personal-care", "1350", 35, "Brightening face serum in a glass dropper bottle."),
    ("Eau de Parfum 50ml", "beauty-personal-care", "3950", 20, "Long-lasting floral perfume with notes of rose and soft musk."),
    ("Daily Sunscreen SPF 50", "beauty-personal-care", "990", 60, "Lightweight, non-greasy sunscreen for everyday UV protection."),
    ("Ionic Hair Dryer", "beauty-personal-care", "2890", 22, "1800 W fast-drying hair dryer with cool-shot button."),
]


class Command(BaseCommand):
    help = "Seed the database with sample categories and products (prices in BDT)."

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
