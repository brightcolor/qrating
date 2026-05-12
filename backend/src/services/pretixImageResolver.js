import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const defaultImageKeys = [
  'header_image',
  'shop_header_image',
  'frontend_header_image',
  'event_image',
  'frontpage_image',
  'banner_image',
  'primary_image',
  'social_media_image',
  'event_logo',
  'logo',
  'images',
  'image'
];

export function normalizeSettings(settingsResponse) {
  const source = settingsResponse?.results || settingsResponse || {};
  return Object.fromEntries(
    Object.entries(source).map(([key, raw]) => {
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, 'value')) {
        return [key, raw.value];
      }
      return [key, raw];
    })
  );
}

function extractUrls(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(extractUrls);
  if (typeof value === 'object') {
    return ['url', 'file', 'value', 'src', 'href']
      .flatMap((key) => extractUrls(value[key]));
  }
  return [];
}

export function resolveImageUrl(value, pretixBaseUrl) {
  const url = extractUrls(value).find((candidate) => /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(candidate) || /^https?:\/\//i.test(candidate));
  if (!url) return null;
  try {
    return new URL(url, pretixBaseUrl).toString();
  } catch {
    return null;
  }
}

export function extractImageCandidates(settings, configuredKeys = [], pretixBaseUrl = '') {
  const keys = [...new Set([...configuredKeys.filter(Boolean), ...defaultImageKeys])];
  const candidates = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;
    const url = resolveImageUrl(settings[key], pretixBaseUrl);
    if (url) candidates.push({ key, url, value: settings[key] });
  }
  return candidates;
}

export function chooseBestImage(candidates, priorityConfig = {}) {
  if (!candidates.length) return null;
  if (priorityConfig.preferredKey) {
    const preferred = candidates.find((candidate) => candidate.key === priorityConfig.preferredKey);
    if (preferred) return preferred;
  }
  const priority = ['header', 'shop', 'front', 'banner', 'primary', 'social', 'logo'];
  return [...candidates].sort((a, b) => {
    const rank = (candidate) => {
      const key = candidate.key.toLowerCase();
      const idx = priority.findIndex((part) => key.includes(part));
      return idx === -1 ? 99 : idx;
    };
    return rank(a) - rank(b);
  })[0];
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254);
  }
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
}

export async function assertSafeImageUrl(imageUrl, pretixBaseUrl, allowedHosts = []) {
  const url = new URL(imageUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ungültiges Bild-Protokoll.');
  const pretixHost = new URL(pretixBaseUrl).hostname;
  const hosts = new Set([pretixHost, ...allowedHosts]);
  if (!hosts.has(url.hostname)) throw new Error('Bild-Host ist nicht erlaubt.');
  const records = await dns.lookup(url.hostname, { all: true });
  if (records.some((record) => isPrivateIp(record.address))) throw new Error('Private IPs sind für Bildimporte gesperrt.');
}

export class PretixImageResolver {
  constructor({ fetchImpl = fetch, db = null } = {}) {
    this.fetchImpl = fetchImpl;
    this.db = db;
  }

  async fetchEventSettings(connection, eventSlug) {
    const base = connection.base_url.replace(/\/$/, '');
    const organizer = connection.pretix_organizer_slug;
    const headers = { Authorization: `Token ${connection.api_token}` };
    const explainUrl = `${base}/api/v1/organizers/${organizer}/events/${eventSlug}/settings/?explain=true`;
    let response = await this.fetchImpl(explainUrl, { headers });
    if (!response.ok && response.status === 400) {
      response = await this.fetchImpl(`${base}/api/v1/organizers/${organizer}/events/${eventSlug}/settings/`, { headers });
    }
    if (!response.ok) throw new Error(`Pretix Settings konnten nicht geladen werden (${response.status}).`);
    return response.json();
  }

  normalizeSettings(settingsResponse) {
    return normalizeSettings(settingsResponse);
  }

  extractImageCandidates(settings, configuredKeys, pretixBaseUrl) {
    return extractImageCandidates(settings, configuredKeys, pretixBaseUrl);
  }

  resolveImageUrl(value, pretixBaseUrl) {
    return resolveImageUrl(value, pretixBaseUrl);
  }

  chooseBestImage(candidates, priorityConfig) {
    return chooseBestImage(candidates, priorityConfig);
  }

  async cacheImageIfEnabled(imageUrl, event, connection = {}) {
    if (!connection.cache_event_images) return null;
    await assertSafeImageUrl(imageUrl, connection.base_url, connection.allowed_image_hosts || []);
    const response = await this.fetchImpl(imageUrl);
    if (!response.ok) throw new Error(`Bilddownload fehlgeschlagen (${response.status}).`);
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Bild-MIME-Type ist nicht erlaubt.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > env.imageCacheMaxBytes) throw new Error('Bilddatei ist zu groß.');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${event.id}-${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${ext}`;
    const target = path.join(process.cwd(), '..', 'storage', 'event-images', filename);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    const cachedUrl = `/storage/event-images/${filename}`;
    if (this.db) {
      const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
      for (const variant of ['original', 'header', 'thumbnail']) {
        await this.db.query(
          `INSERT INTO event_image_cache (
            event_id, original_url, cached_url, mime_type, file_size, checksum, source,
            settings_key, variant, cache_status, last_checked_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,'pretix_settings',$7,$8,'cached',now())
          ON CONFLICT (event_id, original_url, variant)
          DO UPDATE SET
            cached_url = EXCLUDED.cached_url,
            mime_type = EXCLUDED.mime_type,
            file_size = EXCLUDED.file_size,
            checksum = EXCLUDED.checksum,
            cache_status = 'cached',
            last_error = null,
            last_checked_at = now(),
            updated_at = now()`,
          [event.id, imageUrl, cachedUrl, mime, bytes.length, checksum, event.detected_image_settings_key || null, variant]
        );
      }
    }
    return cachedUrl;
  }

  async updateEventImage(event, resolvedImage) {
    if (!this.db || !resolvedImage) return event;
    const result = await this.db.query(
      `UPDATE events
       SET image_url = $1,
           image_source = 'pretix_settings',
           pretix_event_image_url = $1,
           detected_image_settings_key = $2,
           image_last_synced_at = now(),
           image_sync_error = null,
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [resolvedImage.cachedUrl || resolvedImage.url, resolvedImage.key, event.id]
    );
    return result.rows[0];
  }

  getFallbackImage(event, organization) {
    if (event?.image_url) return { url: event.image_url, key: null, source: event.image_source || 'manual' };
    if (organization?.logo_url) return { url: organization.logo_url, key: null, source: 'organization' };
    return { url: null, key: null, source: 'fallback' };
  }
}
