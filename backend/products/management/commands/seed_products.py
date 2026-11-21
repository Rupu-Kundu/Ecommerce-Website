"""
Create sample categories and products for development. Prices are in BDT (৳).

Usage:
    python manage.py seed_products                 # categories + products (+ brand/details)
    python manage.py seed_products --with-images   # also download missing product photos

Safe to run more than once:
  - existing categories/products (matched by slug / name) are not duplicated,
  - brand and product details are only filled in where they are still empty,
  - the few products that moved to a new, more specific category (earbuds, smart watch,
    sneakers, perfume) are moved only while they are still in their old category,
  - --with-images only adds photos that are missing: the main photo, and a second
    gallery photo when a product has no gallery yet.

Photos: free Unsplash images (docs/IMAGE_CREDITS.md). Where no second photo of the same
product was available, the second gallery image is a close-up (zoomed detail) of the
main photo, so the gallery never shows a different product.
"""

import io
import urllib.request
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify
from PIL import Image

from products.models import Category, Product, ProductImage

CATEGORIES = [
    ("Electronics", "electronics", "Phones, laptops, speakers and gadgets."),
    ("Clothing", "clothing", "Everyday wear, traditional wear and accessories."),
    ("Books", "books", "Bestsellers, self-help, and programming guides."),
    ("Home & Kitchen", "home-kitchen", "Cookware, appliances, and home essentials."),
    ("Sports & Outdoors", "sports-outdoors", "Fitness gear and outdoor essentials."),
    ("Beauty & Personal Care", "beauty-personal-care", "Skincare and grooming."),
    ("Shoes", "shoes", "Sneakers, loafers, formal shoes and sandals."),
    ("Watches", "watches", "Smart watches and classic wrist watches."),
    ("Earbuds & Audio", "earbuds-audio", "Wireless earbuds and headphones."),
    ("Perfumes", "perfumes", "Perfumes, attar and body mists."),
    ("Cat Supplies", "cat-supplies", "Food, litter, toys and furniture for cats."),
    ("Medical & Health", "medical-health", "Home health devices and first aid."),
    ("Baby Products", "baby-products", "Diapers, feeding and care for babies."),
    ("Home Decor", "home-decor", "Vases, clocks, candles, cushions and plants."),
]

# Products that now belong to a new, more specific category: name → (old slug, new slug)
MOVES = {
    "Wireless Earbuds": ("electronics", "earbuds-audio"),
    "Smart Watch Fit 2": ("electronics", "watches"),
    "Running Sneakers": ("clothing", "shoes"),
    "Eau de Parfum 50ml": ("beauty-personal-care", "perfumes"),
}

