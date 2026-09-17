# qrating

**Version:** 0.17.0
**Status:** self-hosting MVP with SaaS-ready administration
**Stack:** Node.js, Express, React, Vite, TailwindCSS, PostgreSQL, Docker Compose

qrating is a self-hosted QR feedback application for events. Guests scan a QR code, land on the currently relevant event, and submit feedback in a few seconds. Operators manage events, Pretix sync, event images, forms, QR links, analytics, exports, reports, notifications, public website content, and internal plan access from the admin area.

This repository was built with AI-assisted, vibe-coded development. Treat it like a pragmatic product baseline: review configuration, security settings, legal text, and operational processes before using it in production.

## Highlights

- Product website: `https://qrating.de`
- Admin/Web UI domain: `https://app.qrating.de`
- Feedback/QR domain: `https://qrat.ing`
- Public product website on `/` with editable texts, section headings, FAQ, imprint, and privacy pages
- Internal Free, Pro, and Business plans with admin-configurable limits and overrides
- No self-service checkout flow: operators create users and assign access manually
- First-user setup: no default admin account is shipped
- HTTP-only admin cookie sessions; admin JWTs are not stored in browser storage
- Security Center with production checks, 2FA status, PII Vault, and recent audit events
- TOTP-based two-factor authentication for admin accounts with recovery codes
- Dynamic organization QR code: `https://qrat.ing/f/{organizationSlug}`
- Event-specific QR code: `https://qrat.ing/e/{event_feedback_token}`
- Mobile-first guest feedback page with event image, large touch targets, and sticky submit
- Rating, quick tags, free-text answers, newsletter opt-in, and friendly low-rating callback request
- Pretix event sync with settings sync and robust event image detection
- Friendly form builder with built-in question profiles, saved custom profiles, reusable questions, and visitor preview
- Dashboard, CSV/XLSX exports, newsletter export, and multi-page PDF reports
- Configurable SMTP for password resets, invitations, low-rating alerts, and report delivery
- Per-user notification channels scoped to assigned events
- Supported alert channels: email, Discord, Slack, Mattermost, Microsoft Teams, Telegram, Pushover, ntfy, Gotify, and generic webhooks
- Background worker for Pretix sync, report email jobs, and low-rating notifications
- Roles: Owner, Admin, Event Manager, Analyst, and Support
- Data retention tools with anonymization of low-rating contact data
- Webhooks for new feedback, low ratings, and newsletter opt-ins
- Privacy-hardened outbound payloads: raw email addresses, callback phone numbers, and contact notes are not sent to generic webhooks or chat/push channels
- Explicit PII reveal flow for low-rating contacts and newsletter emails with audit logging
- Local Pretix image cache with metadata and prepared variants
- QR source analytics with scan and feedback metrics
- Monitoring page for jobs, Pretix, SMTP, and webhook status
- Branding settings, anti-spam settings, and German/English public text support
- Code splitting: public visitor UI is loaded separately from the admin bundle
- Same-origin production API through `/api`

## Quick Start

### Server install into `/opt`

For a fresh Linux server with Docker and Git:

```bash
curl -fsSL https://raw.githubusercontent.com/brightcolor/qrating/main/scripts/quickstart.sh | sudo env QRATING_ADMIN_APP_URL="https://app.example.com" QRATING_FEEDBACK_APP_URL="https://feedback.example.com" bash
```

The script:

- clones or updates the repository in `/opt/qrating`
- creates `.env` if it does not exist
- generates secure values for `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `PRETIX_TOKEN_SECRET`
- writes installation details to `/opt/qrating/.qrating-quickstart-info`
- starts the stack with `docker compose up -d --build`
- opens the first-admin setup flow on `/admin` when no user exists yet

Optional parameters:

```bash
QRATING_DIR=/opt/qrating
QRATING_REPO=brightcolor/qrating
QRATING_ADMIN_APP_URL=https://app.qrating.de
QRATING_FEEDBACK_APP_URL=https://qrat.ing
QRATING_ORGANIZATION_NAME="Demo Events"
QRATING_ORGANIZATION_SLUG=demo-events
```

`QRATING_PUBLIC_URL` is still accepted as a legacy fallback and sets both domains to the same value.

### Local development

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
cp .env.example .env
docker compose up -d postgres
npm run dev
```

