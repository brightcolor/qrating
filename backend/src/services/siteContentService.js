import { getPublicPricingPlans } from './billingService.js';

export const defaultSiteContent = {
  brand: 'qrating',
  eyebrow: 'QR-Feedback als SaaS',
  headline: 'Ein QR-Code. Echtes Feedback nach jedem Event.',
  subheadline: 'qrating sammelt Besucherfeedback mobil, schnell und ohne App. Veranstalter sehen Bewertungen, Kommentare, Opt-ins und Low-Rating-Faelle direkt im Adminbereich.',
  heroImageUrl: '/marketing-hero.png',
  primaryCtaLabel: 'Admin oeffnen',
  primaryCtaUrl: '/admin',
  secondaryCtaLabel: 'Feedback-Beispiel',
  secondaryCtaUrl: '/f/demo-events',
  trustText: 'Self-hosting geeignet, SaaS-ready und ohne Pretix-Abhaengigkeit in der Besucheransicht.',
  contactEmail: 'kontakt@qrating.app',
  footerText: 'qrating hilft Veranstaltern, aus jedem Event konkrete Erkenntnisse zu gewinnen.',
  features: [
    {
      title: 'Dynamische QR-Codes',
      text: 'Ein wiederverwendbarer Organisations-QR-Code zeigt automatisch auf das aktuell bewertbare Event.'
    },
    {
      title: 'Mobile Feedbackseite',
      text: 'Gaeste bewerten mit grossen Buttons, Eventbild, Freitext und optionalem Newsletter-Opt-in in wenigen Sekunden.'
    },
    {
      title: 'Low-Rating-Workflow',
      text: 'Kritische Bewertungen koennen sofort per E-Mail, Discord, ntfy, Gotify, Pushover und weiteren Kanaelen gemeldet werden.'
    },
    {
      title: 'Pretix-Sync',
      text: 'Events und Eventbilder werden serverseitig aus Pretix synchronisiert, ohne dass Besucher Pretix direkt laden.'
    }
  ],
  steps: [
    { title: 'QR-Code platzieren', text: 'Druckvorlage oder dynamischen QR-Code fuer Ausgang, Bar, Newsletter oder Social Media nutzen.' },
    { title: 'Feedback sammeln', text: 'Besucher landen direkt beim richtigen Event und geben anonym oder mit Opt-in Rueckmeldung.' },
    { title: 'Auswerten und handeln', text: 'Dashboard, Exporte, PDF-Reports und Benachrichtigungen machen aus Feedback konkrete Aufgaben.' }
  ],
  pricing: [
    {
      plan: 'free',
      name: 'Free',
      price: '0 EUR',
      text: 'Basics fuer den Start mit wenigen Events.',
      ctaLabel: 'Plan anfragen',
      features: [
        'Dynamischer Organisations-QR-Code',
        'Event-spezifische QR-Codes',
        'Sternebewertung und Freitext',
        'Newsletter-Opt-in Export',
        '4 bis 5 einfache Formularvorlagen'
      ]
    },
    {
      plan: 'pro',
      name: 'Pro',
      price: '29 EUR / Monat',
      text: 'Alles fuer regelmaessige Events, ohne eigene Domain und ohne Team-Management.',
      highlight: true,
      ctaLabel: 'Pro anfragen',
      features: [
        'Alle Formularvorlagen und eigene Fragen',
        'Pretix-Sync inklusive Eventbildern',
        'CSV/XLSX-Export und PDF-Reports',
        'Low-Rating-Benachrichtigungen',
        'Webhooks, Wallboard und QR-Quellen-Auswertung'
      ]
    },
    {
      plan: 'business',
      name: 'Business',
      price: '79 EUR / Monat',
      text: 'Fuer Teams, Management und professionelle Mandanten-Setups.',
      ctaLabel: 'Business anfragen',
      features: [
        'Alles aus Pro',
        'Eigene Domain vorbereitet',
        'Team- und Rollenmanagement',
        'Management-Ansichten und mehrere Verantwortliche',
        'Priorisierte Betriebs- und Integrationsoptionen'
      ]
    }
  ],
  faq: [
    {
      question: 'Brauchen Besucher einen Account?',
      answer: 'Nein. Besucher oeffnen den QR-Code und koennen direkt Feedback geben.'
    },
    {
      question: 'Kann qrating mit Pretix arbeiten?',
      answer: 'Ja. Pretix-Events und Eventbilder werden serverseitig synchronisiert und lokal fuer die Besucheransicht genutzt.'
    },
    {
      question: 'Ist anonymes Feedback moeglich?',
      answer: 'Ja. Newsletter-Opt-ins und Rueckrufnummern sind freiwillig und werden getrennt behandelt.'
    },
    {
      question: 'Kann die Website angepasst werden?',
      answer: 'Ja. Landingpage, FAQ, Impressum und Datenschutz koennen im Adminbereich bearbeitet werden.'
    }
  ],
  imprint: 'Angaben gemaess Impressumspflicht\n\nqrating Betreiber\nMusterstrasse 1\n12345 Musterstadt\n\nE-Mail: kontakt@qrating.app\n\nBitte passe dieses Impressum vor dem produktiven Betrieb im Adminbereich an.',
  privacy: 'Datenschutzerklaerung\n\nqrating kann anonymes Veranstaltungsfeedback erfassen. Personenbezogene Daten wie E-Mail-Adressen fuer Newsletter oder freiwillige Rueckrufnummern werden nur fuer den jeweils gewaehlten Zweck verarbeitet.\n\nBitte passe diese Datenschutzerklaerung vor dem produktiven Betrieb im Adminbereich an.'
};

