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

## Status

- [x] Day 1 — Step 1: Project Planning and Setup
- [x] Day 1 — Step 2: Environment Setup
- [x] Day 1 — Step 3: Database and Backend Models
