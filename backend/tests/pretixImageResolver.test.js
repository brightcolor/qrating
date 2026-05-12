import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeImageUrl,
  chooseBestImage,
  extractImageCandidates,
  normalizeSettings,
  resolveImageUrl
} from '../src/services/pretixImageResolver.js';

describe('PretixImageResolver', () => {
  it('normalizes explain=true settings payloads', () => {
    const normalized = normalizeSettings({ header_image: { value: '/media/header.jpg', label: 'Header' } });
    expect(normalized.header_image).toBe('/media/header.jpg');
  });

  it('normalizes plain settings payloads', () => {
    const normalized = normalizeSettings({ image: '/media/plain.jpg' });
    expect(normalized.image).toBe('/media/plain.jpg');
  });

  it('resolves absolute URLs', () => {
    expect(resolveImageUrl('https://tickets.example.com/media/a.jpg', 'https://tickets.example.com')).toBe('https://tickets.example.com/media/a.jpg');
  });

  it('resolves relative URLs', () => {
    expect(resolveImageUrl('/media/a.jpg', 'https://tickets.example.com')).toBe('https://tickets.example.com/media/a.jpg');
  });

  it('resolves object values', () => {
    expect(resolveImageUrl({ value: '/media/a.webp' }, 'https://tickets.example.com')).toBe('https://tickets.example.com/media/a.webp');
    expect(resolveImageUrl({ url: '/media/b.png' }, 'https://tickets.example.com')).toBe('https://tickets.example.com/media/b.png');
  });

  it('extracts multiple image candidates', () => {
    const candidates = extractImageCandidates({
      logo: '/media/logo.png',
      header_image: '/media/header.jpg'
    }, [], 'https://tickets.example.com');
    expect(candidates.map((candidate) => candidate.key)).toEqual(['header_image', 'logo']);
  });

  it('uses an admin-preferred settings key first', () => {
    const best = chooseBestImage([
      { key: 'logo', url: 'https://tickets.example.com/logo.png' },
      { key: 'social_media_image', url: 'https://tickets.example.com/social.png' }
    ], { preferredKey: 'logo' });
    expect(best.key).toBe('logo');
  });

  it('prefers header-like images over logos', () => {
    const best = chooseBestImage([
      { key: 'logo', url: 'https://tickets.example.com/logo.png' },
      { key: 'shop_header_image', url: 'https://tickets.example.com/header.png' }
    ]);
    expect(best.key).toBe('shop_header_image');
  });

  it('returns null when no image is found', () => {
    expect(chooseBestImage([])).toBeNull();
    expect(extractImageCandidates({ theme: 'dark' }, [], 'https://tickets.example.com')).toHaveLength(0);
  });

  it('blocks non-pretix image hosts', async () => {
    await expect(assertSafeImageUrl('https://evil.example.com/a.jpg', 'https://tickets.example.com')).rejects.toThrow('nicht erlaubt');
  });
});
