# Changelog

All notable changes to qrating are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [0.19.0] - 2026-09-17

### Added

- Event pictures can be maintained after an event was created: `PATCH /admin/events/:id` now accepts `imageUrl` and `imageAlt`, and every event card in the admin area carries a form for the picture URL and its description. A picture set this way is stored with the source `manual`, so the next Pretix sync leaves it alone as long as the connection does not prefer Pretix pictures. An empty picture URL clears the picture, its description, and the source again, which lets Pretix fill the picture in on the following sync.

### Changed

- Version bumped to `0.19.0`.

## [0.18.5] - 2026-09-17

### Changed

- Every event list in the admin area shows the event date next to the name, so events of a series stay apart: analytics, report by email, QR analytics, print templates, event assignments, form templates, and the lists in the Security Center.
- Version bumped to `0.18.5`.

## [0.18.4] - 2026-09-17

### Added

- The admin area names its tenant: the sidebar shows the organization with its slug, and Branding opens with name, slug, and the guest link of that tenant.

### Changed

- Version bumped to `0.18.4`.

## [0.18.3] - 2026-09-17

### Changed

- The event picture on the guest page shows in full; date and location moved below it.
- Version bumped to `0.18.3`.

## [0.18.2] - 2026-09-17

### Fixed

- Pictures of Pretix events are found again: the sync reads the shop header (`logo_image`) and the social preview (`og_image`) from the event settings and prefers the shop header.

### Changed

- Version bumped to `0.18.2`.

## [0.18.1] - 2026-09-17

### Fixed

- A Pretix sync that met an event without a picture stopped with "Cannot read properties of null". Events without a picture are imported now, and the sync continues with the following events.
- An event whose picture could not be read keeps the reason in its "image error" field, and a later successful lookup clears it.

### Changed

- Version bumped to `0.18.1`.

## [0.18.0] - 2026-09-17

### Added

- The guest page asks one question per step. Stars, single choice, yes/no, and the recommendation score move on by themselves; tags and free text have a "Weiter" button, optional questions a "Überspringen" button.
- A summary in the shape of a ticket ends the flow: every answer is listed, one tap opens it again, and sending stamps the ticket.
- New design for guests: the event picture as a backdrop, the organizer color for stars, buttons, and tags, and colors that stay readable on the dark stage.
- Stars for rating questions, a 0 to 10 scale for recommendation questions, and large buttons for yes/no and single choice. The first recommendation answer also fills the NPS value of the response.
- Tag questions offer one extra sentence, which is stored as the positive or improvement comment.
- Answers survive a reload in the same tab. Phone numbers and email addresses stay out of that storage, and the back gesture of the phone leads to the previous question.
- 13 German form templates: Schnellfeedback, Party & Club, Festival, Konzert, Geburtstagsfeier, Hochzeit, Firmen- & Weihnachtsfeier, Stadt- & Vereinsfest, Konferenz & Messe, Workshop & Seminar, Theater, Lesung & Comedy, Emotionaler Rückblick, and Nachfassen bei Kritik.
- 35 new texts for the guest flow, editable under Texts in German and English.

### Changed

- The form builder speaks German, shows an icon and the first questions per template, and previews the guest flow that results from the questions.
- Texts in the admin area are grouped with readable labels, and each text names its placeholders.
- Tag questions of the form now provide the options of the guest page; the built-in list is gone.
- The demo form starts with the two tag questions, so the first answers are taps.
- Version bumped to `0.18.0`.

## [0.17.1] - 2026-09-17

### Fixed

- German texts use proper umlauts and ß throughout: admin area, guest page, emails, notifications, and the imprint and privacy placeholders.
- PDF reports print umlauts, ß, the euro sign, and typographic quotes. Characters outside the PDF font fall back to their base letter.
- ntfy notifications with umlauts or emoji in the title arrive intact; the title header is sent as RFC 2047 encoded words.

### Changed

- Migration `013` replaces the imprint and privacy placeholders of earlier releases with the current wording, as long as nobody edited them. Edited legal texts stay unchanged.
- Version bumped to `0.17.1`.

## [0.17.0] - 2026-09-17

### Added

- Readable error messages throughout: every error says what happened and what to do next. Unexpected server failures show a reference that also appears in the backend log.
- Links opened directly in the browser (exports, QR codes, reports) show an error page.
- The guest page tells unknown QR codes, feedback rounds that start later (with their start date) and finished rounds apart, and offers a reload button when it cannot load. The new texts `not_found_*` and `not_started_*` are editable under Texts.
- Frontend tests for the API client; CI runs them before the build.

### Changed

- Admin area: every save action reports failures in a red notice and success in a blue one. Login, invitation, and password reset check empty fields before sending.
- Pretix, webhooks, chat channels, and mail servers report failures in German with the cause and a hint, also in the stored "last error" fields.
- An email notification channel reports an error while SMTP is switched off. A report by email is refused right away in that case, and a queued report fails visibly.
- Invitations say whether the email went out and show the link to share otherwise.
- Validation errors on the guest page name the affected field, rate limit messages name the waiting time.
- nginx answers `/api/*` with HTTP 503 and a JSON message while the backend is unavailable.
- The admin bundle no longer carries an unused copy of the guest page; broken special characters in the admin area are fixed.
- Version bumped to `0.17.0`.

## [0.16.0] - 2026-09-17

### Added

- New design for the public website, built around woven festival wristbands: a scannable QR code in the header area that opens the guest page, a sticky navigation that marks the current section, a mobile menu, scroll-in effects, and a copy button for the contact address. Devices that ask for reduced motion get a still page.
- The website pages switch in place without reloading. The FAQ page opens one answer at a time.
- Website admin area: headings for every section, a note next to the prices, and a closing text. An empty heading shows the default text.
- Favicon, page description, and link preview texts.

