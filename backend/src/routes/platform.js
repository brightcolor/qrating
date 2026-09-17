import express from 'express';
import { query } from '../db/pool.js';
import { requireAdmin, requirePlatformAdmin, signAdmin } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { slugify } from '../utils/crypto.js';
import { setAdminCookie } from '../utils/security.js';
import { writeAudit } from '../services/auditService.js';

// Everything above the organizations: who exists, who is created, and which one this session works in.
export const platformRouter = express.Router();
platformRouter.use(requireAdmin, requirePlatformAdmin({ query }));

async function loadUser(userId) {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

function publicOrganizationRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.billing_override_plan || row.billing_plan,
    planSource: row.billing_override_plan ? 'override' : 'plan',
    events: Number(row.event_count),
    feedbacks: Number(row.feedback_count),
    users: Number(row.user_count),
    pretixConnections: Number(row.pretix_count),
    createdAt: row.created_at
  };
}

platformRouter.get('/organizations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT o.*,
              (SELECT count(*) FROM events e WHERE e.organization_id = o.id AND e.status <> 'archived')::int AS event_count,
              (SELECT count(*) FROM feedback_responses f WHERE f.organization_id = o.id)::int AS feedback_count,
              (SELECT count(*) FROM users u WHERE u.organization_id = o.id)::int AS user_count,
              (SELECT count(*) FROM pretix_connections pc WHERE pc.organization_id = o.id)::int AS pretix_count
       FROM organizations o
       ORDER BY o.name`
    );
    res.json({
      organizations: result.rows.map(publicOrganizationRow),
      currentOrganizationId: req.admin.organizationId,
      homeOrganizationId: req.admin.homeOrganizationId || req.admin.organizationId,
      acting: Boolean(req.admin.acting)
    });
  } catch (error) {
    next(error);
  }
});

platformRouter.post('/organizations', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) throw httpError(400, 'Bitte gib einen Namen für den Mandanten ein.');
    const slug = slugify(req.body.slug || name);
    if (!slug) throw httpError(400, 'Aus dem Namen ließ sich kein Slug bilden. Trage einen eigenen Slug aus Buchstaben und Ziffern ein.');
    const taken = await query('SELECT 1 FROM organizations WHERE slug = $1', [slug]);
    if (taken.rows.length) throw httpError(409, `Den Slug „${slug}“ nutzt bereits ein anderer Mandant. Wähle einen anderen.`);

    const created = (await query(
      `INSERT INTO organizations (name, slug, primary_color, privacy_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name,
        slug,
        req.body.primaryColor || '#2563eb',
        'Feedback ist anonym möglich. E-Mail-Adressen werden nur für den gewählten Zweck gespeichert.'
      ]
    )).rows[0];

    await writeAudit({ query }, {
      organizationId: created.id,
      userId: req.admin.sub,
      action: 'platform.organization.created',
      entityType: 'organization',
      entityId: created.id,
      metadata: { name: created.name, slug: created.slug }
    });

    res.status(201).json(publicOrganizationRow({
      ...created,
      event_count: 0,
      feedback_count: 0,
      user_count: 0,
      pretix_count: 0
    }));
  } catch (error) {
    next(error);
  }
});

platformRouter.post('/organizations/:id/enter', async (req, res, next) => {
  try {
    const organization = (await query('SELECT id, name, slug FROM organizations WHERE id = $1', [req.params.id])).rows[0];
    if (!organization) throw httpError(404, 'Diesen Mandanten gibt es nicht mehr. Lade die Liste neu.');
    const user = await loadUser(req.admin.sub);
    if (!user) throw httpError(401, 'Dein Konto gibt es nicht mehr. Bitte melde dich erneut an.');

    const home = user.organization_id;
    const acting = organization.id !== home;
    // Inside another tenant the platform role works with full rights; at home the own role counts.
    setAdminCookie(res, signAdmin(user, {
      organizationId: organization.id,
      role: acting ? 'owner' : user.role,
      acting
    }));

    if (acting) {
      await writeAudit({ query }, {
        organizationId: organization.id,
        userId: user.id,
        action: 'platform.organization.entered',
        entityType: 'organization',
        entityId: organization.id,
        metadata: { name: organization.name, slug: organization.slug, from: home }
      });
    }

    res.json({ organization, acting });
  } catch (error) {
    next(error);
  }
});

platformRouter.post('/leave', async (req, res, next) => {
  try {
    const user = await loadUser(req.admin.sub);
    if (!user) throw httpError(401, 'Dein Konto gibt es nicht mehr. Bitte melde dich erneut an.');
    const left = req.admin.organizationId;
    setAdminCookie(res, signAdmin(user));
    if (req.admin.acting && left !== user.organization_id) {
      await writeAudit({ query }, {
        organizationId: left,
        userId: user.id,
        action: 'platform.organization.left',
        entityType: 'organization',
        entityId: left,
        metadata: { back_to: user.organization_id }
      });
    }
    const home = (await query('SELECT id, name, slug FROM organizations WHERE id = $1', [user.organization_id])).rows[0];
    res.json({ organization: home, acting: false });
  } catch (error) {
    next(error);
  }
});