Development URLs:

- Frontend: `http://localhost:8080`
- Admin: `http://localhost:8080/admin`
- Backend health: `http://localhost:4000/health`

In production, the frontend proxies `/api/*` to the backend. Browsers should not call port `4000` directly.

## First Admin

qrating does not create a default admin account. The first visit to `/admin` shows a setup form while the `users` table is empty. The first account becomes `owner`.

After setup:

- login with the email and password created in the setup form
- create further users from the admin user management area
- assign roles and event access per user
- configure SMTP before using email invitations or password reset links

## Domains

qrating separates admin links from visitor feedback links:

- `ADMIN_APP_URL`: admin UI, invitations, and password reset links, default `https://app.qrating.de`
- `FEEDBACK_APP_URL`: public QR and feedback URLs, default `https://qrat.ing`

Self-hosted installations set both to their own domains. Both hostnames can point to the same server. The reverse proxy must route both to the frontend container and keep the `/api/*` proxy available.

Behind a reverse proxy or tunnel, set `TRUST_PROXY=2` (the frontend nginx is the first hop, the proxy the second). Rate limits and stored address hashes then use the real guest address. Keep `TRUST_PROXY=1` when browsers reach the frontend container directly; a higher value would let clients choose their own address.

## Configuration

Start with `.env.example`:

```env
NODE_ENV=production
PORT=4000
ADMIN_APP_URL=https://app.qrating.de
FEEDBACK_APP_URL=https://qrat.ing
CORS_ALLOWED_ORIGINS=https://app.qrating.de,https://qrat.ing

POSTGRES_DB=qrating
POSTGRES_USER=qrating
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgres://qrating:change-me@postgres:5432/qrating
POSTGRES_DATA=./data/postgres

SESSION_SECRET=change-me-at-least-32-chars
PRETIX_TOKEN_SECRET=change-me-32-byte-secret-value!!

ORGANIZATION_NAME=Demo Events
ORGANIZATION_SLUG=demo-events

FRONTEND_PORT=8080
BACKEND_PORT=127.0.0.1:4000
TRUST_PROXY=1

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
IMAGE_CACHE_MAX_BYTES=5242880
WORKER_INTERVAL_MS=5000
PRETIX_SCHEDULER_INTERVAL_MS=60000

BILLING_ADMIN_EMAILS=
```

- `POSTGRES_DATA`: a path gives a bind mount for the database files. Installations that started with the named volume keep working with an empty value.
- `FRONTEND_PORT` and `BACKEND_PORT`: host bindings, for example `127.0.0.1:8140` when a tunnel or local reverse proxy is the only entry.
- All values above reach the backend container through `docker-compose.yml`.

`BILLING_ADMIN_EMAILS` is only used for internal platform administration of plans and overrides. It does not enable external provider flows.

