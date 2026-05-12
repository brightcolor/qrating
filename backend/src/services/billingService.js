import { env } from '../config/env.js';

export const defaultPlanDefinitions = [
  {
    id: 'free',
    name: 'Free',
    price: '0 EUR',
    summary: 'Basics fuer den Einstieg.',
    features: [
      '1 Organisation',
      '2 aktive Events',
      'Dynamische und Event-QR-Codes',
      'Sternebewertung, Freitext, Newsletter-CSV',
      '4 bis 5 einfache Formularvorlagen'
    ],
    limits: {
      activeEvents: 2,
      templates: 5,
      users: 1,
      customDomain: false,
      teams: false,
      pretix: false,
      webhooks: false,
      reports: false
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '29 EUR / Monat',
    summary: 'Alles fuer regelmaessige Events, ohne eigene Domain und ohne Team-Management.',
    features: [
      'Unbegrenzte Formularvorlagen und eigene Fragen',
      'Pretix-Sync und Eventbild-Erkennung',
      'CSV/XLSX-Export und PDF-Reports',
      'Low-Rating-Benachrichtigungen',
      'Webhooks, Wallboard und QR-Quellen-Auswertung'
    ],
    limits: {
      activeEvents: null,
      templates: null,
      users: 1,
      customDomain: false,
      teams: false,
      pretix: true,
      webhooks: true,
      reports: true
    }
  },
  {
    id: 'business',
    name: 'Business',
    price: '79 EUR / Monat',
    summary: 'Fuer eigene Domains, Teams und Management-Funktionen.',
    features: [
      'Alles aus Pro',
      'Eigene Domain vorbereitet',
      'Team- und Rollenmanagement',
      'Management-Ansichten fuer mehrere Verantwortliche',
      'Priorisierte Betriebs- und Integrationsoptionen'
    ],
    limits: {
      activeEvents: null,
      templates: null,
      users: null,
      customDomain: true,
      teams: true,
      pretix: true,
      webhooks: true,
      reports: true
    }
  }
];

const defaultLimits = Object.fromEntries(defaultPlanDefinitions.map((plan) => [plan.id, plan.limits]));

export const planDefinitions = defaultPlanDefinitions;

function normalizeFeatureList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}

function normalizeLimits(planId, limits = {}) {
  const fallback = defaultLimits[planId] || defaultLimits.free;
  return {
    activeEvents: limits.activeEvents === '' || limits.activeEvents === undefined ? fallback.activeEvents : limits.activeEvents,
    templates: limits.templates === '' || limits.templates === undefined ? fallback.templates : limits.templates,
    users: limits.users === '' || limits.users === undefined ? fallback.users : limits.users,
    customDomain: Boolean(limits.customDomain),
    teams: Boolean(limits.teams),
    pretix: Boolean(limits.pretix),
    webhooks: Boolean(limits.webhooks),
    reports: Boolean(limits.reports)
  };
}

