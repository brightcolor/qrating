import { describe, expect, it } from 'vitest';
import { defaultSiteContent, normalizeSiteContent } from '../src/services/siteContentService.js';

describe('SiteContentService', () => {
  it('keeps legal content editable and fills SaaS landing defaults', () => {
    const content = normalizeSiteContent({
      headline: 'Eigene SaaS Headline',
      imprint: 'Eigenes Impressum',
      privacy: 'Eigene Datenschutzerklaerung',
      faq: [{ question: 'Bearbeitbar?', answer: 'Ja.' }]
    });

    expect(content.headline).toBe('Eigene SaaS Headline');
    expect(content.imprint).toBe('Eigenes Impressum');
    expect(content.privacy).toBe('Eigene Datenschutzerklaerung');
    expect(content.features.length).toBeGreaterThan(0);
    expect(content.faq).toEqual([{ question: 'Bearbeitbar?', answer: 'Ja.' }]);
  });

  it('fills section headings for content saved before they existed', () => {
    const content = normalizeSiteContent({ headline: 'Alte Seite', stepsHeadline: '' });

    expect(content.stepsHeadline).toBe(defaultSiteContent.stepsHeadline);
    expect(content.featuresHeadline).toBe(defaultSiteContent.featuresHeadline);
    expect(content.pricingHeadline).toBe(defaultSiteContent.pricingHeadline);
    expect(content.faqHeadline).toBe(defaultSiteContent.faqHeadline);
    expect(content.ctaHeadline).toBe(defaultSiteContent.ctaHeadline);
  });

  it('lets admins clear the optional texts', () => {
    const content = normalizeSiteContent({ eyebrow: '', trustText: '', ctaText: '', pricingNote: '' });

    expect(content).toMatchObject({ eyebrow: '', trustText: '', ctaText: '', pricingNote: '' });
  });

  it('shows no hero image for the placeholder of earlier releases', () => {
    expect(normalizeSiteContent({ heroImageUrl: '/marketing-hero.png' }).heroImageUrl).toBe('');
    expect(normalizeSiteContent({ heroImageUrl: '/storage/site/crowd.jpg' }).heroImageUrl).toBe('/storage/site/crowd.jpg');
  });

  it('offers the default plans on the website while no plans are stored', () => {
    expect(defaultSiteContent.pricing.map((plan) => plan.plan)).toEqual(['free', 'pro', 'business']);
    expect(defaultSiteContent.pricing[1]).toMatchObject({ name: 'Pro', price: '29 € / Monat', ctaLabel: 'Pro anfragen' });
  });
});