# (name, category slug, price in BDT, stock, description)
PRODUCTS = [
    # Electronics
    ("Wireless Earbuds", "earbuds-audio", "5999", 40, "Bluetooth earbuds with charging case."),
    ("Smartphone X10", "electronics", "47880", 15, "6.5-inch display, 128 GB storage."),
    ("Laptop Pro 14", "electronics", "107880", 8, "14-inch laptop, 16 GB RAM, 512 GB SSD."),
    ("USB-C Charger 65W", "electronics", "2940", 60, "Fast charger for phones and laptops."),
    ("Smart Watch Fit 2", "watches", "6499", 25, "1.8-inch AMOLED display, heart-rate and sleep tracking, 7-day battery."),
    ("Portable Bluetooth Speaker", "electronics", "3290", 30, "Compact speaker with 12-hour battery and rich bass."),
    ("Smart Home Speaker", "electronics", "8990", 12, "Voice-controlled speaker with room-filling 360° sound."),
    # Clothing
    ("Cotton T-Shirt", "clothing", "1559", 100, "Soft 100% cotton crew-neck t-shirt."),
    ("Denim Jeans", "clothing", "4788", 35, "Classic straight-fit blue jeans."),
    ("Winter Jacket", "clothing", "9480", 3, "Warm padded jacket for cold weather."),
    ("Classic Cotton Hoodie", "clothing", "2450", 40, "Soft fleece-lined hoodie with a kangaroo pocket."),
    ("Running Sneakers", "shoes", "5890", 20, "Lightweight, breathable sneakers with a cushioned sole."),
    ("Braided Leather Belt", "clothing", "1290", 35, "Genuine braided leather with a brushed metal buckle."),
    ("Men's Cotton Panjabi", "clothing", "2650", 30, "Classic white cotton panjabi with a mandarin collar — perfect for Eid and festivals."),
    ("Silk Blend Saree", "clothing", "6900", 12, "Woven silk-blend saree with a rich zari border and matching blouse piece."),
    ("Printed Cotton Kurti", "clothing", "1850", 40, "Breathable cotton kurti with a block-print floral pattern."),
    ("Classic Polo Shirt", "clothing", "1450", 50, "Soft piqué cotton polo shirt with a two-button placket."),
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
    ("Eau de Parfum 50ml", "perfumes", "3950", 20, "Long-lasting floral perfume with notes of rose and soft musk."),
    ("Daily Sunscreen SPF 50", "beauty-personal-care", "990", 60, "Lightweight, non-greasy sunscreen for everyday UV protection."),
    ("Ionic Hair Dryer", "beauty-personal-care", "2890", 22, "1800 W fast-drying hair dryer with cool-shot button."),
    # Shoes
    ("Leather Penny Loafers", "shoes", "4950", 18, "Hand-finished brown leather loafers with a cushioned insole."),
    ("Canvas Sneakers", "shoes", "2350", 35, "Classic green canvas sneakers with a rubber toe cap."),
    ("Leather Slide Sandals", "shoes", "1650", 40, "Comfortable leather slide sandals with a moulded footbed."),
    ("Formal Oxford Shoes", "shoes", "5490", 15, "Brown leather lace-up Oxford shoes for office and weddings."),
    # Watches
    ("Classic Blue Dial Watch", "watches", "7450", 14, "Stainless steel analog watch with a sunray blue dial and date window."),
    ("Women's Gold-Tone Watch", "watches", "5250", 16, "Elegant gold-tone watch with a white dial and slim bracelet."),
    ("Retro Digital Watch", "watches", "2150", 30, "Steel digital watch with backlight, alarm and stopwatch."),
    # Earbuds & Audio
    ("Noise-Cancelling Earbuds Pro", "earbuds-audio", "8990", 20, "Active noise cancelling earbuds with transparency mode and 30-hour battery."),
    ("Wireless Over-Ear Headphones", "earbuds-audio", "7590", 15, "Foldable over-ear headphones with deep bass and 40-hour battery."),
    ("Sports Wireless Earbuds", "earbuds-audio", "3990", 25, "Sweat-proof ear-hook earbuds that stay put during workouts."),
    # Perfumes
    ("Oud Attar 12ml", "perfumes", "1650", 30, "Alcohol-free oud attar oil with warm amber and sandalwood."),
    ("Men's Eau de Toilette 100ml", "perfumes", "3450", 18, "Fresh woody fragrance for everyday wear."),
    ("Floral Body Mist 250ml", "perfumes", "990", 45, "Light floral body mist for an all-day fresh feel."),
    # Cat Supplies
    ("Dry Cat Food 1.5kg", "cat-supplies", "1450", 40, "Complete dry food for adult cats with chicken and fish."),
    ("Clumping Cat Litter 5L", "cat-supplies", "890", 50, "Low-dust clumping litter with odour control."),
    ("Cat Scratching Post", "cat-supplies", "2650", 12, "Sisal scratching post with a soft perch on top."),
    ("Cat Toy Set (6 pcs)", "cat-supplies", "690", 60, "Feather wand, balls and plush mice to keep cats busy."),
    # Medical & Health
    ("Digital Thermometer", "medical-health", "390", 80, "Fast 10-second reading with fever beep and memory."),
    ("Blood Pressure Monitor", "medical-health", "3250", 20, "Automatic upper-arm BP monitor with large display and 2×60 memories."),
    ("First Aid Kit (80 pcs)", "medical-health", "1250", 30, "Bandages, gauze, antiseptic wipes, scissors and more in a sturdy bag."),
    ("Fingertip Pulse Oximeter", "medical-health", "1450", 25, "Measures SpO₂ and pulse rate in seconds."),
    ("Surgical Face Masks (50 pcs)", "medical-health", "350", 100, "3-ply disposable masks with soft ear loops."),
    # Baby Products
    ("Baby Diapers Size M (50 pcs)", "baby-products", "1390", 40, "Soft, leak-proof diapers for babies 6–11 kg."),
    ("Anti-Colic Feeding Bottle 260ml", "baby-products", "750", 35, "BPA-free bottle with an anti-colic vent and soft teat."),
    ("Baby Wet Wipes (80 pcs)", "baby-products", "220", 120, "Gentle, alcohol-free wipes with aloe vera."),
    ("Soft Crochet Baby Blanket", "baby-products", "1590", 20, "Hand-crocheted cotton blanket, soft on delicate skin."),
    # Home Decor
    ("Ceramic Flower Vase", "home-decor", "1250", 25, "Ribbed matte ceramic vase for fresh or dried flowers."),
    ("Modern Wall Clock", "home-decor", "1490", 22, "Silent-sweep 30 cm wall clock with a clean white dial."),
    ("Scented Candle Set (2 pcs)", "home-decor", "1150", 30, "Amber glass jar candles with vanilla and sandalwood scents."),
    ("Cushion Covers (Set of 2)", "home-decor", "890", 40, "Soft white cushion covers with hidden zip, 45 × 45 cm."),
    ("Artificial Potted Plant", "home-decor", "1350", 25, "Lifelike faux plant in a white ceramic pot — no watering needed."),
]

