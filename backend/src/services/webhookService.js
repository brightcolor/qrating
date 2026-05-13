import crypto from 'crypto';
import { decryptSecret } from '../utils/crypto.js';

export class WebhookService {
  constructor(db, fetchImpl = fetch) {
    this.db = db;
    this.fetchImpl = fetchImpl;
  }

  async dispatch(organizationId, eventName, payload) {
    const endpoints = await this.db.query(
      `SELECT * FROM webhook_endpoints
       WHERE organization_id = $1
         AND active = true
         AND events ? $2`,
      [organizationId, eventName]
    );
    for (const endpoint of endpoints.rows) {
      await this.callEndpoint(endpoint, eventName, payload).catch(async (error) => {
        await this.db.query(
          'UPDATE webhook_endpoints SET last_status = $1, last_error = $2, last_called_at = now() WHERE id = $3',
          ['error', error.message, endpoint.id]
        );
      });
    }
  }

  async callEndpoint(endpoint, eventName, payload) {
    const body = JSON.stringify({ event: eventName, payload });
    const headers = { 'content-type': 'application/json', 'user-agent': 'qrating-Webhook/0.1' };
    const secret = endpoint.secret_encrypted ? decryptSecret(endpoint.secret_encrypted) : endpoint.secret;
    if (secret) {
      headers['x-qrating-signature'] = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    }
    const response = await this.fetchImpl(endpoint.url, { method: 'POST', headers, body });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    await this.db.query(
      'UPDATE webhook_endpoints SET last_status = $1, last_error = null, last_called_at = now() WHERE id = $2',
      [`${response.status}`, endpoint.id]
    );
  }
}
