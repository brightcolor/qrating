import { describe, expect, it } from 'vitest';
import { isPublishedInSource, sourcePayload } from '../src/utils/sourcePayload.js';

describe('what the sync wrote down about an event', () => {
  it('reads the payload as an object and as text', () => {
    expect(sourcePayload({ raw_source_payload: { live: true } })).toEqual({ live: true });
    expect(sourcePayload({ raw_source_payload: '{"live":true}' })).toEqual({ live: true });
  });

  it('says nothing when there is no payload or it is broken', () => {
    expect(sourcePayload({})).toBeNull();
    expect(sourcePayload({ raw_source_payload: null })).toBeNull();
    expect(sourcePayload({ raw_source_payload: 'kein json' })).toBeNull();
  });

  it('holds back an event that Pretix has not published', () => {
    expect(isPublishedInSource({ raw_source_payload: { live: false } })).toBe(false);
    expect(isPublishedInSource({ raw_source_payload: '{"live":false}' })).toBe(false);
  });

  it('lets a published one through', () => {
    expect(isPublishedInSource({ raw_source_payload: { live: true } })).toBe(true);
  });

  it('counts an event of our own as published, it carries no such flag', () => {
    expect(isPublishedInSource({ name: 'Sommerfest' })).toBe(true);
    expect(isPublishedInSource({ raw_source_payload: { slug: 'sommerfest' } })).toBe(true);
    expect(isPublishedInSource(null)).toBe(true);
  });
});
