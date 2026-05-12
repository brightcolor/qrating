import { describe, expect, it } from 'vitest';
import { normalizeSiteContent } from '../src/services/siteContentService.js';

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
});
