# Haatbox — E-commerce Website

**Haatbox** (from *haat*, the Bangla word for a market) is a full-stack e-commerce MVP: React + Vite frontend, Django REST Framework backend, PostgreSQL database, JWT authentication, and Stripe test-mode payments.

## Folder Structure

```text
Ecommerce-Website/
├── backend/    # Django REST API
├── frontend/   # React + Vite app
└── docs/       # Project planning documents
```

## Documentation

- **[Demo guide](docs/DEMO_GUIDE.md)**: setup, demo accounts, test payments, 5-minute demo script
- [Security & production checklist](docs/SECURITY_CHECKLIST.md)

- [Project Plan](docs/PROJECT_PLAN.md): feature scope, page list, structure, and environment variable plan.

## Environment Variables

Copy each template and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`.env` files are git-ignored. Never commit real secrets.

## Requirements

- Node.js 20+ and npm
- Python 3.10+ (developed with 3.11)
- PostgreSQL (developed with 17)

## Local Setup

### Database

```bash
createdb ecommerce_db
```

Then set `DB_USER` / `DB_PASSWORD` in `backend/.env` to match your PostgreSQL login.

### Backend (Django)

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate          # create database tables
python manage.py createsuperuser  # admin login for /admin/
python manage.py runserver        # http://127.0.0.1:8000
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

## Currency

All prices are in **Bangladeshi Taka (৳ BDT)**, both stored in the database and shown in the UI.
Earlier USD prices were converted once by the data migration
`products/migrations/0002_convert_prices_usd_to_bdt.py` (1 USD = ৳120, rounded to whole taka).
The frontend only formats prices (`frontend/src/utils/format.js`). It never converts them.

Product photos: free Unsplash images, credited in [docs/IMAGE_CREDITS.md](docs/IMAGE_CREDITS.md).

## Frontend Pages

| Route | Page | Access |
|---|---|---|
| `/` | Home | Public |
| `/products` | Product list (search, category filter, sort, pagination) | Public |
| `/products/:id` | Product details | Public |
| `/login` | Login | Guests only |
| `/register` | Registration | Guests only |
| `/cart` | Shopping cart | Logged-in users |
| `/checkout` | Checkout (address + optional map pin, shipping, payment) | Logged-in users |
| `/help` | Help center (shipping, returns, payment, FAQ, store map) | Public |
| `/payment/demo` · `/payment/success` · `/payment/cancel` | Test payment pages | Logged-in users |
| `/orders` · `/orders/:id` | Order history and order details | Logged-in users |
| `/admin-dashboard` (+ `/products`, `/categories`, `/orders`, `/chat`) | Admin dashboard, incl. Live chat inbox | Admins only |
| `*` | 404 Not Found | Public |

Auth: the access token is kept in memory, the refresh token in `localStorage`. The Axios client
(`frontend/src/services/api.js`) attaches the token to every request and refreshes it automatically on a 401.
Protected pages use `ProtectedRoute` (`frontend/src/routes/ProtectedRoute.jsx`).

## API Endpoints

### Authentication (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/` | Public | Create a customer account; returns user + tokens |
| POST | `/api/auth/login/` | Public | `username` + `password` → `access`, `refresh`, `user` |
| POST | `/api/auth/refresh/` | Public | `refresh` → new `access` + new `refresh` |
| POST | `/api/auth/logout/` | Bearer token | `refresh` → blacklists the refresh token |
| GET | `/api/auth/me/` | Bearer token | Current user (includes `role`: `admin` or `customer`) |

Send the access token as `Authorization: Bearer <access>`. Admins are users with `is_staff=True`.

