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
| `/checkout` | Checkout (address, shipping, summary) | Logged-in users |
| `/help` | Help center (shipping, returns, payment, FAQ) | Public |
| `/payment/demo` · `/payment/success` · `/payment/cancel` | Test payment pages | Logged-in users |
| `/orders` · `/orders/:id` | Order history and order details | Logged-in users |
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
| DELETE | `/api/products/<id>/` | Admin | Delete |

Query parameters for `GET /api/products/`:

- `search=phone`: searches name, description, and category name
- `category=electronics`: filter by category slug (or id)
- `ordering=price` / `ordering=-price`: sort by price (also `created_at`, `name`)
- `page=2`: next page

Guests and customers only see products with `is_available=true`; admins see all.

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
| POST | `/api/orders/` | Customer | `{shipping_method, address \| address_id}`: create an order from the cart (awaits payment) |
| GET | `/api/orders/` | Customer / Admin | Order history: orders with payment received (paid or refunded). Admins see all |
| GET | `/api/orders/<id>/` | Owner / Admin | One order (others get 404) |
| PATCH | `/api/orders/<id>/status/` | Admin | `{status}`: processing / shipped / delivered / cancelled (paid orders only) |

Statuses: Pending → Paid → Processing → Shipped → Delivered (or Cancelled).

### Payments (`/api/payments/`): test mode

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payments/config/` | Active provider (`stripe` or `demo`) |
| POST | `/api/payments/session/` | `{order_id}`: start payment → `checkout_url` |
| POST | `/api/payments/confirm/` | `{session_id}`: server verifies the payment with the provider |
| POST | `/api/payments/cancel/` | `{order_id}`: customer left the payment page |
| POST | `/api/payments/demo/complete/` | Demo gateway only: `{session_id, outcome: success\|failure}` |
| POST | `/api/payments/webhook/` | Stripe webhook (signature verified with `STRIPE_WEBHOOK_SECRET`) |

After a successful payment the server re-checks stock, reduces it, marks the order **Paid** and
clears the cart. This happens exactly once, even if confirmation arrives twice (redirect + webhook,
or a page refresh). If stock ran out while paying, the payment is refunded and the order cancelled.

**Test payments**

- **Demo gateway (default):** while `STRIPE_SECRET_KEY` is the placeholder, checkout uses a built-in
  simulated payment page with *Pay* / *Simulate a failed payment* buttons. No card details, no real money.
- **Stripe test mode:** put your keys in `backend/.env` (`STRIPE_SECRET_KEY=sk_test_...`) and
  `frontend/.env` (`VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`), then restart the servers. Pay with test
  card `4242 4242 4242 4242`, any future date, any CVC. For webhooks locally:
  `stripe listen --forward-to localhost:8000/api/payments/webhook/` and copy the printed `whsec_...`
  into `STRIPE_WEBHOOK_SECRET`.

### Sample data

```bash
python manage.py seed_products   # 6 categories, 30 products, prices in BDT (safe to run again)
```

### Run backend tests

```bash
cd backend && source venv/bin/activate
python manage.py test
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
