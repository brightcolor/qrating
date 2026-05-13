# qrating

**Version:** 0.12.0
**Status:** self-hosting MVP with SaaS-ready administration
**Stack:** Node.js, Express, React, Vite, TailwindCSS, PostgreSQL, Docker Compose

qrating is a self-hosted QR feedback application for events. Guests scan a QR code, land on the currently relevant event, and submit feedback in a few seconds. Operators manage events, Pretix sync, event images, forms, QR links, analytics, exports, reports, notifications, public website content, and internal plan access from the admin area.

This repository was built with AI-assisted, vibe-coded development. Treat it like a pragmatic product baseline: review configuration, security settings, legal text, and operational processes before using it in production.

## Highlights

- Admin/Web UI domain: `https://qrating.app`
- Feedback/QR domain: `https://qrat.ing`
- Public marketing website on `/` with editable FAQ, imprint, and privacy pages
- Internal Free, Pro, and Business plans with admin-configurable limits and overrides
- No self-service checkout flow: operators create users and assign access manually
- First-user setup: no default admin account is shipped
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
curl -fsSL https://raw.githubusercontent.com/brightcolor/qrating/main/scripts/quickstart.sh | sudo env QRATING_ADMIN_APP_URL="https://qrating.app" QRATING_FEEDBACK_APP_URL="https://qrat.ing" bash
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
QRATING_ADMIN_APP_URL=https://qrating.app
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

- `ADMIN_APP_URL`: admin UI, invitations, and password reset links, for example `https://qrating.app`
- `FEEDBACK_APP_URL`: public QR and feedback URLs, for example `https://qrat.ing`

Both hostnames can point to the same server. The reverse proxy must route both to the frontend container and keep the `/api/*` proxy available.

## Configuration

Start with `.env.example`:

```env
NODE_ENV=production
PORT=4000
ADMIN_APP_URL=https://qrating.app
FEEDBACK_APP_URL=https://qrat.ing

POSTGRES_DB=qrating
POSTGRES_USER=qrating
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgres://qrating:change-me@postgres:5432/qrating

SESSION_SECRET=change-me-at-least-32-chars
PRETIX_TOKEN_SECRET=change-me-32-byte-secret-value!!

ORGANIZATION_NAME=Demo Events
ORGANIZATION_SLUG=demo-events

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
IMAGE_CACHE_MAX_BYTES=5242880
WORKER_INTERVAL_MS=5000
PRETIX_SCHEDULER_INTERVAL_MS=60000

BILLING_ADMIN_EMAILS=
```

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

The backend runs migrations on startup.

## Plans And Access

The app keeps the existing Free, Pro, and Business model, but access is controlled internally:

- platform admins can edit plan names, public labels, feature text, visibility, and limits
- organization access can be overridden manually to Pro or Business
- the public website reads the same plan matrix as the backend
- contact CTAs are shown instead of an automated subscription flow

This keeps the product matrix visible without letting visitors self-upgrade.

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

## Privacy

Feedback can be anonymous. Newsletter opt-ins are stored separately with consent text and timestamp. Low-rating callback phone numbers are encrypted at rest and can be anonymized through retention jobs.

Before production use, configure:

- privacy and imprint content in the Website admin area
- newsletter consent text
- retention periods
- SMTP sender details
- webhook destinations
- role and event assignment rules

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

## Tests And CI

Local checks:

```bash
npm test
npm run build
npm run lint
bash -n scripts/quickstart.sh
```

GitHub Actions runs Docker CI on `main`:

- backend syntax and unit tests
- frontend production build
- production dependency audit
- Docker Compose validation
- backend and frontend image builds
- Compose smoke test with health checks and frontend API proxy check

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

Current version: `0.12.0`. See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Production Notes

- Put the app behind HTTPS.
- Keep `SESSION_SECRET` and `PRETIX_TOKEN_SECRET` unique per deployment.
- Use a real SMTP account before enabling invitations, password reset, alerts, or report delivery.
- Keep Pretix tokens limited to the required organizer scope.
- Restrict admin access with strong passwords and least-privilege roles.
- Verify legal content, retention periods, and newsletter consent wording with qualified counsel.
- Monitor job failures, webhook failures, image cache errors, and disk usage.
