// Hands newsletter opt-ins to the newsletter system of the organization (MailWizz).
// Every entry carries the event it came from, so a campaign can address exactly that audience.
import { decryptSecret } from '../utils/crypto.js';
import { localizedName } from './pretixService.js';

const requestTimeoutMs = 10_000;

// MailWizz answers with {status, error}; the error can be a text or a map of field errors.
function describeFailure({ status, body, text }) {
  const raw = body?.error ?? body?.message ?? null;
  const detail = raw && typeof raw === 'object' ? Object.values(raw).join(' ') : raw;
  if (status === 401 || status === 403) {
    return `MailWizz hat den API-Schlüssel abgelehnt (HTTP ${status}). Prüfe den Schlüssel und ob er für diese Liste gilt.`;
  }
  if (status === 404) {
    return `MailWizz kennt diese Liste nicht (HTTP 404). Prüfe die Listen-UID und die API-Adresse.`;
  }
  const suffix = detail || (text ? String(text).slice(0, 200) : '');
  return `MailWizz hat mit HTTP ${status} geantwortet${suffix ? `: ${suffix}` : '.'}`;
}

export class MailwizzClient {
  constructor({ apiUrl, apiKey, listUid, fetchImpl = fetch }) {
    this.apiUrl = String(apiUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.listUid = listUid;
    this.fetchImpl = fetchImpl;
  }

  url(path = '') {
    return `${this.apiUrl}/lists/${this.listUid}${path}`;
  }

  async send(method, path, fields) {
    let response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method,
        headers: {
          'X-API-KEY': this.apiKey,
          accept: 'application/json',
          ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
        },
        body: fields ? new URLSearchParams(fields).toString() : undefined,
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
    } catch (error) {
      throw new Error(`MailWizz war nicht erreichbar (${error.message}). Prüfe die API-Adresse und ob der Server von hier aus erreichbar ist.`);
    }
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, ok: response.ok && body?.status !== 'error', body, text };
  }

  // A known address answers with a conflict; then the entry gets the current values.
  async subscribe(fields) {
    const created = await this.send('POST', '/subscribers', fields);
    if (created.ok) return { status: 'created' };
    if ([409, 422].includes(created.status)) {
      const updated = await this.send('PUT', '/subscribers/search-by-email-and-update', fields);
      if (updated.ok) return { status: 'updated' };
      throw new Error(describeFailure(updated));
    }
    throw new Error(describeFailure(created));
  }

  async test() {
    const result = await this.send('GET', '');
    if (!result.ok) throw new Error(describeFailure(result));
    return { status: 'ok', list: result.body?.data?.record?.general?.name || null };
  }
}

// The name of the event as it stands in Pretix; manual events fall back to their own name.
export function pretixEventName(event) {
  if (!event) return null;
  const raw = typeof event.raw_source_payload === 'string'
    ? JSON.parse(event.raw_source_payload)
    : event.raw_source_payload;
  const fromSource = raw?.name ? localizedName(raw.name) : null;
  const name = String(fromSource && fromSource !== 'Unbenanntes Event' ? fromSource : event.name || '').trim();
  return name || null;
}

export class NewsletterService {
  constructor(db, { createClient } = {}) {
    this.db = db;
    this.createClient = createClient || ((connection) => new MailwizzClient({
      apiUrl: connection.api_url,
      apiKey: decryptSecret(connection.api_key_encrypted),
      listUid: connection.list_uid
    }));
  }

  async connectionFor(organizationId, { onlyEnabled = true } = {}) {
    const result = await this.db.query(
      onlyEnabled
        ? 'SELECT * FROM newsletter_connections WHERE organization_id = $1 AND enabled = true'
        : 'SELECT * FROM newsletter_connections WHERE organization_id = $1',
      [organizationId]
    );
    return result.rows[0] || null;
  }

  // The fields of one subscriber: the address and the event of the entry.
  async fieldsFor(optin, connection) {
    const email = optin.email_encrypted ? decryptSecret(optin.email_encrypted) : optin.email;
    if (!email) return null;
    const event = optin.event_id
      ? (await this.db.query('SELECT * FROM events WHERE id = $1', [optin.event_id])).rows[0]
      : null;
    const fields = { EMAIL: email };
    const eventName = pretixEventName(event);
    if (eventName) fields[connection.event_field_tag] = eventName;
    return fields;
  }

  async syncOptin(optinId) {
    const optin = (await this.db.query('SELECT * FROM newsletter_optins WHERE id = $1', [optinId])).rows[0];
    if (!optin) return { skipped: 'optin_missing' };
    const connection = await this.connectionFor(optin.organization_id);
    if (!connection?.api_key_encrypted) return { skipped: 'no_connection' };
    const fields = await this.fieldsFor(optin, connection);
    if (!fields) return { skipped: 'no_email' };

    try {
      const result = await this.createClient(connection).subscribe(fields);
      await this.db.query(
        'UPDATE newsletter_optins SET synced_at = now(), sync_status = $2, sync_error = null WHERE id = $1',
        [optin.id, result.status]
      );
      await this.writeConnectionState(connection.id, { sync_status: result.status, sync_error: null });
      return result;
    } catch (error) {
      await this.db.query(
        "UPDATE newsletter_optins SET sync_status = 'failed', sync_error = $2 WHERE id = $1",
        [optin.id, error.message]
      );
      await this.writeConnectionState(connection.id, { sync_status: 'failed', sync_error: error.message });
      throw error;
    }
  }

  async writeConnectionState(connectionId, { sync_status, sync_error }) {
    await this.db.query(
      `UPDATE newsletter_connections
       SET last_sync_at = now(), last_sync_status = $2, last_sync_error = $3, updated_at = now()
       WHERE id = $1`,
      [connectionId, sync_status, sync_error]
    );
  }

  async testConnection(connection) {
    try {
      const result = await this.createClient(connection).test();
      await this.db.query(
        `UPDATE newsletter_connections
         SET last_test_at = now(), last_test_status = 'ok', last_test_error = null, updated_at = now()
         WHERE id = $1`,
        [connection.id]
      );
      return result;
    } catch (error) {
      await this.db.query(
        `UPDATE newsletter_connections
         SET last_test_at = now(), last_test_status = 'failed', last_test_error = $2, updated_at = now()
         WHERE id = $1`,
        [connection.id, error.message]
      );
      throw error;
    }
  }
}
