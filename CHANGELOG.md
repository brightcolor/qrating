# Changelog

All notable changes to qrating are documented here.

The project follows [Semantic Versioning](https://semver.org/).

## [0.40.0] - 2026-09-18

### Added

- The newsletter step asks a second question: whether a guest also wants presale starts, prize draws and evenings outside the open programme. The box starts empty, and the answer travels to the newsletter system in a field of its own, so a campaign can address exactly that audience.
- Public pages carry a privacy page under `/datenschutz/<slug>`. It is written from the settings of the organization: deletion periods, the connected newsletter system and the responsible party. While the responsible party is missing, the page says at the top that it is incomplete.
- Branding gained the three fields the privacy page names: responsible party, address and an email address for privacy requests.
- Version bumped to `0.40.0`.

## [0.39.1] - 2026-09-18

### Fixed

- The note about the makers now also appears on the page of an organization that waits for its next event. It used to travel with the event alone, so exactly that page stayed without it.
- The countdown says "1 Tag" on the last day.
- Version bumped to `0.39.1`.

## [0.39.0] - 2026-09-18

### Added

- The page before a round shows a countdown in days, hours, minutes and seconds. Once the last day is over the day segment drops out, and when the countdown reaches zero the page loads the rating by itself.
- Guest pages come in light and dark. They follow the system setting of the device, and a button walks through automatic, light and dark; the choice stays on that device.
- The note under a public page names both makers with their sign and links them.
- Version bumped to `0.39.0`.

## [0.38.0] - 2026-09-18

### Added

- A coming event carries a link to the ticket shop, and only while tickets can be bought: the sale has started, has not ended, and the shop is public. An event outside that window shows its date without a link.
- Every event can switch that link off, next to the settings for the pointer itself.
- Version bumped to `0.38.0`.

## [0.37.0] - 2026-09-18

### Added

- A print sheet for the organizer: it carries the dynamic code, leads to whatever event runs and names no single evening. An own headline fits on it.
- Four designs for the sheets: the classic one, a pure one with only the question and a large code, a poster with a coloured band, and a small card to cut out.
- The admin area picks the design under QR & Wallboard, and the print button of an event follows that choice.
- Version bumped to `0.37.0`.

## [0.36.0] - 2026-09-18

### Added

- A guest page that is scanned before its round shows what it will ask about: the event, its date and five quiet stars, plus the moment the rating opens.
- The page of an organization without an open round names the event that comes next and lists the ones after it, each with a link to the ticket shop.
- While a round runs the guest goes straight into the rating; the coming events appear after the feedback on the thank-you screen.
- Every event sets for itself whether that pointer appears and which events it names, with up to five chosen by hand.
- Version bumped to `0.36.0`.

## [0.35.0] - 2026-09-18

### Added

- Every QR code carries the qrating mark in its middle. The code is written with the highest error correction, so scanners read it as before; a test decodes a code with the mark to prove it.
- Public pages name where they come from: the guest page, the ticket stub and the print sheet carry a short note, and the website of the product says it in its footer.
- Both are switches under Branding, and the note of the website sits in the website content. An organization that wants neither switches them off.
- Version bumped to `0.35.0`.

## [0.34.1] - 2026-09-18

### Fixed

- The last line of the drop-off view said the name of the step the guest saw last instead of "Abgeschickt".
- Version bumped to `0.34.1`.

## [0.34.0] - 2026-09-18

### Added

- Every visit of a guest page is counted, and the flow reports the step it shows. The analytics of an event now answer two questions: how often did somebody open the page, and where did they stop.
- The admin area shows the visits, the submissions, the drop-outs, the completion rate and one line per step with how many got there and how many ended there.
- A visit keeps no personal data: address and browser are hashed, and the visits are deleted with the feedback of the organization.
- Version bumped to `0.34.0`.

## [0.33.1] - 2026-09-18

### Documentation

- The README describes a nightly backup that keeps fourteen days, reads the dump back before it counts as done, and leaves both files readable for root alone.
- Version bumped to `0.33.1`.

## [0.33.0] - 2026-09-18

### Changed

- People, roles and the responsibility for an event have their own area now: **Benutzer**. Until now they sat on the notifications page, where nobody looked for them.
- The notifications page keeps the personal channels and says where the people are.
- Version bumped to `0.33.0`.

## [0.32.0] - 2026-09-18

### Changed

- The status of an event decides again whether the guest page is open. A draft and a finished event collect no feedback any more, and the dynamic QR code skips them. Until now only an archived event was left out.
- The event card sets the status directly: draft, active, finished or archived. A status that does not exist is refused with a message that names the four.
- Version bumped to `0.32.0`.

## [0.31.0] - 2026-09-18

### Fixed

- The Pretix sync read only the first page of the event list, so an organizer with more events than fit on one page kept the rest out of qrating. The sync now follows every page, up to fifty, and ignores a next page that leaves the Pretix address.
- A newsletter opt-in stored the default consent sentence instead of the sentence the organization put on the guest page. The consent is stored the way the guest read it, in the language of the page, and the same goes for the contact text of a low rating and the thank-you.
- Version bumped to `0.31.0`.

## [0.30.1] - 2026-09-18

### Fixed

- Pretix answers with translated fields, and the place of an event arrived as JSON. Guest page, print sheet, report and notifications showed that JSON instead of the address. Every one of them reads the German text now, the sync stores it that way, and migration `018` cleans the places of events that were imported earlier.
- Version bumped to `0.30.1`.

## [0.30.0] - 2026-09-18

### Changed

- The event report as PDF has a layout now: a coloured header with event, date, place and organization, the key figures as cards, the ratings as a bar chart, the course of the evening, the own questions and the voices of the guests.
- The accent colour of the report comes from the organization settings, and every page carries a footer with the event, the moment of creation and the page number.
- Version bumped to `0.30.0`.

## [0.29.0] - 2026-09-18

### Security

- The libraries for sending mail, for validating input and for reading query strings are updated to versions without the known advisories. `npm audit --omit=dev` reports nothing for backend and frontend.
- Sending mail runs on the current major version of the mail library. A new test hands a mail with umlauts to a mail server of its own and reads back what arrived, so the library is checked instead of a mock.
- Version bumped to `0.29.0`.

## [0.28.0] - 2026-09-18

### Changed

- The way an entry came in names the QR source it was scanned from, for example `Bändchen` or `Bar`. Entries without a QR source keep the fallback value of the connection, by default `qrating`, and the connection can switch the QR source out of that field.
- Version bumped to `0.28.0`.

## [0.27.0] - 2026-09-18

### Added

- A second custom field goes to MailWizz with every entry: the way it came in, by default the tag `QUELLE` with the value `qrating`. Tag and value are part of the connection, and an empty value leaves the field out.
- Version bumped to `0.27.0`.

## [0.26.0] - 2026-09-18

### Added

- Newsletter connection to MailWizz per organization: API address, API key, list UID and the tag of the custom field that carries the event. The key is stored encrypted and never leaves the server again.
- Every newsletter opt-in goes to the list through the background worker. The subscriber carries the address and, in the configured custom field, the name of the event the entry came from, as Pretix wrote it. Events created by hand use their own name.
- A connection test asks MailWizz for the list, and open opt-ins from the time before the connection can be handed over afterwards. Failed handovers keep the reason of MailWizz at the entry.
- Version bumped to `0.26.0`.

## [0.25.0] - 2026-09-18

### Changed

- Downloads carry their event in the file name: event name, event date, what is inside and the moment of the download, for example `Hafenfest_2026-08-14_Feedback_geladen-2026-08-15-0930.csv`. Feedback export, table export, newsletter export and the report use the same pattern, and the report that arrives by e-mail is named the same way.
- Both dates follow the timezone of the event. Browsers that read RFC 5987 get the name with umlauts, all others a written-out variant without them.
- Version bumped to `0.25.0`.

## [0.24.0] - 2026-09-17

### Changed

- The print sheet of an event carries the event name and the date of the event, and it leaves the feedback address off the paper. Guests scan the code, so there is nothing left to type.
- The sheet fills one A4 page: rating stars and the question in the middle, the event below a rule, and the name of the organization at the top. The accent color comes from the organization settings.
- Version bumped to `0.24.0`.

## [0.23.0] - 2026-09-17

### Changed

- The start page of the short feedback domain leads to the product website. A link with parameters, for example campaign tracking, keeps its target, and QR code links stay untouched.
- Version bumped to `0.23.0`.

## [0.22.0] - 2026-09-17

### Changed

- The platform role unlocks plans and edits the plan matrix. `BILLING_ADMIN_EMAILS` keeps working as a fallback.
- Version bumped to `0.22.0`.

## [0.21.0] - 2026-09-17

### Added

- A preview link opens the guest page of an event at any time, also while no feedback round runs. The admin area hands it out per event; it carries a signature, lasts two hours, marks the page with a banner, stores nothing, and counts as no scan.
- Events can be archived and brought back from the admin area. An archived event falls out of the QR code and the guest page and keeps its data.
- Events can be deleted from the admin area. The confirmation names how many responses go with the event.

### Changed

- Version bumped to `0.21.0`.

## [0.20.0] - 2026-09-17

### Added

- An installation can carry several tenants. The account of the first setup runs the platform and finds them under Mandanten: every organization with plan, events, feedback count, users, and Pretix connections.
- New tenants are created there with a name and an optional slug; the slug goes into the QR code of that tenant.
- A platform admin enters a tenant and works inside it. A banner names the tenant and leads back, and both steps are written to the audit log of that tenant.
- Migration `014` gives the platform role to the account that set the installation up.

### Changed

- The sidebar marks a visited tenant, and the account endpoint reports the tenant of the session, the home organization, and the platform role.
- Version bumped to `0.20.0`.

## [0.19.2] - 2026-09-17

### Fixed

- The print page of an event QR code (`GET /admin/events/:id/qr-print`) puts the event name and the feedback address on the page as text. An event name that contains HTML, for example one imported from a ticket shop, is shown the way it was typed and stays out of the page structure.
- Printing works again. The page carries a visible button "Drucken" and receives its print script through a Content Security Policy that belongs to this single response, so the security headers of the whole API stay as strict as before.

### Changed

- The error pages and the print page share one escaping helper (`backend/src/utils/html.js`); the copy inside the error middleware is gone.
- Version bumped to `0.19.2`.

## [0.19.1] - 2026-09-17

### Fixed

- The API starts again. The shared HTML escaping helper `backend/src/utils/html.js`, which the admin routes import for the QR print sheet, was missing from the previous release, so the backend container stopped with `ERR_MODULE_NOT_FOUND`.

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