### Products & Categories (`/api/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/products/` | Public | Paginated list (12 per page) |
| GET | `/api/products/<id>/` | Public | Product details |
| GET | `/api/categories/` | Public | All categories |
| POST | `/api/products/` | Admin | Create (JSON, or multipart for `image`) |
| PUT / PATCH | `/api/products/<id>/` | Admin | Update |
| DELETE | `/api/products/<id>/` | Admin | Delete (also removes its photo files) |
| POST | `/api/products/<id>/images/` | Admin | Add a gallery photo (multipart `image`, `alt_text?`; up to 8) |
| DELETE | `/api/products/<id>/images/<image_id>/` | Admin | Remove a gallery photo |
| GET | `/api/products/<id>/reviews/` | Public | `{summary: {average, count, distribution}, my_review, results}` |
| POST | `/api/products/<id>/reviews/` | Customer | `{rating 1–5, comment?}`: add or update your review (one per customer) |
| DELETE | `/api/products/<id>/reviews/<review_id>/` | Owner / Admin | Delete a review |

Each product has `brand`, `specifications` (product details table: `[{label, value}]`, up to 20 rows), `image` (main
photo), `images` (gallery photos), `average_rating` and `rating_count`. Reviews from customers with a paid order for the
product are marked **Verified purchase**. On the product page customers can hover to magnify, click to open a full-screen
viewer and zoom 1×–3× (tap and drag on phones).

Query parameters for `GET /api/products/`:

- `search=phone`: searches name, brand, description, and category name
- `category=electronics`: filter by category slug (or id)
- `ordering=price` / `ordering=-price`: sort by price (also `created_at`, `name`, `-rating_score` = top rated)
- `page=2`: next page

Guests and customers only see products with `is_available=true`; admins see all.

**Cash on delivery (COD):** customers can choose *COD* at checkout (orders up to `COD_MAX_AMOUNT`, default ৳50,000;
switch off with `PAYMENTS_ALLOW_COD=False`). The order is confirmed straight away and stock is reserved. When the admin
marks it **Delivered**, the payment becomes *Paid* (cash collected). **Cancelled** returns the stock, and a cancelled COD
order can't be reopened.

**Categories:** Electronics, Clothing, Shoes, Watches, Earbuds & Audio, Perfumes, Beauty & Personal Care, Books,
Home & Kitchen, Home Decor, Sports & Outdoors, Cat Supplies, Medical & Health, Baby Products.

### Cart (`/api/cart/`): login required

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cart/` | Current cart; unavailable items are removed and reported in `notices` |
| POST | `/api/cart/items/` | `{product_id, quantity}`: add (adds to existing quantity) |
| PATCH | `/api/cart/items/<id>/` | `{quantity}`: set quantity (min 1, max stock) |
| DELETE | `/api/cart/items/<id>/` | Remove item |

All cart endpoints return the full cart: `items`, `total_items`, `subtotal`, `notices`.

### Checkout (`/api/checkout/`): login required

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/checkout/shipping-methods/` | Shipping options (public) |
| GET | `/api/checkout/addresses/` | The user's saved addresses |
| POST | `/api/checkout/` | `{shipping_method, address \| address_id}`: verify the cart, save the address, return the server-calculated total |

Checkout returns `409` with the updated cart if stock changed. Prices always come from the database.
Shipping: Standard ৳120 (free over ৳5,000), Express ৳300.

### Orders (`/api/orders/`): login required

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/orders/` | Customer | `{shipping_method, payment_method, address \| address_id, items?}`: create an order from the cart, or **Buy now** with `items: [{product_id, quantity}]` (cart untouched) |
| GET | `/api/orders/` | Customer / Admin | Order history: orders with payment received (paid or refunded). Admins see all |
| GET | `/api/orders/<id>/` | Owner / Admin | One order (others get 404) |
| PATCH | `/api/orders/<id>/status/` | Admin | `{status}`: processing / shipped / delivered / cancelled (paid orders only) |

Statuses: Pending → Paid → Processing → Shipped → Delivered (or Cancelled).

### Payments (`/api/payments/`): test mode

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payments/config/` | Payment methods (`card`, `bkash`, `nagad`, `cod`), each with its provider and whether it is a demo |
| POST | `/api/payments/session/` | `{order_id}`: start payment → `checkout_url` |
| POST | `/api/payments/cod/` | `{order_id}`: place a **cash-on-delivery** order (stock reserved, status *Processing*, payment *Pay on delivery*) |
| POST | `/api/payments/confirm/` | `{session_id, status?}`: server verifies the payment with Stripe / bKash / Nagad |
| POST | `/api/payments/cancel/` | `{order_id}`: customer left the payment page |
| POST | `/api/payments/demo/complete/` | Demo gateway only: `{session_id, outcome: success\|failure}` |
| POST | `/api/payments/webhook/` | Stripe webhook (signature verified with `STRIPE_WEBHOOK_SECRET`) |

