import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, query } from '../src/db/pool.js';
import { runMigrations, seedDefaultData } from '../src/db/bootstrap.js';
import { app } from '../src/server.js';
import { env } from '../src/config/env.js';
import { signAdmin } from '../src/middleware/auth.js';
import { authRouter } from '../src/routes/auth.js';
import { adminRouter } from '../src/routes/admin.js';
import { eventPreviewRouter } from '../src/routes/eventPreview.js';
import { platformRouter } from '../src/routes/platform.js';
import { securityRouter } from '../src/routes/security.js';
import { freshSetupCode } from './support/setupCode.js';

vi.mock('../src/db/pool.js', async () => {
  const { createPglitePool } = await import('./support/pglitePool.js');
  return createPglitePool();
});

// The routers as the server mounts them.
const routers = [
  ['/admin', authRouter],
  ['/admin/platform', platformRouter],
  ['/admin', eventPreviewRouter],
  ['/admin', securityRouter],
  ['/admin', adminRouter]
];

// Routes that write and still serve every account, even support, or no account at all. Each one
// keeps to what belongs to the person: their own account, their own channels, the cases and
// reports of the events assigned to them. A new route that writes stands here with its reason,
// or it refuses support.
const openToEveryone = {
  'POST /admin/setup/first-admin': 'the first setup, before any account exists',
  'POST /admin/login': 'signing in',
  'POST /admin/login/2fa': 'signing in',
  'POST /admin/logout': 'signing out',
  'POST /admin/accept-invite/preview': 'an invitation, opened by its link',
  'POST /admin/accept-invite': 'an invitation, taken up by its link',
  'POST /admin/password-reset/request': 'a reset link for an address',
  'POST /admin/password-reset/confirm': 'a new password by the reset link',
  'PATCH /admin/me/preferences': 'the look of the own admin area',
  'POST /admin/2fa/setup': 'the second factor of the own account',
  'POST /admin/2fa/confirm': 'the second factor of the own account',
  'POST /admin/2fa/disable': 'the second factor of the own account',
  'POST /admin/events/:id/report-email': 'a report to oneself, for an assigned event',
  'POST /admin/notification-channels': 'the own alert channels',
  'PATCH /admin/notification-channels/:id': 'the own alert channels',
  'DELETE /admin/notification-channels/:id': 'the own alert channels',
  'POST /admin/notification-channels/:id/test': 'the own alert channels',
  'PATCH /admin/low-rating-cases/:id': 'the callbacks of assigned events',
  'POST /admin/pii-vault/low-rating-cases/:id/reveal': 'a callback number of an assigned event, written to the audit',
  'DELETE /admin/pii-vault/low-rating-cases/:id/contact': 'a callback number of an assigned event, once it is dealt with'
};

const writingRoutes = routers.flatMap(([base, router]) => router.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods)
    .filter((method) => !['get', 'head', '_all'].includes(method))
    .map((method) => `${method.toUpperCase()} ${base}${layer.route.path}`)));

let server;
let baseUrl;
let supportCookie;

beforeAll(async () => {
  await runMigrations();
  await seedDefaultData();
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const setup = await fetch(`${baseUrl}/admin/setup/first-admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupCode: await freshSetupCode(), name: 'Owner', email: 'owner@example.test', password: 'test-password-123', organizationName: 'Beispiel Events' })
  });
  expect(setup.status).toBe(201);
  const organization = (await query('SELECT id FROM organizations LIMIT 1')).rows[0];
  // Every feature of the plan is open, so only the role can stand in the way.
  await query("UPDATE organizations SET billing_override_plan = 'business' WHERE id = $1", [organization.id]);
  const support = (await query(
    `INSERT INTO users (organization_id, name, email, password_hash, role, status)
     VALUES ($1, 'Support', 'support@example.test', $2, 'support', 'active') RETURNING *`,
    [organization.id, await bcrypt.hash('test-password-123', 4)]
  )).rows[0];
  supportCookie = `${env.adminCookieName}=${signAdmin(support)}`;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db.close();
});

describe('the routes that write', () => {
  it('are found, so the check below covers something', () => {
    expect(writingRoutes.length).toBeGreaterThan(50);
    expect(writingRoutes).toContain('PATCH /admin/qr-sources/:id');
  });

  it('name each open route with a reason that still exists', () => {
    const missing = Object.keys(openToEveryone).filter((route) => !writingRoutes.includes(route));

    expect(missing).toEqual([]);
  });

  it('refuse a support account, unless they serve everyone', async () => {
    const someId = '00000000-0000-4000-8000-000000000001';
    const guarded = writingRoutes.filter((route) => !Object.hasOwn(openToEveryone, route));
    const answers = [];
    for (const route of guarded) {
      const [method, path] = route.split(' ');
      const response = await fetch(`${baseUrl}${path.replace(/:[A-Za-z]+/g, someId)}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: supportCookie },
        body: '{}'
      });
      answers.push({ route, status: response.status });
    }

    expect(answers.filter((answer) => answer.status !== 403)).toEqual([]);
  });
});