function normalizeList(value, fallback, shape) {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item) => Object.fromEntries(Object.keys(shape).map((key) => {
      if (key === 'features') {
        const raw = item?.[key] || shape[key] || [];
        return [key, Array.isArray(raw) ? raw.map(String).filter(Boolean) : String(raw).split('\n').map((line) => line.trim()).filter(Boolean)];
      }
      if (key === 'highlight') return [key, Boolean(item?.[key])];
      return [key, String(item?.[key] || shape[key])];
    })))
    .filter((item) => Object.values(item).some(Boolean));
}

export function normalizeSiteContent(content = {}) {
  const merged = { ...defaultSiteContent, ...(content || {}) };
  return {
    ...merged,
    brand: String(merged.brand || defaultSiteContent.brand),
    eyebrow: String(merged.eyebrow || ''),
    headline: String(merged.headline || defaultSiteContent.headline),
    subheadline: String(merged.subheadline || defaultSiteContent.subheadline),
    heroImageUrl: String(merged.heroImageUrl || defaultSiteContent.heroImageUrl),
    primaryCtaLabel: String(merged.primaryCtaLabel || defaultSiteContent.primaryCtaLabel),
    primaryCtaUrl: String(merged.primaryCtaUrl || defaultSiteContent.primaryCtaUrl),
    secondaryCtaLabel: String(merged.secondaryCtaLabel || defaultSiteContent.secondaryCtaLabel),
    secondaryCtaUrl: String(merged.secondaryCtaUrl || defaultSiteContent.secondaryCtaUrl),
    trustText: String(merged.trustText || ''),
    contactEmail: String(merged.contactEmail || ''),
    footerText: String(merged.footerText || ''),
    features: normalizeList(merged.features, defaultSiteContent.features, { title: '', text: '' }),
    steps: normalizeList(merged.steps, defaultSiteContent.steps, { title: '', text: '' }),
    pricing: normalizeList(merged.pricing, defaultSiteContent.pricing, { plan: '', name: '', price: '', text: '', ctaLabel: '', highlight: false, features: [] }),
    faq: normalizeList(merged.faq, defaultSiteContent.faq, { question: '', answer: '' }),
    imprint: String(merged.imprint || defaultSiteContent.imprint),
    privacy: String(merged.privacy || defaultSiteContent.privacy)
  };
}

export async function getSiteContent(db) {
  async function withPricing(row) {
    const content = normalizeSiteContent(row.content);
    const pricing = await getPublicPricingPlans(db);
    return { ...row, content: { ...content, pricing: pricing.length ? pricing : content.pricing } };
  }
  const result = await db.query(
    `SELECT * FROM site_content
     WHERE scope = 'default' AND language = 'de'
     LIMIT 1`
  );
  if (result.rows[0]) {
    return withPricing(result.rows[0]);
  }
  const inserted = await db.query(
    `INSERT INTO site_content (scope, language, content)
     VALUES ('default', 'de', $1::jsonb)
     RETURNING *`,
    [JSON.stringify(defaultSiteContent)]
  );
  return withPricing(inserted.rows[0]);
}

export async function updateSiteContent(db, content, userId = null) {
  const normalized = normalizeSiteContent(content);
  const result = await db.query(
    `INSERT INTO site_content (scope, language, content, updated_by)
     VALUES ('default', 'de', $1::jsonb, $2)
     ON CONFLICT (scope, language)
     DO UPDATE SET content = EXCLUDED.content, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [JSON.stringify(normalized), userId]
  );
  return { ...result.rows[0], content: normalizeSiteContent(result.rows[0].content) };
}
