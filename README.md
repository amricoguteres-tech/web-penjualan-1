# NEBULA X

NEBULA X is a Next.js App Router digital marketplace foundation. It combines the existing galactic landing experience with PostgreSQL-backed products, role-protected workspaces, order creation, and a Midtrans Snap QRIS-only integration that remains disabled until server and public client keys are configured.

## Current capabilities

- Responsive Three.js/React Three Fiber and GSAP landing experience, reduced-motion support, live product/category browsing, and a browser-local cart. Cart API/database synchronization is not implemented.
- Prisma/PostgreSQL models and an initial migration for identity, catalog, orders, payments, invoices, coupons, wallet records, services, reviews, notifications, support, audit logs, and rate-limit buckets.
- Auth.js Credentials authentication with bcrypt password hashing, JWT sessions checked against current user state, registration, password reset through SMTP, and server-side USER/ADMIN authorization.
- Database-backed user and admin overview metrics, order/service/support/invoice views, admin catalog and management APIs, and audit records for privileged changes.
- Server-priced checkout with inventory reservation, coupon checks, idempotency keys, QRIS-only Midtrans Snap transactions, and signed/idempotent webhook processing.
- Optional Redis-backed rate limiting and short-lived public stats/review caching; PostgreSQL remains the rate-limit backend when Redis is not configured.
- Optional S3-compatible private storage for validated product images and ZIP/PDF downloads. Purchased downloads require a settled order and use short-lived signed URLs.
- SMTP verification before mail delivery; optional email verification and transactional order/payment/support messages.
- Product detail and invoice pages; public listings include only published products and approved reviews.
- No products, customer activity, sales, or payment transactions are fabricated. Checkout remains unavailable until database and payment configuration are present.

## Local setup

Requirements: Node.js 20.9+, npm, and PostgreSQL 14+.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a PostgreSQL connection string, for example `postgresql://nebula@localhost:5432/nebula_x?schema=public`.
3. Generate secrets with `openssl rand -base64 32`; set `AUTH_SECRET` and `EMAIL_OUTBOX_ENCRYPTION_KEY` (each is a distinct 32-byte Base64 key). Set `NEXT_PUBLIC_SITE_URL` and `AUTH_URL` to the local origin.
4. Install dependencies and initialize the database:

   ```sh
   npm install
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   ```

5. To bootstrap the first admin, set `NEBULA_ADMIN_EMAIL` and a unique `NEBULA_ADMIN_PASSWORD` of at least 16 characters before running the seed. The seed never promotes an existing account. Do not retain bootstrap credentials in deployment environments.
6. Run `npm run dev`. Register a normal account at `/register`; admin access is available only to the bootstrap account and is checked server-side.

Set `REQUIRE_EMAIL_VERIFICATION="true"` only after configuring a working `EMAIL_SERVER` and `EMAIL_FROM`. Email jobs are transactionally queued, encrypted at rest using `EMAIL_OUTBOX_ENCRYPTION_KEY`, and delivered by the outbox worker. A successful SMTP submission means the SMTP server accepted the message; it does not prove inbox delivery.

`npm run db:migrate` is intended for local schema development and creates migrations. Use `npm run db:deploy` to apply committed migrations in a deployment. The seed creates product categories and, only when explicitly configured, the initial admin. It creates no products, customers, orders, or payments.

## Midtrans Sandbox — QRIS only

Create a sandbox merchant account, activate QRIS for the merchant, keep the **Server Key** in `MIDTRANS_SERVER_KEY`, and set the public client key:

```dotenv
MIDTRANS_IS_PRODUCTION="false"
MIDTRANS_SERVER_KEY="<sandbox-server-key>"
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY="<sandbox-client-key>"
```

The checkout sends exactly `enabled_payments: ["qris"]` to Snap; other merchant methods are never requested or shown. Legacy `MIDTRANS_ENABLED_PAYMENTS` values are ignored. Customers may scan the generated dynamic QR using DANA or another payment app that supports QRIS. The static merchant QR image is not used for checkout.