# Brand + product details shown on the product page (filled in only when empty).
DETAILS = {
    "Wireless Earbuds": ("Nova Audio", {"Connectivity": "Bluetooth 5.3", "Battery": "6 h (24 h with case)", "Charging": "USB-C", "Water resistance": "IPX4"}),
    "Smartphone X10": ("Nova", {"Display": "6.5-inch FHD+", "Storage": "128 GB", "RAM": "8 GB", "Camera": "50 MP + 8 MP", "Battery": "5000 mAh"}),
    "Laptop Pro 14": ("Nova", {"Display": "14-inch 2.8K", "Processor": "8-core", "RAM": "16 GB", "Storage": "512 GB SSD", "Weight": "1.4 kg"}),
    "USB-C Charger 65W": ("Haatbox Basics", {"Output": "65 W USB-C PD", "Input": "100–240 V", "Works with": "Phones, tablets, laptops", "Warranty": "1 year"}),
    "Smart Watch Fit 2": ("Nova", {"Display": "1.8-inch AMOLED", "Battery": "Up to 7 days", "Sensors": "Heart rate, SpO₂, sleep", "Water resistance": "5 ATM"}),
    "Portable Bluetooth Speaker": ("Nova Audio", {"Battery": "12 hours", "Connectivity": "Bluetooth 5.0", "Water resistance": "IPX7", "Weight": "540 g"}),
    "Smart Home Speaker": ("Nova Audio", {"Sound": "360° room-filling", "Voice assistant": "Built-in", "Connectivity": "Wi-Fi, Bluetooth", "Colour": "White"}),
    "Cotton T-Shirt": ("Dhaka Loom", {"Material": "100% cotton, 180 GSM", "Fit": "Regular", "Sizes": "S–XXL", "Care": "Machine wash cold"}),
    "Denim Jeans": ("Dhaka Loom", {"Material": "98% cotton, 2% elastane", "Fit": "Straight", "Sizes": "28–38", "Care": "Wash inside out"}),
    "Winter Jacket": ("Dhaka Loom", {"Shell": "Water-repellent nylon", "Filling": "Polyester padding", "Sizes": "M–XXL", "Pockets": "2 zip pockets"}),
    "Classic Cotton Hoodie": ("Dhaka Loom", {"Material": "Cotton fleece", "Fit": "Relaxed", "Sizes": "S–XXL", "Pocket": "Kangaroo pocket"}),
    "Running Sneakers": ("Stride", {"Upper": "Breathable mesh", "Sole": "Cushioned EVA", "Sizes": "EU 39–45", "Weight": "260 g per shoe"}),
    "Braided Leather Belt": ("Dhaka Loom", {"Material": "Genuine leather", "Width": "3.5 cm", "Buckle": "Brushed metal", "Sizes": "30–40 inch"}),
    "Men's Cotton Panjabi": ("Dhaka Loom", {"Material": "Premium cotton", "Collar": "Mandarin", "Sizes": "38–46", "Care": "Hand or gentle wash"}),
    "Silk Blend Saree": ("Dhaka Loom", {"Material": "Silk blend", "Length": "5.5 m + 0.8 m blouse piece", "Work": "Zari border", "Care": "Dry clean"}),
    "Printed Cotton Kurti": ("Dhaka Loom", {"Material": "100% cotton", "Print": "Block print", "Sleeve": "Three-quarter", "Sizes": "S–XL"}),
    "Classic Polo Shirt": ("Dhaka Loom", {"Material": "Cotton piqué", "Fit": "Regular", "Sizes": "S–XXL", "Care": "Machine wash"}),
    "Python Crash Course": ("No Starch Press", {"Author": "Eric Matthes", "Language": "English", "Format": "Paperback", "Pages": "552"}),
    "Atomic Habits": ("Penguin", {"Author": "James Clear", "Language": "English", "Format": "Paperback", "Pages": "320"}),
    "The Psychology of Money": ("Harriman House", {"Author": "Morgan Housel", "Language": "English", "Format": "Paperback", "Pages": "256"}),
    "How Innovation Works": ("Harper", {"Author": "Matt Ridley", "Language": "English", "Format": "Paperback", "Pages": "416"}),
    "Non-stick Frying Pan": ("Casa Kitchen", {"Size": "28 cm", "Coating": "PFOA-free non-stick", "Hob": "Gas, electric, induction", "Handle": "Wooden-look, cool touch"}),
    "Ceramic Mug Set": ("Casa Kitchen", {"Pieces": "4 mugs", "Capacity": "350 ml each", "Material": "Ceramic", "Safe for": "Microwave, dishwasher"}),
    "Desk Lamp LED": ("Haatbox Basics", {"Brightness": "3 levels", "Power": "USB, 6 W", "Arm": "Adjustable", "Light": "Flicker-free LED"}),
    "Electric Kettle 1.7L": ("Casa Kitchen", {"Capacity": "1.7 L", "Power": "1800 W", "Safety": "Auto shut-off, boil-dry protection", "Body": "Stainless steel"}),
    "Acacia Wood Cutting Board": ("Casa Kitchen", {"Material": "Solid acacia wood", "Size": "40 × 25 cm", "Care": "Hand wash, oil monthly"}),
    "Yoga Mat 6mm": ("Stride", {"Thickness": "6 mm", "Size": "183 × 61 cm", "Material": "TPE, non-slip", "Includes": "Carry strap"}),
    "Hex Dumbbell Pair (5 kg)": ("Stride", {"Weight": "2 × 5 kg", "Coating": "Rubber", "Handle": "Knurled chrome", "Shape": "Hexagonal (no rolling)"}),
    "Football Size 5": ("Stride", {"Size": "5 (official)", "Stitching": "Machine-stitched", "Use": "Grass and turf"}),
    "Insulated Water Bottle 750ml": ("Stride", {"Capacity": "750 ml", "Keeps cold": "24 hours", "Keeps hot": "12 hours", "Material": "Stainless steel"}),
    "Vitamin C Face Serum 30ml": ("Glow Lab", {"Volume": "30 ml", "Key ingredient": "Vitamin C 15%", "Skin type": "All skin types", "Use": "Morning, before sunscreen"}),
    "Eau de Parfum 50ml": ("Scentora", {"Volume": "50 ml", "Notes": "Rose, peony, soft musk", "Concentration": "Eau de Parfum", "Lasts": "6–8 hours"}),
    "Daily Sunscreen SPF 50": ("Glow Lab", {"Protection": "SPF 50, PA++++", "Volume": "50 ml", "Finish": "Non-greasy", "Skin type": "All skin types"}),
    "Ionic Hair Dryer": ("Glow Lab", {"Power": "1800 W", "Settings": "3 heat, 2 speed", "Features": "Ionic, cool shot", "Cord": "1.8 m"}),
    "Leather Penny Loafers": ("Stride", {"Upper": "Genuine leather", "Sole": "Rubber", "Sizes": "EU 39–45", "Colour": "Brown"}),
    "Canvas Sneakers": ("Stride", {"Upper": "Cotton canvas", "Sole": "Vulcanised rubber", "Sizes": "EU 36–45", "Colour": "Green"}),
    "Leather Slide Sandals": ("Stride", {"Upper": "Leather straps", "Footbed": "Moulded cork", "Sizes": "EU 39–45", "Colour": "Black and brown"}),
    "Formal Oxford Shoes": ("Stride", {"Upper": "Polished leather", "Lining": "Leather", "Sizes": "EU 39–45", "Closure": "Lace-up"}),
    "Classic Blue Dial Watch": ("Aurum Time", {"Movement": "Quartz", "Case": "41 mm stainless steel", "Strap": "Steel bracelet", "Water resistance": "5 ATM"}),
    "Women's Gold-Tone Watch": ("Aurum Time", {"Movement": "Quartz", "Case": "32 mm, gold-tone", "Strap": "Slim bracelet", "Water resistance": "3 ATM"}),
    "Retro Digital Watch": ("Aurum Time", {"Display": "LCD with backlight", "Functions": "Alarm, stopwatch, date", "Strap": "Steel bracelet", "Battery": "Up to 3 years"}),
    "Noise-Cancelling Earbuds Pro": ("Nova Audio", {"Noise cancelling": "Active (ANC)", "Battery": "8 h (30 h with case)", "Connectivity": "Bluetooth 5.3", "Water resistance": "IPX5"}),
    "Wireless Over-Ear Headphones": ("Nova Audio", {"Battery": "40 hours", "Connectivity": "Bluetooth 5.2 + 3.5 mm", "Design": "Foldable", "Microphone": "Built-in"}),
    "Sports Wireless Earbuds": ("Nova Audio", {"Fit": "Ear hooks", "Battery": "9 h (36 h with case)", "Water resistance": "IPX7", "Connectivity": "Bluetooth 5.3"}),
    "Oud Attar 12ml": ("Scentora", {"Volume": "12 ml", "Type": "Alcohol-free oil (attar)", "Notes": "Oud, amber, sandalwood", "Lasts": "8–10 hours"}),
    "Men's Eau de Toilette 100ml": ("Scentora", {"Volume": "100 ml", "Notes": "Bergamot, cedar, vetiver", "Concentration": "Eau de Toilette", "Lasts": "4–6 hours"}),
    "Floral Body Mist 250ml": ("Scentora", {"Volume": "250 ml", "Notes": "Jasmine, peach, white musk", "Use": "Spray on skin and clothes"}),
    "Dry Cat Food 1.5kg": ("PetJoy", {"Weight": "1.5 kg", "For": "Adult cats (1+ years)", "Flavour": "Chicken and fish", "Protein": "32%"}),
    "Clumping Cat Litter 5L": ("PetJoy", {"Volume": "5 L", "Type": "Clumping bentonite", "Features": "Low dust, odour control"}),
    "Cat Scratching Post": ("PetJoy", {"Height": "60 cm", "Material": "Natural sisal rope", "Top": "Plush perch", "Base": "Weighted, non-tip"}),
    "Cat Toy Set (6 pcs)": ("PetJoy", {"Pieces": "6", "Includes": "Feather wand, 2 balls, 3 plush mice", "Safe": "Non-toxic materials"}),
    "Digital Thermometer": ("MediCare+", {"Reading time": "10 seconds", "Range": "32–42.9 °C", "Features": "Fever beep, last-reading memory", "Battery": "Replaceable"}),
    "Blood Pressure Monitor": ("MediCare+", {"Type": "Upper arm, automatic", "Cuff": "22–36 cm", "Memory": "2 users × 60 readings", "Power": "4 × AA or USB"}),
    "First Aid Kit (80 pcs)": ("MediCare+", {"Pieces": "80", "Includes": "Bandages, gauze, tape, wipes, scissors", "Bag": "Water-resistant, with handle"}),
    "Fingertip Pulse Oximeter": ("MediCare+", {"Measures": "SpO₂ and pulse rate", "Display": "OLED", "Battery": "2 × AAA (included)", "Note": "Not for diagnosis — see a doctor"}),
    "Surgical Face Masks (50 pcs)": ("MediCare+", {"Pieces": "50", "Layers": "3-ply", "Ear loops": "Soft elastic", "Use": "Single use"}),
    "Baby Diapers Size M (50 pcs)": ("Little Nest", {"Size": "M (6–11 kg)", "Pieces": "50", "Features": "Wetness indicator, leak guards"}),
    "Anti-Colic Feeding Bottle 260ml": ("Little Nest", {"Capacity": "260 ml", "Material": "BPA-free plastic", "Teat": "Soft silicone, slow flow", "Age": "0+ months"}),
    "Baby Wet Wipes (80 pcs)": ("Little Nest", {"Pieces": "80", "Formula": "Alcohol-free, with aloe vera", "Pack": "Resealable lid"}),
    "Soft Crochet Baby Blanket": ("Little Nest", {"Size": "90 × 90 cm", "Material": "Cotton yarn", "Made": "Hand-crocheted", "Care": "Gentle hand wash"}),
    "Ceramic Flower Vase": ("Casa Deco", {"Height": "25 cm", "Material": "Matte ceramic", "Finish": "Ribbed", "Colour": "Off-white"}),
    "Modern Wall Clock": ("Casa Deco", {"Diameter": "30 cm", "Movement": "Silent sweep", "Battery": "1 × AA", "Frame": "Black"}),
    "Scented Candle Set (2 pcs)": ("Casa Deco", {"Pieces": "2 jars", "Scents": "Vanilla, sandalwood", "Burn time": "About 30 h each", "Wax": "Soy blend"}),
    "Cushion Covers (Set of 2)": ("Casa Deco", {"Size": "45 × 45 cm", "Material": "Cotton blend", "Closure": "Hidden zip", "Pieces": "2 covers (no filling)"}),
    "Artificial Potted Plant": ("Casa Deco", {"Height": "30 cm", "Pot": "White ceramic", "Care": "No watering — dust occasionally"}),
}