After a successful payment the server re-checks stock, reduces it, marks the order **Paid** and
clears the cart. This happens exactly once, even if confirmation arrives twice (redirect + webhook,
or a page refresh). If stock ran out while paying, the payment is refunded and the order cancelled.

**Payment methods**

| Method | Real gateway (switched on by `.env`) | Without credentials (development) |
|---|---|---|
| Card | Stripe Checkout (`STRIPE_*`) | Demo card page |
| bKash | bKash Tokenized Checkout (`BKASH_*`) | Demo bKash page (number → code `123456` → PIN) |
| Nagad | Nagad Merchant API, RSA-encrypted (`NAGAD_*`) | Demo Nagad page |

In production the demo pages are off (`PAYMENTS_ALLOW_DEMO`), so unconfigured methods are hidden.
See [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) for setup and test credentials.

**Test payments**

- **Demo gateway (default):** while `STRIPE_SECRET_KEY` is the placeholder, checkout uses a built-in
  simulated payment page with *Pay* / *Simulate a failed payment* buttons. No card details, no real money.
- **Stripe test mode:** put your keys in `backend/.env` (`STRIPE_SECRET_KEY=sk_test_...`) and
  `frontend/.env` (`VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`), then restart the servers. Pay with test
  card `4242 4242 4242 4242`, any future date, any CVC. For webhooks locally:
  `stripe listen --forward-to localhost:8000/api/payments/webhook/` and copy the printed `whsec_...`
  into `STRIPE_WEBHOOK_SECRET`.

### Admin (`/api/`): admin only

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/stats/` | Total sales, current orders, low-stock count, recent orders |
| POST / PATCH / DELETE | `/api/categories/` · `/api/categories/<id>/` | Manage categories (delete refused while products use it) |
| GET | `/api/products/?low_stock=true` | Products with 5 or fewer in stock |
| GET | `/api/orders/?status=shipped` | Filter orders by status |

### AI shopping assistant (`/api/chat/`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chat/config/` | `{enabled, mode}`: `mode` is `"ai"` (Claude, `ANTHROPIC_API_KEY` set) or `"basic"` (built-in auto-reply bot) |
| POST | `/api/chat/` | `{messages: [{role, content}]}` → `{reply, cart_updated, handoff, mode}` (guests welcome; rate-limited, `THROTTLE_CHAT`) |

