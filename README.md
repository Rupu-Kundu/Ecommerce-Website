# Ecommerce Website

A full-stack e-commerce MVP: React + Vite frontend, Django REST Framework backend, PostgreSQL database, JWT authentication, and Stripe test-mode payments.

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

## Frontend Pages

| Route | Page | Access |
|---|---|---|
| `/` | Home | Public |
| `/products` | Product list (search, category filter, sort, pagination) | Public |
| `/products/:id` | Product details | Public |
| `/login` | Login | Guests only |
| `/register` | Registration | Guests only |
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

### Sample data

```bash
python manage.py seed_products   # 4 categories, 12 products (safe to run again)
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