# Main photo (Unsplash id) for each product (credits: docs/IMAGE_CREDITS.md)
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
    "Men's Cotton Panjabi": "1774527929750-f2f32fbb3b93",
    "Silk Blend Saree": "1727430228383-aa1fb59db8bf",
    "Printed Cotton Kurti": "1745313452052-0e4e341f326c",
    "Classic Polo Shirt": "1625910513394-ea511bed44ca",
    "Leather Penny Loafers": "1616406432452-07bc5938759d",
    "Canvas Sneakers": "1784236404723-bc958ead7dd5",
    "Leather Slide Sandals": "1585120824848-8a5cd41493d2",
    "Formal Oxford Shoes": "1614253429340-98120bd6d753",
    "Classic Blue Dial Watch": "1623998021661-dc7555b2213d",
    "Women's Gold-Tone Watch": "1587947330324-9180f3f1fe70",
    "Retro Digital Watch": "1761284976242-d55d1e339805",
    "Noise-Cancelling Earbuds Pro": "1606220945770-b5b6c2c55bf1",
    "Wireless Over-Ear Headphones": "1618366712010-f4ae9c647dcb",
    "Sports Wireless Earbuds": "1636099184052-ada1f331132c",
    "Oud Attar 12ml": "1654524438549-10892fe4aec4",
    "Men's Eau de Toilette 100ml": "1787771366597-bca9fc3cb989",
    "Floral Body Mist 250ml": "1784902538196-c7d914e3ecce",
    "Dry Cat Food 1.5kg": "1764249453874-46864677b10e",
    "Clumping Cat Litter 5L": "1757670919588-1fe3b3df3dfa",
    "Cat Scratching Post": "1636543459642-ea9df9cc8f5a",
    "Cat Toy Set (6 pcs)": "1691351942745-0e2858a09bf3",
    "Digital Thermometer": "1609725236589-d987ffc8133a",
    "Blood Pressure Monitor": "1615486511484-92e172cc4fe0",
    "First Aid Kit (80 pcs)": "1782835430497-19223e7432cc",
    "Fingertip Pulse Oximeter": "1626851528990-fee2c2e6fadb",
    "Surgical Face Masks (50 pcs)": "1614290501125-d72aeb735c10",
    "Baby Diapers Size M (50 pcs)": "1584839404042-8bc21d240e91",
    "Anti-Colic Feeding Bottle 260ml": "1635258559918-ed56f88004de",
    "Baby Wet Wipes (80 pcs)": "1706524077391-12206f155e94",
    "Soft Crochet Baby Blanket": "1675273316257-07bb9934b122",
    "Ceramic Flower Vase": "1588874133473-d6d9c9dd4f31",
    "Modern Wall Clock": "1563861826100-9cb868fdbe1c",
    "Scented Candle Set (2 pcs)": "1572726729207-a78d6feb18d7",
    "Cushion Covers (Set of 2)": "1629949009710-2df14c41a72e",
    "Artificial Potted Plant": "1765507377750-f419fd7af9da",
}

