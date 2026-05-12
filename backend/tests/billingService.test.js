import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveBillingPlan,
  getBillingPlans,
  getPublicPricingPlans,
  planById,
  updateBillingPlans
} from '../src/services/billingService.js';
import { env } from '../src/config/env.js';

const dbPlanRows = [
  {
    plan_key: 'free',
    name: 'Starter',
    price_label: '0 EUR',
    summary: 'Kostenloser Einstieg',
    cta_label: 'Starten',
    features: ['Nur Basics'],
    limits: { activeEvents: 1, templates: 4, users: 1, pretix: false, reports: false, webhooks: false, teams: false, customDomain: false },
    public_visible: true,
    active: true,
    highlight: false,
    sort_order: 10
  },
  {
    plan_key: 'pro',
    name: 'Growth',
    price_label: '39 EUR',
    summary: 'Mehr Features',
    cta_label: 'Testen',
    features: ['Pretix', 'Reports'],
    limits: { activeEvents: null, templates: null, users: 1, pretix: true, reports: true, webhooks: true, teams: false, customDomain: false },
    public_visible: true,
    active: true,
    highlight: true,
    sort_order: 20
  },
  {
    plan_key: 'business',
    name: 'Agency',
    price_label: '99 EUR',
    summary: 'Teams',
    cta_label: 'Anfragen',
    features: ['Teams'],
    limits: { activeEvents: null, templates: null, users: null, pretix: true, reports: true, webhooks: true, teams: true, customDomain: true },
    public_visible: false,
    active: true,
    highlight: false,
    sort_order: 30
  }
];

describe('BillingService', () => {
  afterEach(() => {
    env.billingAdminEmails = [];
  });

  it('uses active paid plan when no override exists', () => {
    const result = effectiveBillingPlan({ billing_plan: 'pro', billing_status: 'active' });
    expect(result.plan).toBe('pro');
    expect(planById(result.plan).limits.pretix).toBe(true);
    expect(planById(result.plan).limits.customDomain).toBe(false);
  });

  it('lets platform override grant business for free', () => {
    const result = effectiveBillingPlan({
      billing_plan: 'free',
      billing_status: 'free',
      billing_override_plan: 'business',
      billing_override_expires_at: new Date(Date.now() + 86400000).toISOString()
    });
    expect(result).toMatchObject({ plan: 'business', source: 'override' });
    expect(planById(result.plan).limits.teams).toBe(true);
  });

  it('falls back to free after expired override or inactive plan status', () => {
    const result = effectiveBillingPlan({
      billing_plan: 'pro',
      billing_status: 'canceled',
      billing_override_plan: 'business',
      billing_override_expires_at: new Date(Date.now() - 86400000).toISOString()
    });
    expect(result.plan).toBe('free');
  });

  it('loads configurable plans from the database', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: dbPlanRows }) };
    const plans = await getBillingPlans(db);

    expect(planById('free', plans).name).toBe('Starter');
    expect(planById('free', plans).limits.activeEvents).toBe(1);
    expect(planById('pro', plans).limits.reports).toBe(true);
  });

  it('uses public billing plans as pricing source', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: dbPlanRows }) };
    const pricing = await getPublicPricingPlans(db);

    expect(pricing.map((plan) => plan.plan)).toEqual(['free', 'pro']);
    expect(pricing[1]).toMatchObject({ name: 'Growth', price: '39 EUR', highlight: true });
  });

  it('allows platform admins to update the global plan matrix', async () => {
    env.billingAdminEmails = ['owner@example.com'];
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('FROM users')) return { rows: [{ email: 'owner@example.com' }] };
        if (sql.includes('FROM billing_plans')) return { rows: dbPlanRows };
        return { rows: [] };
      })
    };

    const result = await updateBillingPlans(db, 'user-1', dbPlanRows.map((row) => ({
      id: row.plan_key,
      name: row.name,
      price: row.price_label,
      summary: row.summary,
      ctaLabel: row.cta_label,
      features: row.features,
      limits: row.limits,
      highlight: row.highlight,
      active: row.active,
      publicVisible: row.public_visible,
      sortOrder: row.sort_order
    })));

    expect(result.length).toBe(3);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO billing_plans'), expect.any(Array));
  });
});
