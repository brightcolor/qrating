ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_plan TEXT NOT NULL DEFAULT 'free' CHECK (billing_plan IN ('free','pro','business')),
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_pending_plan TEXT CHECK (billing_pending_plan IN ('pro','business')),
  ADD COLUMN IF NOT EXISTS billing_override_plan TEXT CHECK (billing_override_plan IN ('free','pro','business')),
  ADD COLUMN IF NOT EXISTS billing_override_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS billing_override_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE site_content
SET content = jsonb_set(
  content,
  '{pricing}',
  '[
    {
      "plan": "free",
      "name": "Free",
      "price": "0 EUR",
      "text": "Basics fuer den Start mit wenigen Events.",
      "ctaLabel": "Plan anfragen",
      "features": [
        "Dynamischer Organisations-QR-Code",
        "Event-spezifische QR-Codes",
        "Sternebewertung und Freitext",
        "Newsletter-Opt-in Export",
        "4 bis 5 einfache Formularvorlagen"
      ]
    },
    {
      "plan": "pro",
      "name": "Pro",
      "price": "29 EUR / Monat",
      "text": "Alles fuer regelmaessige Events, ohne eigene Domain und ohne Team-Management.",
      "highlight": true,
      "ctaLabel": "Pro anfragen",
      "features": [
        "Alle Formularvorlagen und eigene Fragen",
        "Pretix-Sync inklusive Eventbildern",
        "CSV/XLSX-Export und PDF-Reports",
        "Low-Rating-Benachrichtigungen",
        "Webhooks, Wallboard und QR-Quellen-Auswertung"
      ]
    },
    {
      "plan": "business",
      "name": "Business",
      "price": "79 EUR / Monat",
      "text": "Fuer Teams, Management und professionelle Mandanten-Setups.",
      "ctaLabel": "Business anfragen",
      "features": [
        "Alles aus Pro",
        "Eigene Domain vorbereitet",
        "Team- und Rollenmanagement",
        "Management-Ansichten und mehrere Verantwortliche",
        "Priorisierte Betriebs- und Integrationsoptionen"
      ]
    }
  ]'::jsonb,
  true
)
WHERE updated_by IS NULL OR content->'pricing' IS NULL;
