-- The public website got a new design with new texts.
-- Website content that nobody saved in the admin area falls back to the texts shipped with the
-- backend. Legal texts and the contact address stay as they are.
UPDATE site_content
SET content = jsonb_strip_nulls(jsonb_build_object(
      'contactEmail', content->'contactEmail',
      'imprint', content->'imprint',
      'privacy', content->'privacy'
    )),
    updated_at = now()
WHERE updated_by IS NULL
  AND content->>'headline' = 'Ein QR-Code. Echtes Feedback nach jedem Event.';

-- Plan descriptions that were never saved in the admin area get the new wording.
-- Saving plans in the admin area moves updated_at; the untouched seed keeps updated_at = created_at,
-- so this update leaves updated_at alone.
UPDATE billing_plans
SET price_label = '0 € / Monat',
    summary = 'Für den Einstieg mit wenigen Events',
    cta_label = 'Free anfragen',
    features = '[
      "2 aktive Events, 1 Benutzer",
      "Veranstalter- und Event-QR-Codes",
      "Sterne, Stichworte, Kommentare",
      "Newsletter-Export, bis zu 5 Formulare"
    ]'::jsonb
WHERE plan_key = 'free'
  AND updated_at = created_at
  AND summary = 'Basics fuer den Einstieg.';

UPDATE billing_plans
SET price_label = '29 € / Monat',
    summary = 'Für regelmäßige Veranstaltungen',
    cta_label = 'Pro anfragen',
    features = '[
      "Beliebig viele Events und Formulare",
      "Pretix-Anbindung mit Eventbildern",
      "Excel-Export und PDF-Reports",
      "Alarm bei schlechter Bewertung",
      "Webhooks, Wallboard, QR-Quellen"
    ]'::jsonb
WHERE plan_key = 'pro'
  AND updated_at = created_at
  AND summary = 'Alles fuer regelmaessige Events, ohne eigene Domain und ohne Team-Management.';

UPDATE billing_plans
SET price_label = '79 € / Monat',
    summary = 'Für Teams mit mehreren Verantwortlichen',
    cta_label = 'Business anfragen',
    features = '[
      "Alles aus Pro",
      "Teams, Rollen und Event-Zuweisungen",
      "Beliebig viele Benutzer",
      "Eigene Domain (in Vorbereitung)",
      "Priorisierte Betriebs- und Integrationsoptionen"
    ]'::jsonb
WHERE plan_key = 'business'
  AND updated_at = created_at
  AND summary = 'Fuer eigene Domains, Teams und Management-Funktionen.';
