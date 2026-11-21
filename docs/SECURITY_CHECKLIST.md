# Security & Production Checklist

Use this before every deployment. "✅" items are already handled in the code. "☐" items must be done on the server.

## Secrets & configuration

- ✅ All secrets come from environment variables (`backend/.env`, never committed). Templates are in `backend/.env.example` and `frontend/.env.example`.
- ✅ The backend refuses to start without `DJANGO_SECRET_KEY`.
- ✅ No real keys are in the repository. Tests only use obviously fake values (`sk_test_51Fake…`).
- ✅ The Stripe secret key exists only on the backend. The frontend only ever sees the publishable key.
- ☐ Generate a new `DJANGO_SECRET_KEY` for production (don't reuse the development one).
- ☐ Use a strong, unique PostgreSQL password and a database user without superuser rights.

## Django settings

- ✅ `DEBUG` is **False** unless `DJANGO_DEBUG=True` is set explicitly.
- ✅ When `DEBUG=False`: HTTPS redirect, HSTS (1 year), secure session/CSRF cookies, and `X-Forwarded-Proto` support are enabled.
- ✅ Always on: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.
- ☐ Set `DJANGO_ALLOWED_HOSTS` to the real API domain only.
- ☐ Run `python manage.py check --deploy` with production variables. The only expected warnings are:
  - `payments.W001`, until real Stripe keys are set.
  - `security.W021` (HSTS preload is optional, enable with `SECURE_HSTS_PRELOAD=True` when ready).

## CORS / CSRF

- ✅ CORS uses an explicit allow-list (`CORS_ALLOWED_ORIGINS`), never "allow all".
- ☐ Set `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` to the exact production frontend URL, e.g. `https://haatbox.example`.

## Authentication & access control

- ✅ JWT authentication. Short-lived access tokens are kept in memory. Refresh tokens rotate and are blacklisted on logout.
- ✅ Every API endpoint requires login unless it is explicitly public (products, categories, shipping methods).
- ✅ Admin-only endpoints (product/category writes, order status, dashboard stats) return 403 for customers.
- ✅ Customers can only read their own cart, orders and payments. Other people's orders return 404.
- ✅ Login and registration are rate-limited (`THROTTLE_AUTH`, default 10/minute). General API limits apply too.
- ✅ Django password validators (length, common passwords, similarity to username).

## Input validation & data integrity

- ✅ All input is validated by DRF serializers: prices > 0, stock ≥ 0, phone and postal-code formats, valid shipping method, image files only.
- ✅ Prices and totals are always calculated on the server. Prices sent by the client are ignored.
- ✅ Stock can never go negative. It is a `PositiveIntegerField`, re-checked under a database lock before it is reduced, and payments are refunded if stock ran out.
- ✅ Order item prices are snapshots, so later price changes don't alter past orders.

## Payments

- ✅ Card details never touch the server (Stripe Checkout hosted page, or the demo gateway that takes no card data).
- ✅ Payment success is verified with Stripe on the server, never trusted from the browser.
- ✅ Stripe webhooks are rejected unless the `Stripe-Signature` matches `STRIPE_WEBHOOK_SECRET`.
- ✅ Confirmation is idempotent: no duplicate orders and no double stock reduction.
- ✅ Each method (Card, bKash, Nagad) uses its real gateway as soon as its credentials are set.
- ✅ The demo gateway is **off in production** (`PAYMENTS_ALLOW_DEMO` defaults to `DEBUG`). Unconfigured methods are
  then simply unavailable, so nobody can "pay" with a simulated page. `check --deploy` warns (payments.W003) if it is turned on.
- ✅ bKash payments are executed and checked on the server (`execute` / `payment/status`). Nagad payments are verified with
  `verify/payment`. The paid amount must equal the order total.
- ✅ Nagad requests are RSA-encrypted with Nagad's public key and signed with the merchant private key.
- ✅ Wallet PINs, OTPs and card numbers never reach our server (provider pages, or the demo page that sends nothing).
- ☐ In the Stripe dashboard, add a webhook endpoint `https://<api-domain>/api/payments/webhook/` for the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `checkout.session.async_payment_failed`, then put its signing secret in `STRIPE_WEBHOOK_SECRET`.
- ☐ Use `sk_live_…` keys only after testing with `sk_test_…`.
- ☐ bKash: switch `BKASH_BASE_URL` to the live URL (`https://tokenized.pay.bka.sh/v1.2.0-beta`) with live credentials
  after sandbox testing. bKash requires a merchant agreement.
- ☐ Nagad: set `NAGAD_BASE_URL` to the live URL provided by Nagad, and store `NAGAD_MERCHANT_PRIVATE_KEY` only in the
  server's secret store. Refunds for Nagad are issued from the Nagad merchant panel; the server logs every case that needs one.

## AI assistant

- ✅ `ANTHROPIC_API_KEY` lives only in `backend/.env`. The browser talks to `/api/chat/`, never to Anthropic.
- ✅ Order and cart tools are bound to the logged-in user, so the assistant can't read or change anyone else's data. Guests can only search products and read store info.
- ✅ Tool inputs are validated with the same rules as the regular API (availability, stock, quantity limits).
- ✅ Replies are rendered as text: no HTML, and only internal links (`/products/…`, `/orders/…`) are clickable.
- ✅ Rate-limited (`THROTTLE_CHAT`, default 20/minute), with message length (2,000) and history (20 turns) limits, to protect the API bill.
- ☐ Set a monthly spend limit for the API key in the Claude Console.

## Errors & logging

- ✅ API errors are JSON (`{"detail": …}` or per-field messages).
- ✅ Unexpected errors are logged on the server and return a generic 500 message, with no stack traces or internals.
- ☐ Point logs to the hosting platform's log viewer (`LOG_LEVEL=INFO`).

## Frontend

- ✅ Only `VITE_*` variables reach the browser, and none of them are secret.
- ☐ Build with `VITE_API_BASE_URL=https://<api-domain>/api` and serve over HTTPS.

## Before going live

- ☐ `python manage.py migrate`, then `python manage.py collectstatic`.
- ☐ Store product images on persistent storage (e.g. Cloudinary or S3), not the server's disk.
- ☐ Do **not** run `seed_demo_users` in production. It refuses to unless `--force` is given.
- ☐ Take a database backup and test restoring it.
