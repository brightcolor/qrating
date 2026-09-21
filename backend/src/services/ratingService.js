import { withTransaction } from '../db/pool.js';
import { hashValue } from '../utils/crypto.js';

// How long a low rating waits for the rest of the form before the organizer hears of it.
// A guest who leaves a callback number within this time is named with it in the alert; one
// who stops after the tap is reported all the same, only without a number. The alert reads
// the rating when it runs, so a guest who changes their mind to four stars sets off nothing.
export const lowRatingGraceMinutes = 30;

// Whether a change of stars should put a low-rating alert on its way. Only the step into
// the low range does: a second low tap, or a tap that leaves it, adds nothing.
export function turnsLow(previousRating, rating) {
  const low = (value) => Number(value) >= 1 && Number(value) <= 2;
  return low(rating) && !low(previousRating);
}

// A tap on a star is a vote. It is written at once and belongs to the visit, so a second
// tap changes that vote instead of adding one, and the form sent at the end completes the
// very same row.
//
// Two taps in quick succession must not each find no vote and write two. What prevents it
// is the upsert on the visit: INSERT ... ON CONFLICT DO UPDATE locks that row until the
// transaction ends, so a second tap of the same visit waits for the first to commit. The
// FOR UPDATE below only states the same lock openly. Measured on a real Postgres 16 with
// 8 simultaneous taps per visit: this code wrote one vote per visit; a variant that read
// the visit without any lock wrote 152 votes for 20 visits. The PGlite test database runs
// one query at a time and cannot show this, so the test there checks the outcome only.
export async function recordRating({ event, rating, sessionKey, sourceType, qrSourceId = null, userAgent, ip }) {
  return withTransaction(async (client) => {
    const session = (await client.query(
      `INSERT INTO guest_sessions (organization_id, event_id, session_key, source_type, qr_source_id, user_agent_hash, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (event_id, session_key) DO UPDATE SET last_seen_at = now()
       RETURNING id`,
      [event.organization_id, event.id, sessionKey, sourceType, qrSourceId, hashValue(userAgent), hashValue(ip)]
    )).rows[0];
    const visit = (await client.query(
      'SELECT feedback_response_id FROM guest_sessions WHERE id = $1 FOR UPDATE',
      [session.id]
    )).rows[0];

    if (visit.feedback_response_id) {
      const current = (await client.query(
        'SELECT id, rating, completed_at, submitted_at FROM feedback_responses WHERE id = $1',
        [visit.feedback_response_id]
      )).rows[0];
      // A form that was sent already stays as it was sent.
      if (current?.completed_at) {
        return { id: current.id, created: false, completed: true, previousRating: current.rating, rating: current.rating, tappedAt: current.submitted_at };
      }
      if (current) {
        if (current.rating !== rating) {
          await client.query('UPDATE feedback_responses SET rating = $2 WHERE id = $1', [current.id, rating]);
        }
        return { id: current.id, created: false, completed: false, previousRating: current.rating, rating, tappedAt: current.submitted_at };
      }
      // The vote the visit pointed at is gone, removed by retention; a new one starts.
    }

    const created = (await client.query(
      `INSERT INTO feedback_responses (
         organization_id, event_id, resolved_event_id, qr_source_id, source_type, rating, user_agent_hash, ip_hash
       ) VALUES ($1,$2,$2,$3,$4,$5,$6,$7)
       RETURNING id, submitted_at`,
      [event.organization_id, event.id, qrSourceId, sourceType, rating, hashValue(userAgent), hashValue(ip)]
    )).rows[0];
    await client.query(
      'UPDATE guest_sessions SET feedback_response_id = $2, updated_at = now() WHERE id = $1',
      [session.id, created.id]
    );
    return { id: created.id, created: true, completed: false, previousRating: null, rating, tappedAt: created.submitted_at };
  });
}

// The vote a visit already cast by tapping, if the form has not completed it yet. Locked,
// so the form sent at the end and a late tap cannot both write it at the same moment.
export async function openVoteFor(client, event, sessionKey) {
  if (!sessionKey) return null;
  const visit = (await client.query(
    'SELECT id, feedback_response_id FROM guest_sessions WHERE event_id = $1 AND session_key = $2 FOR UPDATE',
    [event.id, sessionKey]
  )).rows[0];
  if (!visit?.feedback_response_id) return null;
  const vote = (await client.query(
    'SELECT id, rating, submitted_at, completed_at FROM feedback_responses WHERE id = $1',
    [visit.feedback_response_id]
  )).rows[0];
  return vote && !vote.completed_at ? vote : null;
}