## Docker

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose ps
```

The stack contains:

- `postgres`: PostgreSQL database
- `backend`: Express API and background worker
- `frontend`: Vite build served through nginx with `/api` proxy

All three services restart automatically (`restart: unless-stopped`). The backend runs migrations on startup.

## Plans And Access

The app keeps the existing Free, Pro, and Business model, but access is controlled internally:

- platform admins can edit plan names, public labels, feature text, visibility, and limits
- organization access can be overridden manually to Pro or Business
- the public website reads the same plan matrix as the backend
- contact CTAs are shown instead of an automated subscription flow

This keeps the product matrix visible without letting visitors self-upgrade.

## Public Website

The product website (`/`, `/faq`, `/impressum`, `/datenschutz`) is a separate bundle with its own design:

- texts, section headings, button labels, and an optional event photo come from the Website admin area; an empty heading shows the default text
- plan cards read the plan matrix; request buttons open an email to the contact address
- the QR code in the header area encodes the link of the second button on the feedback domain, so visitors can scan it and try the guest page
- fonts are bundled with Fontsource and load from the own domain
- pages switch in place, animations follow `prefers-reduced-motion`
- migration `012` switches website texts and plan descriptions that were never saved in the admin area to the current defaults

## Error Messages

Every error tells people what happened and what to do next:

- API errors answer with `{ "error": "…" }` in German. Unexpected server failures add a reference (`Fehlerkennung`) that also appears in the backend log: `docker compose logs backend | grep <Kennung>`.
- Links opened directly in the browser (exports, QR codes, reports) show an error page.
- Failures of Pretix, webhooks, chat channels, and mail servers are stored as readable text in the "last error" fields of the admin area.
- The guest page separates unknown QR codes, feedback rounds that start later, and finished rounds.
- While the backend is unavailable, nginx answers `/api/*` with HTTP 503 and a JSON message.

## Guest Experience

The public feedback UI is designed for phones:

- event image as a compact header
- event name, date, and location
- large 1-5 rating buttons
- quick positive and improvement tags
- optional positive comment and improvement comment
- newsletter opt-in with consent text
- low-rating callback field with empathetic copy and phone number validation
- short thank-you screen after submission

Guests never see Pretix details, admin logic, or event lists unless that is explicitly enabled later.

## Dynamic QR Code

The dynamic QR endpoint is:

```text
/f/{organizationSlug}
/f/{organizationSlug}/{sourceSlug}
```

The resolver chooses the currently feedback-enabled event for the organization. It uses the event timezone, start mode, feedback window, status, source availability, and resolver priority.

Event-specific URLs use:

```text
/e/{event_feedback_token}
```

Closed or not-yet-open events show a friendly public status page instead of a technical error.

## Pretix Integration

Pretix API tokens stay server-side. The public guest page only uses locally synced event data.

The sync imports:

- event name, date, timezone, location, public URL, live/test/public state
- event series and sub-events
- raw event payload for debugging
- event settings payload when image import is enabled
- detected image key, original image URL, cached image URL, source, and sync error

For event images, qrating first requests:

```text
GET /api/v1/organizers/{organizer}/events/{event}/settings/?explain=true
```

If that fails, it falls back to the settings endpoint without `explain=true`. Settings values are normalized before known and configured image keys are inspected. Relative media paths are resolved against the Pretix base URL.

## Notifications

Low ratings can create a workflow case and notify only users who are allowed to access the affected event.

Notification channels are configured per user:

- email through the organization SMTP settings
- Discord-compatible webhook
- Slack-compatible webhook
- Mattermost-compatible webhook
- Microsoft Teams-compatible webhook
- Telegram bot token and chat ID
- Pushover user and app token
- ntfy topic URL
- Gotify application token
- generic webhook

Report delivery uses the background worker and SMTP settings.

## Privacy And PII Handling

> **Production warning for upgrades from versions before `0.13.0`: legacy databases may still contain plaintext personal data.**
>
> New newsletter opt-ins, low-rating contact notes, and webhook secrets are written to encrypted columns. Existing rows from older installations are not magically re-encrypted during the migration. Before going live with sensitive real user data, check old `newsletter_optins.email` values and legacy `webhook_endpoints.secret` values, rotate webhook secrets in the admin UI, and clean or re-import legacy newsletter rows during a controlled maintenance window. The `0.13.0` migration clears legacy plaintext low-rating contact notes because those notes may contain personal data.

Feedback can be anonymous. Newsletter opt-ins are stored separately with consent text and timestamp. New newsletter emails are encrypted at rest and additionally stored as a normalized keyed hash/domain pair for deduplication and reporting without exposing the raw address. Low-rating callback phone numbers and contact notes are encrypted at rest and can be anonymized through retention jobs.

The public API returns only visitor-safe event and organization fields. Public status endpoints do not expose internal IDs, Pretix payloads, settings payloads, event tokens, synchronization metadata, or admin-only fields.

Outbound notifications are intentionally redacted:

- low-rating email, Discord, Slack, Teams, Telegram, Pushover, ntfy, Gotify, and generic webhook messages do not include raw callback phone numbers or contact notes
- low-rating messages only say that contact data is available in the protected Low-Rating dashboard
- newsletter opt-in webhooks do not include raw email addresses; they include `emailProvided`, `emailHash`, and `emailDomain`
- newsletter CSV export requires Event Manager permissions or higher and decrypts encrypted emails only for that export response

The Security Center contains the PII Vault. Sensitive values are not shown in normal workflow lists. Authorized users must explicitly reveal callback phone numbers, contact notes, or newsletter email addresses; each reveal is written to `audit_log`. The PII Vault also supports deletion of individual newsletter opt-ins and low-rating contact data.

Before production use, configure:

- privacy and imprint content in the Website admin area
- newsletter consent text
- retention periods
- SMTP sender details
- webhook destinations
- role and event assignment rules
- reverse proxy TLS, `ADMIN_APP_URL`, `FEEDBACK_APP_URL`, and `CORS_ALLOWED_ORIGINS`

## API Overview

Public endpoints:

- `GET /public/site`
- `GET /public/f/:organizationSlug`
- `GET /public/f/:organizationSlug/:sourceSlug`
- `GET /public/e/:eventToken`
- `GET /public/events/:eventToken/status`
- `POST /public/events/:eventToken/feedback`

Admin authentication:

- `GET /admin/setup/status`
- `POST /admin/setup/first-admin`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /admin/me`
- `POST /admin/password-reset/request`
- `POST /admin/password-reset/confirm`

Admin areas include events, analytics, exports, forms, texts, QR sources, Pretix connections, SMTP, notifications, webhooks, users, retention, branding, website content, and internal plan administration.

Admin authentication uses the `qrating_admin` HTTP-only cookie. The frontend does not store session tokens in `localStorage` or expose them to JavaScript.

Two-factor authentication can be enabled in the Security Center. It uses standard TOTP apps and provides one-time recovery codes during setup.

## Tests And CI

Local checks:

```bash
npm test
npm run build
npm run lint
bash -n scripts/quickstart.sh
```

`npm test` includes database tests that run the migrations, the demo seed, and the main admin and guest flows in an in-process PostgreSQL (PGlite) inside the test run.

`scripts/smoke-test.sh` checks a freshly started Compose stack end to end: guest page, first-admin setup, event creation, and a backend restart.

GitHub Actions runs Docker CI on `main`:

- backend syntax check, unit tests, and database tests
- frontend production build
- production dependency audit as a separate job, so test and smoke test results stay visible when new advisories appear
- Docker Compose validation
- backend and frontend image builds
- Compose smoke test with health checks, frontend API proxy check, and `scripts/smoke-test.sh` against PostgreSQL 16

## Backup And Restore

Backup:

```bash
docker compose exec postgres pg_dump -U qrating qrating > qrating-backup.sql
tar -czf qrating-storage.tar.gz storage
```

Restore:

```bash
docker compose exec -T postgres psql -U qrating qrating < qrating-backup.sql
tar -xzf qrating-storage.tar.gz
docker compose up -d --build
```

## Update

```bash
cd /opt/qrating
git pull
docker compose up -d --build
```

Review `.env.example` after every release for new configuration keys.

## SemVer

qrating follows [Semantic Versioning](https://semver.org/):

- `MAJOR`: incompatible deployment or data model changes
- `MINOR`: new backwards-compatible features
- `PATCH`: backwards-compatible fixes

Current version: `0.17.0`. See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Production Notes

- Put the app behind HTTPS.
- Keep `SESSION_SECRET` and `PRETIX_TOKEN_SECRET` unique per deployment.
- Use a real SMTP account before enabling invitations, password reset, alerts, or report delivery.
- Keep Pretix tokens limited to the required organizer scope.
- Restrict admin access with strong passwords and least-privilege roles.
- Verify legal content, retention periods, and newsletter consent wording with qualified counsel.
- Monitor job failures, webhook failures, image cache errors, and disk usage.