# Second gallery photo: another Unsplash shot of the same kind of product, or ZOOM =
# a close-up crop of the main photo (used when no matching second photo was available).
ZOOM = "zoom"
GALLERY = {
    "Wireless Earbuds": "1572569511254-d8f925fe2cbb",
    "Smartphone X10": "1634403665481-74948d815f03",
    "Laptop Pro 14": "1611186871348-b1ce696e52c9",
    "USB-C Charger 65W": "1583863788434-e58a36330cf0",
    "Smart Watch Fit 2": "1569411032431-07598b0012c2",
    "Portable Bluetooth Speaker": ZOOM,
    "Smart Home Speaker": "1586078875290-c22eb791ad5d",
    "Cotton T-Shirt": "1581655353564-df123a1eb820",
    "Denim Jeans": "1602293589930-45aad59ba3ab",
    "Winter Jacket": ZOOM,
    "Classic Cotton Hoodie": ZOOM,
    "Running Sneakers": ZOOM,
    "Braided Leather Belt": "1624222247344-550fb60583dc",
    "Python Crash Course": ZOOM,
    "Atomic Habits": ZOOM,
    "The Psychology of Money": ZOOM,
    "How Innovation Works": ZOOM,
    "Non-stick Frying Pan": "1592156328697-079f6ee0cfa5",
    "Ceramic Mug Set": "1590422749897-47036da0b0ff",
    "Desk Lamp LED": "1519219788971-8d9797e0928e",
    "Electric Kettle 1.7L": ZOOM,
    "Acacia Wood Cutting Board": ZOOM,
    "Yoga Mat 6mm": ZOOM,
    "Hex Dumbbell Pair (5 kg)": "1784894645353-81486c66a687",
    "Football Size 5": "1579952363873-27f3bade9f55",
    "Insulated Water Bottle 750ml": ZOOM,
    "Vitamin C Face Serum 30ml": "1707539160277-e39464517645",
    "Eau de Parfum 50ml": "1612871178341-33f941a841e3",
    "Daily Sunscreen SPF 50": ZOOM,
    "Ionic Hair Dryer": "1522336284037-91f7da073525",
    "Men's Cotton Panjabi": "1774527929685-0372244a6232",
    "Silk Blend Saree": ZOOM,
    "Printed Cotton Kurti": ZOOM,
    "Classic Polo Shirt": ZOOM,
    "Leather Penny Loafers": "1615979474401-8a6a344de5bd",
    "Canvas Sneakers": "1784236404795-70e745263086",
    "Leather Slide Sandals": ZOOM,
    "Formal Oxford Shoes": "1614252235316-8c857d38b5f4",
    "Classic Blue Dial Watch": "1619134778706-7015533a6150",
    "Women's Gold-Tone Watch": "1588559674156-c5984ed49b1c",
    "Retro Digital Watch": ZOOM,
    "Noise-Cancelling Earbuds Pro": "1606220588913-b3aacb4d2f46",
    "Wireless Over-Ear Headphones": "1505740420928-5e560c06d30e",
    "Sports Wireless Earbuds": "1636099652696-f5bec08a7503",
    "Oud Attar 12ml": "1654524438960-ab0a67b4e22f",
    "Men's Eau de Toilette 100ml": ZOOM,
    "Floral Body Mist 250ml": "1784902008628-64c816f9f39a",
    "Dry Cat Food 1.5kg": "1764576504536-dbdfa4cb1d9a",
    "Clumping Cat Litter 5L": "1727510153658-643787acb16a",
    "Cat Scratching Post": "1636543459635-c9756f9aef79",
    "Cat Toy Set (6 pcs)": "1768859336207-3c3ba2027cca",
    "Digital Thermometer": "1596751993042-d7c1db1f06e3",
    "Blood Pressure Monitor": "1780461159687-281752b8a85a",
    "First Aid Kit (80 pcs)": "1564144573017-8dc932e0039e",
    "Fingertip Pulse Oximeter": "1598532037823-2f11cc6a866c",
    "Surgical Face Masks (50 pcs)": "1758691462615-beafbf50bf3c",
    "Baby Diapers Size M (50 pcs)": "1552511762-898bfd9fb837",
    "Anti-Colic Feeding Bottle 260ml": "1623707430616-d9f956bcac2b",
    "Baby Wet Wipes (80 pcs)": "1584743578805-d7991ca2d5d4",
    "Soft Crochet Baby Blanket": "1675273316420-c0275064a1ab",
    "Ceramic Flower Vase": ZOOM,
    "Modern Wall Clock": "1594995846645-d58328c3ffa4",
    "Scented Candle Set (2 pcs)": "1612293905607-b003de9e54fb",
    "Cushion Covers (Set of 2)": "1629949009765-40fc74c9ec21",
    "Artificial Potted Plant": ZOOM,
}

