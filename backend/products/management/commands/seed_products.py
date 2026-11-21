"""
Create sample categories and products for development. Prices are in BDT (৳).

Usage:
    python manage.py seed_products                 # categories + products
    python manage.py seed_products --with-images   # also download missing product photos

Safe to run more than once: existing records (matched by name / slug) are left alone,
so it never changes or duplicates products that already exist. --with-images only
fills products that have no image yet. Photos: free Unsplash images (docs/IMAGE_CREDITS.md).
"""

import io
import urllib.request
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify
from PIL import Image

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


# Unsplash photo id for each product (credits: docs/IMAGE_CREDITS.md)
IMAGES = {
    "Wireless Earbuds": "1606841837239-c5a1a4a07af7",
    "Smartphone X10": "1580910051074-3eb694886505",
    "Laptop Pro 14": "1496181133206-80ce9b88a853",
    "USB-C Charger 65W": "1770417999317-64fb254c9e3a",
    "Smart Watch Fit 2": "1624096104992-9b4fa3a279dd",
    "Portable Bluetooth Speaker": "1547052178-7f2c5a20c332",
    "Smart Home Speaker": "1761384409444-2f8359d67a69",
    "Cotton T-Shirt": "1651761179569-4ba2aa054997",
    "Denim Jeans": "1714143136372-ddaf8b606da7",
    "Winter Jacket": "1706765779494-2705542ebe74",
    "Classic Cotton Hoodie": "1620799140188-3b2a02fd9a77",
    "Running Sneakers": "1600185365926-3a2ce3cdb9eb",
    "Braided Leather Belt": "1711443982852-b3df5c563448",
    "Python Crash Course": "1573496528681-9b0f4fb0c660",
    "Atomic Habits": "1686764288887-dae4e7d50d58",
    "The Psychology of Money": "1592496431122-2349e0fbc666",
    "How Innovation Works": "1589829085413-56de8ae18c73",
    "Non-stick Frying Pan": "1592156328757-ae2941276b2c",
    "Ceramic Mug Set": "1523367118146-091f762cd8ea",
    "Desk Lamp LED": "1570974802254-4b0ad1a755f5",
    "Electric Kettle 1.7L": "1685514128186-c5d8d7e90e1a",
    "Acacia Wood Cutting Board": "1587302108992-20648821725d",
    "Yoga Mat 6mm": "1763004871583-4183d64096b1",
    "Hex Dumbbell Pair (5 kg)": "1638536532686-d610adfc8e5c",
    "Football Size 5": "1575361204480-aadea25e6e68",
    "Insulated Water Bottle 750ml": "1602143407151-7111542de6e8",
    "Vitamin C Face Serum 30ml": "1781344116880-029945a42b75",
    "Eau de Parfum 50ml": "1458538977777-0549b2370168",
    "Daily Sunscreen SPF 50": "1686831451322-8d8e234a51e1",
    "Ionic Hair Dryer": "1727364438136-6edc10ef0a52",
}
IMAGE_URL = "https://images.unsplash.com/photo-{}?w=800&h=800&fit=crop&crop=entropy&q=80&fm=jpg"


def download_image(photo_id):
    """Download a photo and make sure it really is an image before saving it."""
    with urllib.request.urlopen(IMAGE_URL.format(photo_id), timeout=30) as response:
        data = response.read(5 * 1024 * 1024)
    Image.open(io.BytesIO(data)).verify()
    return data


class Command(BaseCommand):
    help = "Seed the database with sample categories and products (prices in BDT)."

    def add_arguments(self, parser):
        parser.add_argument("--with-images", action="store_true", help="Download photos for products without an image.")

    def handle(self, *args, **options):
        self.seed()
        if options["with_images"]:
            self.add_images()

    def add_images(self):
        added = failed = 0
        for product in Product.objects.filter(name__in=IMAGES.keys()):
            if product.image:
                continue
            try:
                data = download_image(IMAGES[product.name])
            except Exception as exc:  # network problems shouldn't stop the seed
                failed += 1
                self.stderr.write(f"  could not download image for {product.name}: {exc}")
                continue
            product.image.save(f"{slugify(product.name)}-unsplash.jpg", ContentFile(data), save=True)
            added += 1
        self.stdout.write(self.style.SUCCESS(f"Images: {added} downloaded, {failed} failed."))

    @transaction.atomic
    def seed(self):
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