function normalizeNumericLimit(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

export function normalizePlan(rowOrPlan) {
  const id = rowOrPlan.plan_key || rowOrPlan.id || 'free';
  const fallback = defaultPlanDefinitions.find((plan) => plan.id === id) || defaultPlanDefinitions[0];
  const features = normalizeFeatureList(rowOrPlan.features ?? fallback.features);
  const rawLimits = rowOrPlan.limits || fallback.limits || {};
  const limits = normalizeLimits(id, {
    ...rawLimits,
    activeEvents: normalizeNumericLimit(rawLimits.activeEvents),
    templates: normalizeNumericLimit(rawLimits.templates),
    users: normalizeNumericLimit(rawLimits.users)
  });
  return {
    id,
    name: String(rowOrPlan.name || fallback.name),
    price: String(rowOrPlan.price_label || rowOrPlan.price || fallback.price),
    summary: String(rowOrPlan.summary || fallback.summary),
    ctaLabel: String(rowOrPlan.cta_label || rowOrPlan.ctaLabel || fallback.ctaLabel || ''),
    features,
    limits,
    highlight: Boolean(rowOrPlan.highlight),
    active: rowOrPlan.active !== false,
    publicVisible: rowOrPlan.public_visible !== false,
    sortOrder: Number(rowOrPlan.sort_order ?? rowOrPlan.sortOrder ?? fallback.sortOrder ?? 0)
  };
}

export function planById(planId, plans = defaultPlanDefinitions) {
  return plans.find((plan) => plan.id === planId) || plans.find((plan) => plan.id === 'free') || defaultPlanDefinitions[0];
}

export async function getBillingPlans(db, { publicOnly = false } = {}) {
  try {
    const result = await db.query(
      `SELECT *
       FROM billing_plans
       WHERE ($1::boolean = false OR public_visible = true)
       ORDER BY sort_order, created_at`,
      [Boolean(publicOnly)]
    );
    const plans = result.rows.map(normalizePlan).filter((plan) => plan.active || plan.id === 'free');
    return plans.length ? plans : defaultPlanDefinitions.map(normalizePlan);
  } catch {
    return defaultPlanDefinitions.map(normalizePlan);
  }
}

export async function getBillingPlanById(db, planId) {
  const plans = await getBillingPlans(db);
  return planById(planId, plans);
}

export function planToPricingItem(plan) {
  return {
    plan: plan.id,
    name: plan.name,
    price: plan.price,
    text: plan.summary,
    ctaLabel: plan.ctaLabel || 'Plan anfragen',
    highlight: plan.highlight,
    features: plan.features
  };
}

export async function getPublicPricingPlans(db) {
  return (await getBillingPlans(db, { publicOnly: true }))
    .filter((plan) => plan.publicVisible)
    .map(planToPricingItem);
}

export async function updateBillingPlans(db, userId, incomingPlans = []) {
  const user = (await db.query('SELECT id, email FROM users WHERE id = $1', [userId])).rows[0] || {};
  if (!canOverrideBilling(user)) throw Object.assign(new Error('Keine Berechtigung fuer Plan-Konfiguration.'), { status: 403 });
  const allowed = new Set(defaultPlanDefinitions.map((plan) => plan.id));
  const normalized = incomingPlans
    .map((plan) => normalizePlan({
      ...plan,
      plan_key: plan.id || plan.planKey || plan.plan_key,
      price_label: plan.price || plan.priceLabel || plan.price_label,
      cta_label: plan.ctaLabel || plan.cta_label,
      public_visible: plan.publicVisible ?? plan.public_visible
    }))
    .filter((plan) => allowed.has(plan.id));
  if (normalized.length !== allowed.size) throw Object.assign(new Error('Free, Pro und Business muessen konfiguriert sein.'), { status: 400 });
  for (const plan of normalized) {
    await db.query(
      `INSERT INTO billing_plans (
         plan_key, name, price_label, summary, cta_label, features, limits, highlight, active, public_visible, sort_order
       )
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
       ON CONFLICT (plan_key)
       DO UPDATE SET
         name = EXCLUDED.name,
         price_label = EXCLUDED.price_label,
         summary = EXCLUDED.summary,
         cta_label = EXCLUDED.cta_label,
         features = EXCLUDED.features,
         limits = EXCLUDED.limits,
         highlight = EXCLUDED.highlight,
         active = EXCLUDED.active,
         public_visible = EXCLUDED.public_visible,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      [
        plan.id,
        plan.name,
        plan.price,
        plan.summary,
        plan.ctaLabel,
        JSON.stringify(plan.features),
        JSON.stringify(plan.limits),
        plan.highlight,
        plan.active,
        plan.publicVisible,
        plan.sortOrder
      ]
    );
  }
  return getBillingPlans(db);
}

export function effectiveBillingPlan(organization, now = new Date()) {
  if (
    organization.billing_override_plan &&
    (!organization.billing_override_expires_at || new Date(organization.billing_override_expires_at) > now)
  ) {
    return {
      plan: organization.billing_override_plan,
      source: 'override',
      expiresAt: organization.billing_override_expires_at || null
    };
  }
  if (organization.billing_status === 'active') {
    return { plan: organization.billing_plan || 'free', source: organization.billing_status };
  }
  return { plan: 'free', source: 'free' };
}

function canOverrideBilling(user) {
  return env.billingAdminEmails.includes(String(user.email || '').toLowerCase());
}

function publicBilling(organization, user) {
  const effective = effectiveBillingPlan(organization);
  return {
    plan: organization.billing_plan,
    effectivePlan: effective.plan,
    effectiveSource: effective.source,
    effectiveOverrideExpiresAt: effective.expiresAt,
    status: organization.billing_status,
    overridePlan: organization.billing_override_plan,
    overrideExpiresAt: organization.billing_override_expires_at,
    overrideReason: organization.billing_override_reason,
    pendingPlan: organization.billing_pending_plan,
    canOverride: canOverrideBilling(user),
    canManagePlans: canOverrideBilling(user)
  };
}

export async function getBillingOverview(db, organizationId, userId) {
  const org = (await db.query('SELECT * FROM organizations WHERE id = $1', [organizationId])).rows[0];
  const user = (await db.query('SELECT id, email FROM users WHERE id = $1', [userId])).rows[0] || {};
  const plans = await getBillingPlans(db);
  return {
    billing: publicBilling(org, user),
    plans,
    currentPlan: planById(effectiveBillingPlan(org).plan, plans)
  };
}

export async function applyBillingOverride(db, organizationId, userId, { plan, expiresAt = null, reason = '' }) {
  if (!['free', 'pro', 'business'].includes(plan)) throw Object.assign(new Error('Unbekannter Override-Tarif.'), { status: 400 });
  const user = (await db.query('SELECT id, email FROM users WHERE id = $1', [userId])).rows[0] || {};
  if (!canOverrideBilling(user)) throw Object.assign(new Error('Keine Berechtigung fuer Billing-Overrides.'), { status: 403 });
  const result = await db.query(
    `UPDATE organizations
     SET billing_override_plan = $2,
         billing_override_expires_at = $3,
         billing_override_reason = $4,
         billing_override_by = $5,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [organizationId, plan, expiresAt || null, reason || null, userId]
  );
  return result.rows[0];
}