Set the notification URL in Midtrans to `https://<your-host>/api/payments/midtrans/webhook`. Checkout stores an order and payment attempt before contacting Snap, calculates the amount from database prices on the server, and gives the QRIS transaction a 15-minute expiry. Use the same `Idempotency-Key` when retrying the same attempt. The payment page embeds Snap's order-specific dynamic QR, shows the invoice/order amount and countdown, and polls the local server record. Its status-check action asks Midtrans Get Status server-to-server. Browser callbacks and return URLs never mark an order paid; only a verified webhook or server-to-server reconciliation can do that.

The QR is generated by Midtrans Snap for each order; NEBULA X does not derive or display a static merchant QR as a dynamic payment code. Exercise transaction creation, amount matching, pending, settlement, expiry, payment failure, duplicate notifications, invalid signatures, and reconciliation in the merchant Sandbox before accepting real payments. Unit/integration tests are not evidence of live Sandbox verification.

## Password reset mail

Configure `EMAIL_SERVER` as a Nodemailer SMTP URL, `EMAIL_FROM` as the verified sender, and `NEXT_PUBLIC_SITE_URL` as the canonical public base URL. SMTP verify + message acceptance by the configured SMTP server are checked; they do not prove delivery to an inbox. Without SMTP configuration, reset requests return a server configuration error; no reset link is exposed in the browser or logs.
Set `NEXT_PUBLIC_SUPPORT_EMAIL` only to a monitored support address; otherwise the interface directs customers to authenticated support tickets.

Email verification is opt-in. When enabled, new accounts must verify their address before login; resend and verification endpoints are rate-limited. Password reset and verification tokens are stored hashed and expire.

## Isolated integration test environment

The automated integration runner applies Prisma migrations and runs only against a local test database whose name ends in `_test`. It replaces `DATABASE_URL` with `TEST_DATABASE_URL`, refuses non-local service endpoints, requires the S3 bucket name to end in `-test` or `_test`, and refuses production Midtrans mode. It never uses the production Compose services or volumes.

Copy the placeholder-only test environment and start the dedicated services:

```sh
cp .env.test.example .env.test
docker compose -p nebula-test -f docker-compose.test.yml up -d --wait
npm run test:integration
docker compose -p nebula-test -f docker-compose.test.yml down
```

The test Compose file exposes only loopback ports: PostgreSQL `55432`, Redis `56379`, Mailpit SMTP/API `51025`/`58025`, and MinIO `59000`/`59001`. The supplied credentials are local disposable test credentials, not production credentials. Mailpit captures all test mail without sending it to the internet. To reset only this test stack, run `docker compose -p nebula-test -f docker-compose.test.yml down -v`; this deletes the isolated test database and MinIO volume.

Without Docker, install PostgreSQL, Redis, Mailpit, and MinIO separately and bind them to loopback using those ports. Create a dedicated PostgreSQL role/database named `nebula_x_test`, set only test credentials in ignored `.env.test`, and use a `-test` S3 bucket. `npm run test:integration` applies pending migrations idempotently; it does not truncate or drop the database. Test-created users, catalog records, carts, orders, stock changes, payments, outbox records, and uploaded objects are cleaned up. Mailpit's captured messages and the test bucket itself may remain between runs.

`npm test` runs deterministic unit tests only. `npm run test:integration` refuses to start when `.env.test` or any required local service configuration is absent; it does not silently skip integration tests. Live Midtrans Sandbox checkout and HTTPS browser webhook tests require separate sandbox merchant credentials, a reachable HTTPS callback URL, a test admin account, and a configured staging browser. Do not copy production keys into `.env.test`; leave `MIDTRANS_IS_PRODUCTION=false`.

The database integration suite covers PostgreSQL migration history, registration and duplicate registration, Auth.js credentials login/session persistence/logout, user/admin role classification, product and cart persistence, coupon pricing, transaction rollback, invoice and inventory records, webhook duplicate/replay and concurrency cases, invalid signatures/amounts, late settlement/manual review, digital-download eligibility, and concurrent Get Status reconciliation. The infrastructure suite exercises Redis, Mailpit SMTP acceptance and capture, retry/dead-letter and stale-worker recovery, the SMTP-accept/crash window, and MinIO private upload/download/signed-URL expiry. These tests are not proof of Midtrans Sandbox behavior or a browser E2E checkout.

