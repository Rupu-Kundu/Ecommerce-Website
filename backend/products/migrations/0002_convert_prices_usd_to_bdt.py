"""
One-time data migration: product prices were stored in USD; the shop now uses
Bangladeshi Taka (BDT). Every existing price is converted with ONE fixed rate and
rounded to whole taka.

Because Django records applied migrations, this runs exactly once per database,
so prices can never be converted twice.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations

USD_TO_BDT = Decimal("120")


def usd_to_bdt(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    for product in Product.objects.all():
        product.price = (product.price * USD_TO_BDT).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        product.save(update_fields=["price"])


def bdt_to_usd(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    for product in Product.objects.all():
        product.price = (product.price / USD_TO_BDT).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        product.save(update_fields=["price"])


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(usd_to_bdt, bdt_to_usd),
    ]
