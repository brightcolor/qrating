import { decryptSecret } from '../utils/crypto.js';
import { PretixImageResolver, normalizeSettings, extractImageCandidates, chooseBestImage } from './pretixImageResolver.js';
import { randomToken, slugify } from '../utils/crypto.js';

function localizedName(value) {
  if (!value) return 'Unbenanntes Event';
  if (typeof value === 'string') return value;
  return value.de || value.en || Object.values(value)[0] || 'Unbenanntes Event';
}

export class PretixService {
  constructor(db, fetchImpl = fetch) {
    this.db = db;
    this.fetchImpl = fetchImpl;
    this.imageResolver = new PretixImageResolver({ fetchImpl, db });
  }

  async testConnection(connection) {
    const token = connection.api_token || decryptSecret(connection.api_token_encrypted);
    const base = connection.base_url.replace(/\/$/, '');
    const organizer = connection.pretix_organizer_slug;
    const response = await this.fetchImpl(`${base}/api/v1/organizers/${organizer}/events/`, {
      headers: { Authorization: `Token ${token}` }
    });
    if (!response.ok) {
      const messages = { 401: 'Token ungültig.', 403: 'Keine Rechte für diesen Organizer.', 404: 'Organizer nicht gefunden.' };
      throw new Error(messages[response.status] || `Pretix antwortet mit Status ${response.status}.`);
    }
    const data = await response.json();
    return { ok: true, eventsFound: data.count ?? data.results?.length ?? 0 };
  }

  async syncConnection(connection) {
    const token = decryptSecret(connection.api_token_encrypted);
    const authConnection = { ...connection, api_token: token };
    const base = connection.base_url.replace(/\/$/, '');
    const organizer = connection.pretix_organizer_slug;
    let imported = 0;
    let images = 0;
    const response = await this.fetchImpl(`${base}/api/v1/organizers/${organizer}/events/`, {
      headers: { Authorization: `Token ${token}` }
    });
    if (!response.ok) throw new Error(`Pretix Events konnten nicht geladen werden (${response.status}).`);
    const data = await response.json();
    const events = data.results || [];

    for (const pretixEvent of events) {
      if (connection.import_live_only && !pretixEvent.live) continue;
      if (connection.ignore_testmode && pretixEvent.testmode) continue;
      if (connection.import_public_only && pretixEvent.is_public === false) continue;
      const saved = await this.upsertPretixEvent(connection, pretixEvent);
      imported += 1;
      if (connection.import_event_images) {
        const resolved = await this.syncImageForEvent(authConnection, saved, pretixEvent.slug).catch((error) => ({ error }));
        if (!resolved.error && resolved?.url) images += 1;
      }
    }

    await this.db.query(
      `UPDATE pretix_connections
       SET last_sync_at = now(),
           last_successful_sync_at = now(),
           next_sync_at = CASE WHEN sync_enabled THEN now() + (sync_interval_minutes * interval '1 minute') ELSE next_sync_at END,
           last_sync_status = $1,
           last_sync_error = null,
           updated_at = now()
       WHERE id = $2`,
      [`${imported} Events synchronisiert, ${images} Bilder erkannt`, connection.id]
    );
    return { imported, images };
  }

  async upsertPretixEvent(connection, pretixEvent) {
    const name = localizedName(pretixEvent.name);
    const slug = slugify(`${pretixEvent.slug}${pretixEvent.subevent_id ? `-${pretixEvent.subevent_id}` : ''}`);
    const result = await this.db.query(
      `INSERT INTO events (
        organization_id, source, pretix_connection_id, pretix_organizer_slug, pretix_event_slug, pretix_subevent_id,
        pretix_public_url, pretix_has_subevents, name, slug, event_feedback_token, date_from, date_to, date_admission,
        event_timezone, location, status, feedback_enabled, feedback_window_days, raw_source_payload, last_synced_at
      ) VALUES ($1,'pretix',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',true,$16,$17,now())
      ON CONFLICT (pretix_connection_id, pretix_event_slug, pretix_subevent_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        date_from = EXCLUDED.date_from,
        date_to = EXCLUDED.date_to,
        date_admission = EXCLUDED.date_admission,
        location = EXCLUDED.location,
        pretix_public_url = EXCLUDED.pretix_public_url,
        raw_source_payload = EXCLUDED.raw_source_payload,
        not_found_in_source = false,
        last_synced_at = now(),
        updated_at = now()
      RETURNING *`,
      [
        connection.organization_id,
        connection.id,
        connection.pretix_organizer_slug,
        pretixEvent.slug,
        pretixEvent.subevent_id || null,
        pretixEvent.public_url || null,
        Boolean(pretixEvent.has_subevents),
        name,
        slug,
        randomToken(),
        pretixEvent.date_from,
        pretixEvent.date_to || null,
        pretixEvent.date_admission || null,
        pretixEvent.timezone || 'Europe/Berlin',
        pretixEvent.location || null,
        3,
        pretixEvent
      ]
    );
    return result.rows[0];
  }

  async syncImageForEvent(connection, event, eventSlug = event.pretix_event_slug) {
    if (event.image_source === 'manual' && !connection.prefer_pretix_images) {
      return { url: event.image_url, key: null, skipped: 'manual_image_preferred' };
    }
    const settingsResponse = await this.imageResolver.fetchEventSettings(connection, eventSlug);
    const settings = normalizeSettings(settingsResponse);
    const configured = connection.image_key_candidates || [];
    const candidates = extractImageCandidates(settings, configured, connection.base_url);
    const best = chooseBestImage(candidates, { preferredKey: connection.preferred_image_settings_key });
    if (!best) {
      await this.db.query(
        'UPDATE events SET raw_settings_payload = $1, image_sync_error = $2, image_last_synced_at = now() WHERE id = $3',
        [settingsResponse, 'Kein Bild-Key in Pretix-Settings gefunden.', event.id]
      );
      return null;
    }
    let cachedUrl = null;
    try {
      cachedUrl = await this.imageResolver.cacheImageIfEnabled(best.url, event, connection);
    } catch (error) {
      await this.db.query('UPDATE events SET image_sync_error = $1 WHERE id = $2', [error.message, event.id]);
    }
    await this.db.query(
      `UPDATE events
       SET image_url = $1,
           image_source = 'pretix_settings',
           pretix_event_image_url = $2,
           cached_image_url = $3,
           detected_image_settings_key = $4,
           raw_settings_payload = $5,
           image_last_synced_at = now(),
           updated_at = now()
       WHERE id = $6`,
      [cachedUrl || best.url, best.url, cachedUrl, best.key, settingsResponse, event.id]
    );
    return { ...best, cachedUrl };
  }
}
