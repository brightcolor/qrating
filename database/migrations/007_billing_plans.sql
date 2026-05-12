CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key TEXT NOT NULL UNIQUE CHECK (plan_key IN ('free','pro','business')),
  name TEXT NOT NULL,
  price_label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  highlight BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  public_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO billing_plans (
  plan_key, name, price_label, summary, cta_label, features, limits, highlight, sort_order
)
VALUES
  (
    'free',
    'Free',
    '0 EUR',
    'Basics fuer den Einstieg.',
    'Plan anfragen',
    '[
      "1 Organisation",
      "2 aktive Events",
      "Dynamische und Event-QR-Codes",
      "Sternebewertung, Freitext, Newsletter-CSV",
      "4 bis 5 einfache Formularvorlagen"
    ]'::jsonb,
    '{
      "activeEvents": 2,
      "templates": 5,
      "users": 1,
      "customDomain": false,
      "teams": false,
      "pretix": false,
      "webhooks": false,
      "reports": false
    }'::jsonb,
    false,
    10
  ),
  (
    'pro',
    'Pro',
    '29 EUR / Monat',
    'Alles fuer regelmaessige Events, ohne eigene Domain und ohne Team-Management.',
    'Pro anfragen',
    '[
      "Unbegrenzte Formularvorlagen und eigene Fragen",
      "Pretix-Sync und Eventbild-Erkennung",
      "CSV/XLSX-Export und PDF-Reports",
      "Low-Rating-Benachrichtigungen",
      "Webhooks, Wallboard und QR-Quellen-Auswertung"
    ]'::jsonb,
    '{
      "activeEvents": null,
      "templates": null,
      "users": 1,
      "customDomain": false,
      "teams": false,
      "pretix": true,
      "webhooks": true,
      "reports": true
    }'::jsonb,
    true,
    20
  ),
  (
    'business',
    'Business',
    '79 EUR / Monat',
    'Fuer eigene Domains, Teams und Management-Funktionen.',
    'Business anfragen',
    '[
      "Alles aus Pro",
      "Eigene Domain vorbereitet",
      "Team- und Rollenmanagement",
      "Management-Ansichten fuer mehrere Verantwortliche",
      "Priorisierte Betriebs- und Integrationsoptionen"
    ]'::jsonb,
    '{
      "activeEvents": null,
      "templates": null,
      "users": null,
      "customDomain": true,
      "teams": true,
      "pretix": true,
      "webhooks": true,
      "reports": true
    }'::jsonb,
    false,
    30
  )
ON CONFLICT (plan_key) DO NOTHING;