### Changed

- New default texts for the website and the plans. Migration `012` applies them where nobody saved the website or the plans in the admin area; imprint, privacy text, and contact address keep their stored values.
- Plan prices read "29 € / Monat" and each plan has its own request button text.
- The website bundles its fonts (Paytone One, Hanken Grotesk) and requests its texts while the scripts load.
- nginx compresses text responses and caches the hashed build files for a year.
- The website shows an event photo in the header area only when one is set; the placeholder image of earlier releases was removed, together with the share button on the plan cards.
- Version bumped to `0.16.0`.

## [0.15.0] - 2026-09-17

### Added

- `TRUST_PROXY` sets the number of proxy hops in front of the API. Behind a reverse proxy or tunnel, `2` keeps guests apart in rate limits and address hashes.
- `FRONTEND_PORT` and `BACKEND_PORT` set the host bindings, `POSTGRES_DATA` a bind mount for the database files.

### Changed

- Default domains: admin, invitation, and password reset links use `https://app.qrating.de`, the product website is `https://qrating.de`, QR codes stay on `https://qrat.ing`.
- The seeded contact address on the public website is `kontakt@qrating.de`. Migration `011` updates it where the old seed value is still present.
- `docker-compose.yml` passes rate limit, worker, image cache, and proxy settings from `.env` to the backend, and all services restart automatically.
- `.env.example` starts with `NODE_ENV=production` and a bind mount for the database files.
- Version bumped to `0.15.0`.

## [0.14.1] - 2026-09-17

### Fixed

- The guest feedback page loads again with PostgreSQL; every request returned HTTP 500.
- Manual events can be created again, including several events with the same name.
- The backend starts again after the first-admin setup renamed the organization. Demo data is seeded only into an empty database.
- Backend restarts keep a single demo form.
- The admin form shows errors during event creation.

### Changed

- Migration `010` replaces the Pretix identity rule on `events` with a partial unique index and removes demo forms that earlier releases duplicated. The first copy and every copy with answers stay.
- Database tests run the migrations and the main admin and guest flows in an in-process PostgreSQL (PGlite).
- CI runs the dependency audit as a separate job and an end-to-end smoke test against PostgreSQL 16.
- Version bumped to `0.14.1`.

## [0.14.0] - 2026-05-18

### Added

- Security Center with production checks for secrets, HTTPS URLs, CORS configuration, failed jobs, SMTP, legacy plaintext rows, and owner/admin 2FA coverage.
- TOTP-based two-factor authentication for admin accounts with QR setup, recovery codes, 2FA login challenge, and disable flow.
- PII Vault for explicit, audited access to low-rating callback data and newsletter emails.
- Audit log entries for first admin setup, 2FA changes, PII reveals, newsletter exports, PII deletion, and legacy plaintext cleanup.
- DSGVO-oriented deletion actions for newsletter opt-ins and low-rating contact data.
- Unit tests for the TOTP/base32 implementation.

### Changed

- Low-rating workflow no longer shows callback phone numbers or contact notes by default; authorized users must explicitly reveal them from the PII Vault.
- Admin navigation now includes a dedicated Security Center page.
- Version bumped to `0.14.0`.

## [0.13.0] - 2026-05-13

### Added

- Privacy hardening migration for encrypted newsletter email storage, encrypted low-rating contact notes, and encrypted webhook secrets for newly written data.
- Security helper tests for public payload sanitization, normalized email hashes, and encrypted webhook signatures.
- Configurable `CORS_ALLOWED_ORIGINS` for deployments with separated admin, feedback, and API domains.

### Changed

- README now highlights the legacy plaintext-data risk for upgrades from versions before `0.13.0`.
- Admin authentication now uses an HTTP-only cookie session only; JWTs are no longer returned to or stored by the frontend.
- Admin auth, invite acceptance, and password reset endpoints now have focused rate limits.
- Public event status and no-event responses now return only visitor-safe event and organization fields.
- Newsletter opt-in webhooks no longer include raw email addresses; they include only `emailProvided`, normalized email hash, and domain.
- Low-rating notifications and generic notification webhooks no longer include raw callback phone numbers or contact notes. They now point authorized users to the protected Low-Rating dashboard.
- Newsletter CSV export is restricted to Event Manager level and above, and decrypts current encrypted opt-ins only at export time.
- Webhook administration is restricted to Admin level and above, and new webhook secrets are stored encrypted.
- Admin API responses are marked `no-store`, production cookies are `Secure`, and CORS no longer reflects arbitrary origins.

### Security

- Existing plaintext newsletter emails and legacy plaintext webhook secrets may still exist in old databases. New writes use encrypted columns; rotate webhook secrets and export/reimport or clean old newsletter rows during a controlled maintenance window if the old data must be removed completely. Legacy plaintext low-rating contact notes are cleared by the migration because they may contain personal data.

## [0.12.0] - 2026-05-13

### Added

- Built-in question profiles for quick feedback, emotional event recaps, club/party events, concerts/festivals, conferences, and low-rating recovery.
- Admin API for listing question profiles, creating a form from a built-in or saved profile, and saving an existing form as a new reusable profile.
- Friendlier form builder UI with profile cards, prompt ideas, visual question type cards, guest preview, question duplication, and one-option-per-line editing.
- Unit tests for question profile normalization.

### Changed

- New blank forms without an assigned event are now saved as reusable profiles by default.
- Form creation and question mutation now verify organization/event access more consistently.

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