## Browser Sandbox release check

There is no automated browser payment test without an active test deployment and merchant sandbox. For a real E2E run, use an HTTPS staging origin with only test services and credentials, seed a test administrator, create a test-only product with a validated digital asset, and configure the Midtrans notification URL to the staging webhook. In a clean browser profile: register a customer, sign in, search and add the product, check out through the Sandbox Snap UI, complete an enabled sandbox method, then verify the order/payment, inventory, invoice, admin payment view, and authorized digital download. Also verify the download is denied before settlement, the webhook is idempotent on replay, and a late settlement after order closure is flagged for manual review. Save browser/network logs with secrets and personal information redacted. Do not report this run as verified until performed against that HTTPS staging environment.

## CSP, payment reconciliation, and email outbox

- CSP is sent in `Content-Security-Policy-Report-Only` by default. Each request receives a cryptographic nonce; reports are accepted at `/api/security/csp-report`. `CSP_ENFORCE=true` switches to enforcement, but do this only after reviewing browser reports for the actual deployment, including WebGL and Midtrans Snap. Do not treat header presence or unit tests as browser validation. Keep `CSP_ENFORCE=false` until then. Configure external product-image origins as exact HTTPS origins in `CSP_IMAGE_ORIGINS` (comma-separated).
- Admins can manually reconcile an eligible Midtrans payment from the payment workspace. Configure `PAYMENT_RECONCILIATION_SECRET` for scheduled `POST /api/cron/payments/reconcile` calls and run it periodically from a trusted scheduler. The endpoint asks Midtrans server-to-server for transaction status; a browser return URL is never proof of settlement.
- Configure `OUTBOX_WORKER_SECRET` and periodically call `POST /api/cron/email-outbox` with `Authorization: Bearer <secret>`. The worker retries transient SMTP failures with bounded exponential backoff; permanently exhausted jobs appear in the admin email outbox and can be manually retried. Keep both worker secrets private and use HTTPS.
- Outbox payload encryption keys must be backed up securely and kept stable; changing the key makes queued messages undecryptable. Key rotation requires a planned decrypt/re-encrypt migration. Outbox delivery is at-least-once: a process crash after SMTP accepts a message but before the database marks it sent can cause a retry. The idempotency key prevents duplicate jobs, not all duplicate inbox delivery.

## Redis and object storage

Redis is optional. Configure `REDIS_URL` to enable Redis rate limiting and a 60-second cache for public statistics/reviews. A configured Redis outage fails closed for rate-limited operations; cache reads fall back to PostgreSQL. Do not expose Redis publicly; production deployments should use authenticated TLS connections.

