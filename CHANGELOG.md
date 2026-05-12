# Changelog

All notable changes to qrating are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [0.11.0] - 2026-05-12

### Changed

- Kept the product name and all current spellings as `qrating`.
- Replaced project-specific demo names and slugs with neutral demo values.
- Switched plan activation to internal operator control only.
- Rewrote README and changelog in English and added a concise production-readiness note.

### Removed

- Removed external provider flows, self-service activation, and provider webhook routes.
- Removed old project-specific demo references from code, defaults, documentation, quickstart, and migrations.

## [0.10.0] - 2026-05-07

### Added

- Configurable `billing_plans` table for Free, Pro, and Business plans.
- Admin editor for plan names, price labels, CTAs, features, visibility, highlights, and sort order.
- Admin editor for technical limits, including active events, forms, templates, users, Pretix, reports, webhooks, teams, and custom domain.
- Admin API for platform-level plan editing.
- Unit tests for dynamic plan loading and public pricing output.

### Changed

- Backend plan gates now read limits from the database instead of hard-coded constants.
- Public pricing cards and admin plan cards use the same plan configuration.
- Website content points admins to the plan editor so there is one source of truth for the product matrix.

## [0.9.0] - 2026-05-04

### Added

- SaaS-ready plan foundation with Free, Pro, and Business tiers.
- Admin page for plan status and manual plan overrides.
- Free Pro/Business overrides for platform admins configured through `BILLING_ADMIN_EMAILS`.
- Plan gates for Free event limits, Free form/template limits, and Business team management.

### Changed

- Product matrix now separates Free, Pro, and Business more clearly.
- Free contains only basic features and a small set of form templates.
- Pro contains product features except custom domain and team management.
- Business contains custom domain, teams, and management features.

## [0.8.0] - 2026-05-04

### Added

- SaaS-ready marketing website on `/` with hero, features, workflow, offer cards, FAQ preview, and CTAs.
- Editable website content in the admin area.
- Public FAQ, imprint, and privacy pages.
- `site_content` table for landing page, FAQ, imprint, and privacy content.
- Public API for site content and admin API for editing site content.
- Local marketing hero image so the landing page works without external media services.
- Unit test for website content normalization.

## [0.7.0] - 2026-05-04

### Added

- Separate admin and feedback domains.
- `ADMIN_APP_URL` and `FEEDBACK_APP_URL` environment values.

### Changed

- QR codes, print templates, and event feedback links default to `https://qrat.ing`.
- Admin invitations and password reset links default to `https://qrating.app`.
- Docker Compose, quickstart, `.env.example`, and README were updated for split domains.

## [0.6.0] - 2026-05-04

### Changed

- Product naming moved fully to qrating.
- Package names, Docker tags, quickstart variables, default database name, cookie/storage keys, export filenames, mail text, webhook headers, and PDF report titles use qrating naming.
- Quickstart and documentation use `/opt/qrating`, `QRATING_*` variables, and `brightcolor/qrating`.
- Browser-facing API calls use same-origin `/api` URLs in production.

## [0.5.0] - 2026-05-03

### Added

- First-admin setup flow.
- Password reset request and confirmation endpoints.
- Frontend setup, forgotten-password, and reset-password screens.
- Documentation for reverse proxy and first-login behavior.

### Changed

- Removed the seeded default admin account.
- Login fields are no longer prefilled.

## [0.4.1] - 2026-05-03

### Added

- Public GitHub repository at `https://github.com/brightcolor/qrating`.
- Docker CI workflow.
- One-command installation into `/opt/qrating` with generated secrets, `.env` initialization, and `docker compose up -d --build`.
- Quickstart documentation for public and private repositories.

### Changed

- CI uses the current Node runtime and validates backend tests, frontend builds, and Docker smoke checks.

## [0.4.0] - 2026-05-03

### Added

- User management with roles, event assignments, invitations, password reset support, and user status.
- Data retention configuration and anonymization jobs.
- Newsletter opt-in webhook event.
- More production-oriented Pretix sync scheduling.
- Expanded image cache metadata.
- QR source analytics.
- Monitoring page for jobs, Pretix, SMTP, and webhooks.
- Improved wallboard and product UX polish.

## [0.3.0] - 2026-05-02

### Added

- Role and permission model for Owner, Admin, Event Manager, Analyst, and Support.
- Background job table and worker.
- Low-rating workflow with encrypted callback phone number, status, assigned user, and internal note.
- Report delivery by email through the background worker.
- Code splitting between admin and public bundles.
- German and English public text foundation.
- Public anti-spam settings.
- Branding settings.
- Production-oriented migration structure.

## [0.2.0] - 2026-05-01

### Added

- Expanded PDF event reporting.
- Configurable SMTP settings in the admin area.
- Low-rating notification channels and per-user channel selection.
- Friendly low-rating callback request in the guest form.
- README modernization and SemVer structure.

## [0.1.0] - 2026-04-30

### Added

- Initial self-hosting MVP.
- PostgreSQL data model and migrations.
- Admin login and event management.
- Manual events and Pretix event sync.
- Pretix settings sync with image detection.
- EventResolver and PretixImageResolver services with unit tests.
- Dynamic organization QR code and event-specific QR code.
- Public mobile feedback page with event image, rating, free text, newsletter opt-in, and thank-you page.
- Form builder foundation.
- Analytics dashboard, CSV export, XLSX export, and PDF report foundation.
- Docker Compose, `.env.example`, seed data, and installation documentation.
