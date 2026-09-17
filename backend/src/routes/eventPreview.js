import express from 'express';
import { query } from '../db/pool.js';
import { canAccessEvent, requireAdmin } from '../middleware/auth.js';
import { httpError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { createPreviewToken, previewValidityMs } from '../utils/previewLink.js';

// Hands out a link that opens the guest page of an event, even while no feedback round runs.
export const eventPreviewRouter = express.Router();
eventPreviewRouter.use(requireAdmin);

eventPreviewRouter.get('/events/:id/preview-link', async (req, res, next) => {
  try {
    const event = (await query(
      'SELECT id, name, event_feedback_token FROM events WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.admin.organizationId]
    )).rows[0];
    if (!event) throw httpError(404, 'Dieses Event gibt es nicht mehr oder es gehört zu einer anderen Organisation. Lade die Liste neu.');
    if (!(await canAccessEvent({ query }, req.admin, event.id))) {
      throw httpError(403, 'Du hast für dieses Event keine Berechtigung. Ein Event-Manager oder Admin kann dich dem Event zuweisen.');
    }

    const token = createPreviewToken(event.event_feedback_token);
    res.json({
      url: `${env.feedbackAppUrl}/e/${event.event_feedback_token}?preview=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + previewValidityMs).toISOString()
    });
  } catch (error) {
    next(error);
  }
});