IMAGE_URL = "https://images.unsplash.com/photo-{}?w={w}&h={w}&fit=crop&crop=entropy&q=80&fm=jpg"


def download_image(photo_id, size=800):
    """Download a photo and make sure it really is an image before saving it."""
    with urllib.request.urlopen(IMAGE_URL.format(photo_id, w=size), timeout=30) as response:
        data = response.read(8 * 1024 * 1024)
    Image.open(io.BytesIO(data)).verify()
    return data


def zoomed(photo_id):
    """A close-up of the centre of the main photo (detail view), 800×800."""
    image = Image.open(io.BytesIO(download_image(photo_id, size=1400))).convert("RGB")
    w, h = image.size
    box = (int(w * 0.2), int(h * 0.2), int(w * 0.8), int(h * 0.8))  # centre 60% → 1.67× zoom
    out = io.BytesIO()
    image.crop(box).resize((800, 800), Image.LANCZOS).save(out, "JPEG", quality=85)
    return out.getvalue()


class Command(BaseCommand):
    help = "Seed the database with sample categories and products (prices in BDT)."

    def add_arguments(self, parser):
        parser.add_argument("--with-images", action="store_true", help="Download photos for products that are missing them.")

    def handle(self, *args, **options):
        self.seed()
        if options["with_images"]:
            self.add_images()

    def add_images(self):
        added = failed = 0
        for product in Product.objects.filter(name__in=IMAGES.keys()):
            slug = slugify(product.name)
            try:
                if not product.image:
                    product.image.save(f"{slug}-unsplash.jpg", ContentFile(download_image(IMAGES[product.name])), save=True)
                    added += 1
                second = GALLERY.get(product.name)
                if second and not product.images.exists():
                    data = zoomed(IMAGES[product.name]) if second == ZOOM else download_image(second)
                    alt = f"{product.name} — close-up" if second == ZOOM else f"{product.name} — another view"
                    photo = ProductImage(product=product, alt_text=alt, position=1)
                    photo.image.save(f"{slug}-2.jpg", ContentFile(data), save=True)
                    added += 1
            except Exception as exc:  # network problems shouldn't stop the seed
                failed += 1
                self.stderr.write(f"  could not download a photo for {product.name}: {exc}")
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

        moved = 0
        for name, (old, new) in MOVES.items():
            moved += Product.objects.filter(name=name, category__slug=old).update(category=categories[new])

        prod_created = filled = 0
        for name, cat_slug, price, stock, description in PRODUCTS:
            product, created = Product.objects.get_or_create(
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
            brand, specs = DETAILS.get(name, ("", {}))
            changed = []
            if brand and not product.brand:
                product.brand = brand
                changed.append("brand")
            if specs and not product.specifications:
                product.specifications = [{"label": k, "value": v} for k, v in specs.items()]
                changed.append("specifications")
            if changed:
                product.save(update_fields=changed)
                filled += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Categories: {cat_created} created, {len(CATEGORIES) - cat_created} already existed. "
                f"Products: {prod_created} created, {len(PRODUCTS) - prod_created} already existed, "
                f"{moved} moved to a new category, {filled} got brand/details."
            )
        )
