CREATE TABLE IF NOT EXISTS site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  language TEXT NOT NULL DEFAULT 'de',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, language)
);

INSERT INTO site_content (scope, language, content)
VALUES (
  'default',
  'de',
  '{
    "brand": "qrating",
    "eyebrow": "QR-Feedback als SaaS",
    "headline": "Ein QR-Code. Echtes Feedback nach jedem Event.",
    "subheadline": "qrating sammelt Besucherfeedback mobil, schnell und ohne App. Veranstalter sehen Bewertungen, Kommentare, Opt-ins und Low-Rating-Faelle direkt im Adminbereich.",
    "heroImageUrl": "/marketing-hero.png",
    "primaryCtaLabel": "Admin oeffnen",
    "primaryCtaUrl": "/admin",
    "secondaryCtaLabel": "Feedback-Beispiel",
    "secondaryCtaUrl": "/f/demo-events",
    "trustText": "Self-hosting geeignet, SaaS-ready und ohne Pretix-Abhaengigkeit in der Besucheransicht.",
    "contactEmail": "kontakt@qrating.app",
    "footerText": "qrating hilft Veranstaltern, aus jedem Event konkrete Erkenntnisse zu gewinnen.",
    "features": [
      {"title": "Dynamische QR-Codes", "text": "Ein wiederverwendbarer Organisations-QR-Code zeigt automatisch auf das aktuell bewertbare Event."},
      {"title": "Mobile Feedbackseite", "text": "Gaeste bewerten mit grossen Buttons, Eventbild, Freitext und optionalem Newsletter-Opt-in in wenigen Sekunden."},
      {"title": "Low-Rating-Workflow", "text": "Kritische Bewertungen koennen sofort per E-Mail, Discord, ntfy, Gotify, Pushover und weiteren Kanaelen gemeldet werden."},
      {"title": "Pretix-Sync", "text": "Events und Eventbilder werden serverseitig aus Pretix synchronisiert, ohne dass Besucher Pretix direkt laden."}
    ],
    "steps": [
      {"title": "QR-Code platzieren", "text": "Druckvorlage oder dynamischen QR-Code fuer Ausgang, Bar, Newsletter oder Social Media nutzen."},
      {"title": "Feedback sammeln", "text": "Besucher landen direkt beim richtigen Event und geben anonym oder mit Opt-in Rueckmeldung."},
      {"title": "Auswerten und handeln", "text": "Dashboard, Exporte, PDF-Reports und Benachrichtigungen machen aus Feedback konkrete Aufgaben."}
    ],
    "pricing": [
      {"name": "Starter", "price": "Self-hosted", "text": "Ideal fuer kleine Veranstalter mit eigener Infrastruktur."},
      {"name": "Team", "price": "SaaS-ready", "text": "Mehrere Benutzer, Rollen, Event-Zuweisungen und Benachrichtigungen."},
      {"name": "Pro", "price": "Individuell", "text": "Pretix-Sync, Reports, Webhooks, Branding und Betriebskonzepte."}
    ],
    "faq": [
      {"question": "Brauchen Besucher einen Account?", "answer": "Nein. Besucher oeffnen den QR-Code und koennen direkt Feedback geben."},
      {"question": "Kann qrating mit Pretix arbeiten?", "answer": "Ja. Pretix-Events und Eventbilder werden serverseitig synchronisiert und lokal fuer die Besucheransicht genutzt."},
      {"question": "Ist anonymes Feedback moeglich?", "answer": "Ja. Newsletter-Opt-ins und Rueckrufnummern sind freiwillig und werden getrennt behandelt."},
      {"question": "Kann die Website angepasst werden?", "answer": "Ja. Landingpage, FAQ, Impressum und Datenschutz koennen im Adminbereich bearbeitet werden."}
    ],
    "imprint": "Angaben gemaess Impressumspflicht\n\nqrating Betreiber\nMusterstrasse 1\n12345 Musterstadt\n\nE-Mail: kontakt@qrating.app\n\nBitte passe dieses Impressum vor dem produktiven Betrieb im Adminbereich an.",
    "privacy": "Datenschutzerklaerung\n\nqrating kann anonymes Veranstaltungsfeedback erfassen. Personenbezogene Daten wie E-Mail-Adressen fuer Newsletter oder freiwillige Rueckrufnummern werden nur fuer den jeweils gewaehlten Zweck verarbeitet.\n\nBitte passe diese Datenschutzerklaerung vor dem produktiven Betrieb im Adminbereich an."
  }'::jsonb
)
ON CONFLICT (scope, language) DO NOTHING;
