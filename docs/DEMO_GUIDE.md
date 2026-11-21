# Haatbox: Local Demo Guide

Everything needed to run and present the shop on one computer (Deployment Option B: local demo).

## 1. Requirements

- Python 3.10+ (developed with 3.11)
- Node.js 20+ and npm
- PostgreSQL (developed with 17), running locally

## 2. One-time setup

```bash
# Database
createdb ecommerce_db

# Backend
cd backend
python3.11 -m venv venv
source venv/bin/activate                       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                           # then set DJANGO_SECRET_KEY and DB_USER / DB_PASSWORD
python manage.py migrate
python manage.py seed_products --with-images   # 6 categories, 30 products, prices in BDT, product photos
python manage.py seed_demo_users               # demo admin + demo customer (see below)

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

All seed commands are safe to run again. They never duplicate data.

## 3. Start the demo (two terminals)

```bash
# Terminal 1: API on http://127.0.0.1:8000
cd backend && source venv/bin/activate && python manage.py runserver

# Terminal 2: shop on http://localhost:5173
cd frontend && npm run dev
```

Open **http://localhost:5173**.

## 4. Demo accounts

| Role | Username | Password | Where |
|---|---|---|---|
| Admin | `demo_admin` | `HaatboxAdmin#2026` | Shop → profile menu → **Admin dashboard** (also Django admin at http://127.0.0.1:8000/admin/) |
| Customer | `demo_customer` | `HaatboxShop#2026` | Shop login |

These are for local demos only. Override them with `DEMO_ADMIN_PASSWORD` / `DEMO_CUSTOMER_PASSWORD`.
The command refuses to run when `DJANGO_DEBUG=False`.

## 5. Test payments: Card, bKash, Nagad

At checkout the customer picks **Card**, **bKash** or **Nagad**. **Buy now** (on product cards and product pages)
skips the cart and checks out just that product.

- **Default, demo gateway:** any method without credentials opens a simulated page. Nothing typed there is sent anywhere.
  - Card: *Pay*.
  - bKash / Nagad: wallet number (e.g. `01712345678`), then verification code **`123456`**, then PIN
    (any 5 digits for bKash, any 4 for Nagad).
  - Every page also has *Simulate a failed payment* and *Cancel*.
- **bKash sandbox:** set `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` (from the bKash
  merchant / developer portal) in `backend/.env` and restart. Customers are sent to bKash's own page.
- **Nagad sandbox:** set `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_NUMBER`, `NAGAD_MERCHANT_PRIVATE_KEY`,
  `NAGAD_PG_PUBLIC_KEY` (from Nagad) and restart.
- **Stripe test mode:** set `STRIPE_SECRET_KEY=sk_test_…` (backend) and `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…`
  (frontend), then restart both servers. Use these Stripe test cards:

  | Card | Result |
  |---|---|
  | `4242 4242 4242 4242` | Payment succeeds |
  | `4000 0000 0000 9995` | Payment is declined |

  Use any future expiry date, any CVC and any postcode.
  For webhooks locally, run `stripe listen --forward-to localhost:8000/api/payments/webhook/` and put the shown `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

## 5b. AI shopping assistant

Add `ANTHROPIC_API_KEY=sk-ant-…` (from https://platform.claude.com) to `backend/.env` and restart the backend.
Then click **Ask Haatbox AI** (bottom-right) and try:

- "Gift ideas under ৳2,000"
- "খেলার জিনিস দেখাও"
- "How much is delivery?"
- As `demo_customer`: "Where is my order?" and "Add a yoga mat to my cart"

Without a key, the chat window says the assistant is offline. Every other part of the shop works normally.

## 6. Five-minute demo script

1. **Home** (http://localhost:5173): show the brand, the categories and the new arrivals. All prices are in ৳.
2. **Browse:** Navbar → *Categories → Sports & Outdoors*, then search "kettle". Open a product.
3. **Login:** log in as `demo_customer`.
4. **Cart:** add *Smart Watch Fit 2* ×2. Open the cart, change the quantity and point out the live subtotal.
5. **Checkout:** enter an address (Dhaka). Standard delivery is free over ৳5,000; switch to Express (+৳300).
   Choose **bKash** and click **Pay … with bKash**.
6. **Payment:** on the bKash test page enter `01712345678`, then code `123456`, then PIN `12345`, then *Confirm*.
   You land on *Payment successful*, the page says "Paid with bKash", and the cart is now empty.
   *Buy now:* on any product card click **Buy now**. Checkout shows only that product, and your cart is not touched.
7. **Orders:** *View order* shows items, totals, address, and the progress bar at **Paid**.
8. **Failure case (optional):** add a product, pay, then choose *Simulate a failed payment*. The order is not placed, nothing is charged, and the cart is kept.
9. **Admin:** log out and log in as `demo_admin`, then open profile menu → **Admin dashboard**.
   - Overview: total sales, current orders, low-stock products and recent orders.
   - Products: *+ Add product* with a photo, edit the price, toggle *Low stock only*.
   - Categories: add or rename. Deleting a category that still has products is refused.
   - Orders: set the new order to **Shipped**.
10. **Back as customer:** the order page now shows **Shipped**.

## 7. Reset between demos

```bash
cd backend && source venv/bin/activate
python manage.py shell -c "from orders.models import Order; Order.objects.all().delete()"
python manage.py seed_demo_users          # resets demo passwords
```

Stock reduced by demo orders stays reduced. Edit it in *Admin dashboard → Products* if needed.

## 8. Run the automated tests

```bash
cd backend && source venv/bin/activate && python manage.py test   # API, auth, cart, checkout, orders, payments, security
cd frontend && npm test && npm run lint && npm run build          # React unit tests + lint + production build
```

## 9. Going to production later (Option A)

See [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md). In short:

- Deploy PostgreSQL and the Django API (e.g. Render or Railway) with `DJANGO_DEBUG=False` and real hosts, CORS origins and Stripe keys.
- Run `migrate` and `collectstatic`.
- Build the frontend with `VITE_API_BASE_URL=https://<api>/api` and deploy it (e.g. Vercel or Netlify).
- Use Cloudinary or S3 for product images.
