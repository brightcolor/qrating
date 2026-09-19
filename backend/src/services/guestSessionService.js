// Every visit of a guest page is one session. It keeps the step the guest got to,
// so the admin area can show where people stop.
import { hashValue } from '../utils/crypto.js';

// The furthest step wins: going back in the flow does not shorten the path.
export async function recordProgress(db, { event, qrSource, progress, userAgent, ip }) {
  const result = await db.query(
    `INSERT INTO guest_sessions (
       organization_id, event_id, session_key, source_type, qr_source_id, steps_total,
       last_step, last_step_kind, last_step_label, last_step_index, user_agent_hash, ip_hash
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (event_id, session_key) DO UPDATE SET
       steps_total = GREATEST(guest_sessions.steps_total, EXCLUDED.steps_total),
       last_step = CASE WHEN EXCLUDED.last_step_index >= guest_sessions.last_step_index
                        THEN EXCLUDED.last_step ELSE guest_sessions.last_step END,
       last_step_kind = CASE WHEN EXCLUDED.last_step_index >= guest_sessions.last_step_index
                             THEN EXCLUDED.last_step_kind ELSE guest_sessions.last_step_kind END,
       last_step_label = CASE WHEN EXCLUDED.last_step_index >= guest_sessions.last_step_index
                              THEN EXCLUDED.last_step_label ELSE guest_sessions.last_step_label END,
       last_step_index = GREATEST(guest_sessions.last_step_index, EXCLUDED.last_step_index),
       source_type = COALESCE(guest_sessions.source_type, EXCLUDED.source_type),
       qr_source_id = COALESCE(guest_sessions.qr_source_id, EXCLUDED.qr_source_id),
       last_seen_at = now(),
       updated_at = now()
     RETURNING id, last_step_index, steps_total`,
    [
      event.organization_id,
      event.id,
      progress.sessionKey,
      progress.sourceType || null,
      qrSource?.id || null,
      Number(progress.stepsTotal) || 0,
      progress.step,
      progress.stepKind || null,
      progress.stepLabel ? String(progress.stepLabel).slice(0, 160) : null,
      Number(progress.stepIndex) || 0,
      hashValue(userAgent),
      hashValue(ip)
    ]
  );
  return result.rows[0];
}

// The feedback itself closes the session, even when no step was reported before.
export async function markCompleted(db, { event, sessionKey, feedbackId, stepsTotal = 0 }) {
  if (!sessionKey) return null;
  const result = await db.query(
    `INSERT INTO guest_sessions (
       organization_id, event_id, session_key, steps_total, last_step, last_step_kind, last_step_label,
       last_step_index, completed_at, feedback_response_id
     )
     VALUES ($1,$2,$3,$4,'submitted','submitted','Abgeschickt',$5, now(), $6)
     ON CONFLICT (event_id, session_key) DO UPDATE SET
       completed_at = COALESCE(guest_sessions.completed_at, now()),
       feedback_response_id = COALESCE(guest_sessions.feedback_response_id, EXCLUDED.feedback_response_id),
       steps_total = GREATEST(guest_sessions.steps_total, EXCLUDED.steps_total),
       last_step = 'submitted',
       last_step_kind = 'submitted',
       last_step_label = 'Abgeschickt',
       last_step_index = GREATEST(guest_sessions.last_step_index, EXCLUDED.last_step_index),
       last_seen_at = now(),
       updated_at = now()
     RETURNING id`,
    [
      event.organization_id,
      event.id,
      sessionKey,
      Number(stepsTotal) || 0,
      Math.max(Number(stepsTotal) || 0, 1),
      feedbackId
    ]
  );
  return result.rows[0];
}

// One row per step of the flow: how many got there, how many stopped there.
export function buildFunnel(rows = []) {
  const steps = [...rows]
    .map((row) => ({
      position: Number(row.position) || 0,
      step: row.step || 'unbekannt',
      kind: row.kind || null,
      label: row.label || null,
      stopped: Number(row.stopped) || 0,
      completed: Number(row.completed) || 0
    }))
    .sort((a, b) => a.position - b.position);

  const sessions = steps.reduce((total, step) => total + step.stopped, 0);
  const completed = steps.reduce((total, step) => total + step.completed, 0);
  let reached = sessions;
  const funnel = steps.map((step) => {
    const row = {
      position: step.position,
      step: step.step,
      kind: step.kind,
      label: step.label,
      reached,
      // Whoever ends here and did not send anything off has stopped.
      dropped: step.stopped - step.completed,
      completed: step.completed,
      share: sessions ? Math.round((reached / sessions) * 100) : 0
    };
    reached -= step.stopped;
    return row;
  });

  return {
    sessions,
    completed,
    dropped: sessions - completed,
    completionRate: sessions ? Math.round((completed / sessions) * 100) : 0,
    steps: funnel
  };
}

// The way from the scan to the sent form. Scans of the running round sit above the visits:
// whoever scanned and never saw the first question stopped before the flow even began.
// Scans before and after the round stand beside it, because those guests never had a form.
export function scanFunnel(funnel = {}, scans = {}) {
  const scanned = Number(scans.live) || 0;
  const sessions = Number(funnel.sessions) || 0;
  // Rounds that ran before the scans were counted show fewer scans than visits.
  // Their numbers would turn the top of the funnel into a lie, so it stays off.
  const scansCounted = scanned > 0 && scanned >= sessions;
  const base = {
    ...funnel,
    scanned,
    scansBefore: Number(scans.before) || 0,
    scansAfter: Number(scans.after) || 0,
    scansCounted
  };
  if (!scansCounted) return base;

  const opening = {
    position: -1,
    step: 'scan',
    kind: 'scan',
    label: null,
    reached: scanned,
    dropped: scanned - sessions,
    completed: 0,
    share: 100
  };
  return {
    ...base,
    // Every share now counts against the scans, so the steps keep one common base.
    steps: [opening, ...(funnel.steps || []).map((step) => ({
      ...step,
      share: Math.round((step.reached / scanned) * 100)
    }))]
  };
}