Configure S3-compatible storage with `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. The upload endpoints are admin-only:

- `POST /api/admin/products/{id}/images` — multipart field `file`, JPEG/PNG/WebP, up to 5 MB.
- `POST /api/admin/products/{id}/digital-asset` — multipart field `file`, ZIP/PDF, up to 50 MB. Replacing an asset invalidates the old download URL.
- `GET /api/me/products/{productId}/download` — requires a settled purchase; returns a 60-second signed download URL.

Object storage is not required for ordinary external HTTPS product thumbnails. Configure bucket policies and provider-side encryption/backup according to the selected S3-compatible provider.

## Docker deployment

Copy `.env.example` to `.env`, set non-empty secrets and a production canonical URL, then start the local PostgreSQL and Redis services:

```sh
docker compose up -d postgres redis
docker compose --profile maintenance run --rm migrate
docker compose up -d --build web
```

The migration is intentionally a separate, explicit maintenance command. Back up the target database and review migration SQL before applying it to an existing environment. The Compose Redis instance is private to the Compose network and intended for local/single-host use, not as a public production Redis service. Terminate HTTPS at a trusted reverse proxy and restrict direct access to the application port.

## Commands

- `npm run dev` — local development server
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript checks
- `npm test` — unit tests only (no external services)
- `npm run test:integration` — guarded local integration suite and test-only migrations
- `npm run build` — production build
- `npm run db:generate` — generate Prisma Client
- `npm run db:migrate` — create/apply a local development migration
- `npm run db:deploy` — apply committed migrations
- `npm run db:seed` — seed categories and optional initial admin

## Security and operations notes

- Never place `MIDTRANS_SERVER_KEY`, `AUTH_SECRET`, SMTP credentials, or database credentials in `NEXT_PUBLIC_*` variables.
- `.env` and `.env.*` are ignored by Git; `.env.example` contains placeholders only. `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`, `NEXT_PUBLIC_SUPPORT_EMAIL`, and `NEXT_PUBLIC_SITE_URL` are intentionally public build/runtime values, not secrets.
- `.npmrc` omits optional peer packages because Auth.js declares Nodemailer 8 as an optional email-provider peer, while this app uses a patched Nodemailer 10 alias directly. Do not remove that setting without revisiting both dependency audit and SMTP integration.
- Rate limiting uses configured Redis or falls back to PostgreSQL. `TRUST_PROXY_HEADERS` defaults to false; enable it only when a controlled edge proxy strips incoming forwarding headers and writes a valid `X-Forwarded-For` address. Without it, development requests share a conservative fallback bucket; production rate-limited operations and health checks report unavailable until trusted proxy headers are configured. Do not expose the app directly if clients can spoof forwarding headers.
- Admin writes use server-side role checks, same-origin checks, schema validation, and audit records. Product/category records with dependencies are archived or rejected rather than cascading into order history.
- Payment webhooks verify Midtrans SHA-512 signatures with timing-safe comparison, validate amount/order references, and deduplicate events. A settlement received after cancellation is recorded for reconciliation and does not silently reactivate the order.
- Configure HTTPS at the trusted edge. CSP starts in report-only mode and should be enforced only after real browser violations have been reviewed. Review proxy, database, backup, monitoring, and incident-response policies before launch.
- Dashboard readiness labels report configuration only; they do not claim a provider, Redis, or storage service is healthy.

## Integrations not yet externally verified

- No PostgreSQL server or production credentials are bundled. Apply the migration and exercise integration flows against a real test database before launch.
- Midtrans credentials, merchant payment-method activation, webhook reachability, and real provider responses must be tested in the merchant sandbox. No payment is claimed as complete by this repository alone.
- Redis, SMTP, and object storage adapters remain inactive until configured and verified against the actual services. Durable email outbox and Midtrans reconciliation code are implemented, but worker scheduling, SMTP delivery, provider sandbox reconciliation, and encryption-key operations still require runtime verification.
- Wallet top-ups, automatic service provisioning/provider adapters, refund execution, and historical analytics/chart aggregation are not implemented.
- Publish real business identity, terms, privacy, refund, and support details before public transactions. Configure the production canonical origin and a monitored support address.
- Docker deployment files provide local PostgreSQL and Redis services, but Docker and a live database were unavailable in the authoring environment; database migrations and external integrations were therefore not applied or end-to-end tested here.
- For installations without Docker: install PostgreSQL 14+, Redis 7+ (optional), and Node.js 20.9+ separately; create a database and role, configure `DATABASE_URL` and `REDIS_URL`, run `npm ci`, `npm run db:generate`, `npm run db:deploy`, then `npm run start`. Configure S3 and SMTP using their provider endpoints/credentials; they are optional unless the associated features are required. Put the app behind HTTPS and a trusted proxy.
- If setting `POSTGRES_PASSWORD` for Compose, use a strong URL-safe password (for example, random base64url); otherwise URL-encode credentials if constructing `DATABASE_URL` manually.

## Project layout

- `src/app` — App Router pages and protected API routes
- `src/components` — marketplace, 3D experience, auth forms, command center, and workspace views
- `src/lib` — Prisma, authentication/authorization, validation helpers, rate limiting, Redis, SMTP, object storage, payment signatures, and catalog mapping
- `prisma` — PostgreSQL schema, initial migration, and explicit seed
- `tests` — focused unit tests for role policy, coupon arithmetic, and payment signature/status logic
