# Project Plan — E-Commerce MVP

Roadmap reference: Day 1 — Step 1 (Project Planning and Setup).

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | Python + Django REST Framework |
| Database | PostgreSQL |
| Authentication | JWT (access + refresh tokens) |
| Payments | Stripe test mode (PayPal sandbox as alternative) |
| Styling | Tailwind CSS or plain CSS |
| API testing | Postman or Insomnia |
| Version control | Git + GitHub (one shared repository) |

## 2. Feature Scope

### Included in MVP

| Feature | Priority | Day |
|---|---|---|
| User registration and login (JWT) | High | 1 |
| Product listing, search, and details | High | 1 |
| Category filtering and price sorting | Medium | 1 |
| Shopping cart | High | 2 |
| Checkout with shipping address | High | 2 |
| Payment test flow (Stripe test mode) | High | 2 |
| Order creation and order history | High | 2 |
| Basic admin product and order management | High | 2 |
| Responsive frontend | High | 1–2 |
| Basic automated tests | Medium | 2 |

### Deferred (not in MVP)

- Wishlist and reviews
- Coupon system
- Password reset email
- Advanced reporting / analytics
- Refund automation
- Live chat
- Recommendation engine
- Multi-vendor marketplace

## 3. Page List

| # | Page | Route (planned) | Access | Built on |
|---|---|---|---|---|
| 1 | Home | `/` | Public | Day 1 |
| 2 | Products | `/products` | Public | Day 1 |
| 3 | Product details | `/products/:id` | Public | Day 1 |
| 4 | Login | `/login` | Guest | Day 1 |
| 5 | Registration | `/register` | Guest | Day 1 |
| 6 | Cart | `/cart` | Logged-in user | Day 2 |
| 7 | Checkout | `/checkout` | Logged-in user | Day 2 |
| 8 | Orders | `/orders` | Logged-in user | Day 2 |
| 9 | Admin dashboard | `/admin-dashboard` | Admin only | Day 2 |
| — | 404 Not Found | `*` | Public | Day 1 |

> The admin UI route is `/admin-dashboard` so it does not clash with Django's built-in `/admin/` site.

## 4. Project Structure

One shared Git repository with separate `frontend/` and `backend/` folders.

Current (after Step 1):

```text
Ecommerce-Website/
├── .gitignore
├── README.md
├── docs/
│   └── PROJECT_PLAN.md
├── backend/
│   └── .env.example
└── frontend/
    └── .env.example
```

Target (filled in during Steps 2–6):

```text
Ecommerce-Website/
├── backend/
│   ├── config/          # Django project settings
│   ├── accounts/        # users and authentication
│   ├── products/        # categories and products
│   ├── cart/            # cart and cart items
│   ├── orders/          # orders and order items
│   ├── payments/        # payment records
│   ├── manage.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── context/
    │   ├── services/
    │   └── routes/
    ├── public/
    └── package.json
```

## 5. Git Plan

- Repository: one shared repo (`Ecommerce-Website`) on GitHub.
- Working branch: `develop`.
- Commit after each completed roadmap step.
- Never commit real `.env` files — only `.env.example` templates.

## 6. Environment Variable Plan

Real values go in `.env` files (ignored by Git). Templates are committed as `.env.example`.

### Backend — `backend/.env`

| Variable | Purpose | Example (dev) | Used from |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | Django cryptographic key | long random string | Step 2 |
| `DJANGO_DEBUG` | Debug mode on/off | `True` (dev), `False` (prod) | Step 2 |
| `DJANGO_ALLOWED_HOSTS` | Allowed hostnames | `localhost,127.0.0.1` | Step 2 |
| `DB_NAME` | PostgreSQL database name | `ecommerce_db` | Step 2 |
| `DB_USER` | PostgreSQL user | `postgres` | Step 2 |
| `DB_PASSWORD` | PostgreSQL password | — | Step 2 |
| `DB_HOST` | PostgreSQL host | `localhost` | Step 2 |
| `DB_PORT` | PostgreSQL port | `5432` | Step 2 |
| `CORS_ALLOWED_ORIGINS` | Frontend origins allowed to call the API | `http://localhost:5173` | Step 3 |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | Access token lifetime | `30` | Step 4 |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | Refresh token lifetime | `1` | Step 4 |
| `FRONTEND_URL` | Used for payment success/cancel redirects | `http://localhost:5173` | Day 2 |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode) | `sk_test_...` | Day 2 |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` | Day 2 |

### Frontend — `frontend/.env`

Vite only exposes variables that start with `VITE_`. Never put secret keys here — everything in the frontend is visible to the browser.

| Variable | Purpose | Example (dev) | Used from |
|---|---|---|---|
| `VITE_API_BASE_URL` | Django API base URL | `http://localhost:8000/api` | Step 6 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (safe for browser) | `pk_test_...` | Day 2 |

### Rules

- `.env` is never committed; `.env.example` always is.
- Secret keys (Django, DB password, Stripe secret, webhook secret) live only in `backend/.env`.
- When a new variable is added, update the matching `.env.example` in the same commit.