A chat button on every page opens **Haatbox Assistant**, powered by Claude (`claude-opus-5-5`, Messages API with tools, run inside Django).
It answers in English or Bangla and uses tools that read the real database: product search and details, categories,
store info (shipping and payments), **the logged-in customer's own orders**, and **add to cart**.
When the customer wants a person (or has a problem the AI can't solve), the AI calls its `request_human_agent` tool
and a **Chat with our team** button hands the conversation over to live chat.
**The chat always answers automatically.** With `ANTHROPIC_API_KEY` in `backend/.env` it uses Claude. Without a key (or if the
Claude API is down) the **built-in auto-reply bot** (`backend/assistant/basic.py`) answers instead, with no cost: product search with
prices and links (English, Bangla, Banglish, budgets like "২০০০ টাকার মধ্যে"), delivery, payment, returns, store location,
categories, the customer's orders and "add … to my cart". Anything it can't handle goes to the team.

### Live chat with the team (`/api/support/`)

Customers (guests too) chat with real people; admins answer from **Admin dashboard → Live chat**. Both sides poll every
few seconds (no WebSocket server needed). Guests prove ownership with a random token (`X-Support-Token` header; only its hash is stored).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/support/conversations/` | Start a chat `{message, name?, transcript?}` → `{conversation, messages, token?}` (transcript = AI chat to share) |
| GET | `/api/support/conversations/mine/` | Logged-in customer's open chat |
| GET / POST | `/api/support/conversations/<id>/messages/` | New messages (`?after=<id>&seen=1`) / send a message |
| POST | `/api/support/conversations/<id>/close/` | Customer ends the chat |
| GET | `/api/support/admin/conversations/?status=open\|closed\|all` | Admin: chat list with unread counts |
| GET | `/api/support/admin/summary/` | Admin: `{open, unread}` (menu badge) |
| GET / POST | `/api/support/admin/conversations/<id>/messages/` | Admin: read (marks read) / reply |
| PATCH | `/api/support/admin/conversations/<id>/` | Admin: `{status: "open" \| "closed"}` |

| GET | `/api/support/status/` | `{team_online, auto_reply}` (shown before a chat starts) |

Rate limits: `THROTTLE_SUPPORT_POLL` (default 120/minute) and `THROTTLE_SUPPORT_SEND` (20/minute).

**AI auto-reply in live chat** (`backend/support/auto_reply.py`): when a customer writes and the team is away (no admin has the
dashboard open), the AI answers at once and says a person will follow up. When an admin is online, the AI waits
`SUPPORT_AUTO_REPLY_AFTER_SECONDS` (default 120) for a human reply first. It never answers twice, never after a human has replied,
and admins can switch it off per chat (**AI auto-reply: On/Off**). Settings: `SUPPORT_AUTO_REPLY`, `SUPPORT_AUTO_REPLY_AFTER_SECONDS`,
`SUPPORT_AGENT_ONLINE_SECONDS`. "Team online" is kept in Django's cache; with several server processes in production use a shared
cache (Redis or the database cache).

### Maps

Maps use **OpenStreetMap + Leaflet** (free, no API key; loaded only on pages with a map).
- **Checkout:** customers can drop a pin (or use their device location) for the rider. It is saved on the address
  (`latitude`, `longitude`; both or neither) and shown on the order page for the customer and the admin, with a *Get directions* link.
- **Help → Visit our store** (`/help#visit`, also *Find our store* in the footer): the store's location.

### Sample data

```bash
python manage.py seed_products --with-images   # 14 categories, 65 products (BDT) with brand, details + 2 photos each (safe to run again)
python manage.py seed_demo_users               # demo_admin / demo_customer (see docs/DEMO_GUIDE.md)
```

### Run tests

```bash
cd backend && source venv/bin/activate && python manage.py test   # Django API tests
cd frontend && npm test                                           # React unit tests (Vitest + Testing Library)
cd frontend && npm run lint && npm run build                      # lint + production build
```

## Status

- [x] Day 1 — Step 1: Project Planning and Setup
- [x] Day 1 — Step 2: Environment Setup
- [x] Day 1 — Step 3: Database and Backend Models
- [x] Day 1 — Step 4: Authentication API
- [x] Day 1 — Step 5: Product API and Django Admin
- [x] Day 1 — Step 6: React Foundation
- [x] Day 2 — Step 1: Shopping Cart API and UI
- [x] Day 2 — Step 2: Checkout and Address Collection
- [x] Improvements: BDT currency, 30-product catalogue, Haatbox brand, new navbar & footer
- [x] Day 2 — Step 3: Payment Test Integration (Stripe test mode + demo gateway)
- [x] Day 2 — Step 4: Order API and Order History
- [x] Day 2 — Step 5: Basic Admin Dashboard
- [x] Day 2 — Step 6: Integration and Responsive Testing
- [x] Day 2 — Step 7: Security and Production Preparation
- [x] Day 2 — Step 8: Demo Preparation (local demo)
