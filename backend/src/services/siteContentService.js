import { defaultPlanDefinitions, getPublicPricingPlans, normalizePlan, planToPricingItem } from './billingService.js';

// Earlier releases shipped this placeholder as hero image; it no longer exists.
const legacyHeroImageUrl = '/marketing-hero.png';

export const defaultSiteContent = {
  brand: 'qrating',
  showProductCredit: true,
  eyebrow: 'QR-Feedback für Events',
  headline: 'Dein Publikum hat was zu sagen.',
  subheadline: 'Ein QR-Code auf Bändchen, Ticket oder Tresen. Deine Gäste vergeben Sterne, tippen Stichworte an und sagen, was hängen blieb. Du erfährst es, solange der Abend noch nachklingt.',
  heroImageUrl: '',
  primaryCtaLabel: 'Zugang anfragen',
  primaryCtaUrl: '#zugang',
  secondaryCtaLabel: 'Gästeseite ansehen',
  secondaryCtaUrl: '/f/demo-events',
  trustText: 'Für Konzerte, Clubnächte, Festivals und Firmenevents.',
  contactEmail: 'kontakt@qrating.de',
  footerText: 'QR-Feedback für Veranstalter.',
  stepsHeadline: 'So kommt die Stimmung zu dir.',
  featuresHeadline: 'Alles drin für die Zeit nach dem letzten Song.',
  pricingHeadline: 'Such dir dein Bändchen aus.',
  pricingNote: '',
  faqHeadline: 'Noch Fragen?',
  ctaHeadline: 'Mach dein nächstes Event noch besser.',
  ctaText: 'Schreib uns kurz, wir richten deinen Zugang ein.',
  features: [
    {
      title: 'Ein Code für alle Events',
      text: 'Zeigt immer auf das Event, das gerade bewertet werden kann. Einmal drucken, jede Saison nutzen.'
    },
    {
      title: 'Gästeseite fürs Handy',
      text: 'Große Tasten, Eventbild, deine Farben und dein Logo. Texte auf Deutsch und Englisch.'
    },
    {
      title: 'Alarm bei Enttäuschung',
      text: 'Mail, Slack, Discord, Teams, Telegram, Pushover, ntfy, Gotify oder Webhook. Mit Rückruf-Fall und Status.'
    },
    {
      title: 'Events aus Pretix',
      text: 'Deine Events und Eventbilder kommen direkt aus dem Pretix-Shop und bleiben im Abgleich.'
    },
    {
      title: 'Auswertung und Export',
      text: 'Bewertungen, Kommentare und Scans je Stelle. CSV, Excel und PDF-Report per Mail.'
    },
    {
      title: 'Datenschutz eingebaut',
      text: 'Kontaktdaten verschlüsselt, jede Einsicht protokolliert, Löschfristen automatisch, 2FA für dein Team.'
    }
  ],
  steps: [
    {
      title: 'Code verteilen',
      text: 'Aufs Bändchen, aufs Ticket, an die Bar, in Social Media. Jede Stelle bekommt ihren eigenen Namen, so siehst du, wo gescannt wird.'
    },
    {
      title: 'Gäste erzählen',
      text: 'Sterne, Stichworte, ein Satz dazu. Wer enttäuscht war, hinterlässt auf Wunsch eine Nummer für den Rückruf.'
    },
    {
      title: 'Du machst was draus',
      text: 'Im Dashboard siehst du, was gut lief. Kritische Stimmen landen als Fall bei deinem Team.'
    }
  ],
  pricing: defaultPlanDefinitions.map(normalizePlan).map(planToPricingItem),
  faq: [
    {
      question: 'Brauchen Gäste eine App?',
      answer: 'Der QR-Code öffnet die Bewertung direkt im Browser des Handys. Angaben wie E-Mail-Adresse oder Telefonnummer sind freiwillig.'
    },
    {
      question: 'Woher weiß der Code, welches Event läuft?',
      answer: 'qrating vergleicht Datum, Uhrzeit und Zeitzone mit deinen Events. Standardmäßig bleibt die Bewertung nach dem Event noch drei Tage offen.'
    },
    {
      question: 'Was passiert mit den Daten meiner Gäste?',
      answer: 'Telefonnummern und E-Mail-Adressen speichert qrating nur mit Einwilligung, verschlüsselt und mit Löschfrist.'
    },
    {
      question: 'Kann ich qrating selbst betreiben?',
      answer: 'Ja. qrating läuft mit Docker Compose auf deinem eigenen Server.'
    }
  ],
  imprint: 'Angaben gemäß Impressumspflicht\n\nqrating Betreiber\nMusterstraße 1\n12345 Musterstadt\n\nE-Mail: kontakt@qrating.de\n\nBitte passe dieses Impressum vor dem produktiven Betrieb im Adminbereich an.',
  privacy: 'Datenschutzerklärung\n\nqrating kann anonymes Veranstaltungsfeedback erfassen. Personenbezogene Daten wie E-Mail-Adressen für den Newsletter oder freiwillige Rückrufnummern werden nur für den jeweils gewählten Zweck verarbeitet.\n\nBitte passe diese Datenschutzerklärung vor dem produktiven Betrieb im Adminbereich an.'
};

// Section headings always show text; an emptied field falls back to the default.
const headingKeys = ['stepsHeadline', 'featuresHeadline', 'pricingHeadline', 'faqHeadline', 'ctaHeadline'];

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
    showProductCredit: merged.showProductCredit !== false,
    eyebrow: String(merged.eyebrow || ''),
    headline: String(merged.headline || defaultSiteContent.headline),
    subheadline: String(merged.subheadline || defaultSiteContent.subheadline),
    heroImageUrl: merged.heroImageUrl === legacyHeroImageUrl ? '' : String(merged.heroImageUrl || ''),
    primaryCtaLabel: String(merged.primaryCtaLabel || defaultSiteContent.primaryCtaLabel),
    primaryCtaUrl: String(merged.primaryCtaUrl || defaultSiteContent.primaryCtaUrl),
    secondaryCtaLabel: String(merged.secondaryCtaLabel || defaultSiteContent.secondaryCtaLabel),
    secondaryCtaUrl: String(merged.secondaryCtaUrl || defaultSiteContent.secondaryCtaUrl),
    trustText: String(merged.trustText || ''),
    contactEmail: String(merged.contactEmail || ''),
    footerText: String(merged.footerText || ''),
    ...Object.fromEntries(headingKeys.map((key) => [key, String(merged[key] || defaultSiteContent[key])])),
    pricingNote: String(merged.pricingNote || ''),
    ctaText: String(merged.ctaText || ''),
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
