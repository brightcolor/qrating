// What guests said, one entry per vote, and the numbers an event list shows beside each event.
// Both feed the admin area: the evaluation of an event and the overview of all events.

// Names for the three free-text fields every vote can carry, next to the questions of the form.
const commentLabels = {
  comment_positive: 'Was gut war',
  comment_improvement: 'Was besser werden soll',
  general_comment: 'Kommentar'
};

// A case still waits for someone as long as nobody has reached the guest.
export const openCaseStatuses = ['open', 'contact_planned'];

function answerText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(String).join(', ').trim();
  return String(value).trim();
}

// The newest votes of an event with everything written along the way: the free-text fields
// and the answers to text questions of the form, in the order of the form. The QR source says
// where the guest scanned, the case says whether the organizer still owes a call.
export async function eventVoices(db, eventId, limit = 100) {
  const votes = (await db.query(
    `SELECT fr.id, fr.rating, fr.submitted_at, fr.completed_at, fr.source_type,
            fr.comment_positive, fr.comment_improvement, fr.general_comment, fr.testimonial_allowed,
            qs.label AS source_label,
            lrc.id AS case_id, lrc.status AS case_status,
            (lrc.contact_phone_encrypted IS NOT NULL) AS case_has_phone
     FROM feedback_responses fr
     LEFT JOIN qr_sources qs ON qs.id = fr.qr_source_id
     LEFT JOIN low_rating_cases lrc ON lrc.feedback_response_id = fr.id
     WHERE fr.event_id = $1
     ORDER BY fr.submitted_at DESC
     LIMIT $2`,
    [eventId, limit]
  )).rows;
  if (!votes.length) return [];
  const answers = (await db.query(
    `SELECT fa.feedback_response_id AS vote_id, q.label, q.sort_order, fa.answer_value
     FROM feedback_answers fa
     JOIN feedback_questions q ON q.id = fa.feedback_question_id
     WHERE fa.feedback_response_id = ANY($1::uuid[])
       AND q.question_type IN ('text_short', 'text_long')
     ORDER BY q.sort_order, q.label`,
    [votes.map((vote) => vote.id)]
  )).rows;
  const byVote = new Map();
  for (const row of answers) {
    const value = answerText(row.answer_value);
    if (!value) continue;
    if (!byVote.has(row.vote_id)) byVote.set(row.vote_id, []);
    byVote.get(row.vote_id).push({ label: row.label, value });
  }
  return votes.map((vote) => {
    const texts = [...(byVote.get(vote.id) || [])];
    for (const [field, label] of Object.entries(commentLabels)) {
      const value = answerText(vote[field]);
      if (value) texts.push({ label, value });
    }
    return {
      id: vote.id,
      rating: vote.rating,
      submittedAt: vote.submitted_at,
      completed: Boolean(vote.completed_at),
      source: vote.source_label || null,
      sourceType: vote.source_type,
      texts,
      // Only a guest who agreed to it may be quoted where others can read along.
      testimonialAllowed: Boolean(vote.testimonial_allowed),
      caseId: vote.case_id || null,
      caseStatus: vote.case_status || null,
      caseOpen: openCaseStatuses.includes(vote.case_status),
      caseHasPhone: Boolean(vote.case_has_phone)
    };
  });
}

// A small curve for a list: votes per hour from the first to the last one, squeezed into at
// most `points` values so that a long round and a short night draw the same width.
export function sparkBins(rows = [], points = 24) {
  const hours = rows
    .map((row) => ({ at: new Date(row.bucket).getTime(), count: Number(row.count) || 0 }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  if (!hours.length) return [];
  const hour = 3_600_000;
  const first = hours[0].at;
  const span = Math.round((hours[hours.length - 1].at - first) / hour) + 1;
  const series = new Array(span).fill(0);
  for (const row of hours) series[Math.round((row.at - first) / hour)] += row.count;
  if (series.length <= points) return series;
  const bins = new Array(points).fill(0);
  series.forEach((count, index) => {
    bins[Math.min(points - 1, Math.floor((index * points) / series.length))] += count;
  });
  return bins;
}

// The numbers an event list shows beside every event, for all given events at once.
export async function eventStats(db, eventIds = []) {
  if (!eventIds.length) return new Map();
  const [votes, cases, questions, sessions, scans, hours] = await Promise.all([
    db.query(
      `SELECT event_id, count(*)::int AS votes, round(avg(rating)::numeric, 1) AS average_rating,
              count(*) FILTER (WHERE completed_at IS NULL)::int AS only_stars
       FROM feedback_responses WHERE event_id = ANY($1::uuid[]) GROUP BY event_id`,
      [eventIds]
    ),
    db.query(
      `SELECT event_id,
              count(*) FILTER (WHERE status = ANY($2::text[]))::int AS open_cases
       FROM low_rating_cases WHERE event_id = ANY($1::uuid[]) GROUP BY event_id`,
      [eventIds, openCaseStatuses]
    ),
    db.query(
      `SELECT f.event_id, count(q.id) FILTER (WHERE q.active)::int AS question_count
       FROM feedback_forms f
       LEFT JOIN feedback_questions q ON q.feedback_form_id = f.id
       WHERE f.event_id = ANY($1::uuid[]) AND f.active
       GROUP BY f.event_id`,
      [eventIds]
    ),
    db.query(
      `SELECT event_id, count(*)::int AS sessions,
              count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
       FROM guest_sessions WHERE event_id = ANY($1::uuid[]) GROUP BY event_id`,
      [eventIds]
    ),
    db.query(
      `SELECT event_id, coalesce(sum(scans_count), 0)::int AS scans
       FROM qr_source_daily_stats WHERE event_id = ANY($1::uuid[]) GROUP BY event_id`,
      [eventIds]
    ),
    db.query(
      `SELECT event_id, date_trunc('hour', submitted_at) AS bucket, count(*)::int AS count
       FROM feedback_responses WHERE event_id = ANY($1::uuid[])
       GROUP BY event_id, bucket ORDER BY bucket`,
      [eventIds]
    )
  ]);
  const index = (result) => new Map(result.rows.map((row) => [row.event_id, row]));
  const [byVotes, byCases, byQuestions, bySessions, byScans] = [votes, cases, questions, sessions, scans].map(index);
  const hoursByEvent = new Map();
  for (const row of hours.rows) {
    if (!hoursByEvent.has(row.event_id)) hoursByEvent.set(row.event_id, []);
    hoursByEvent.get(row.event_id).push(row);
  }
  const stats = new Map();
  for (const id of eventIds) {
    const vote = byVotes.get(id) || {};
    const session = bySessions.get(id) || {};
    const opened = Number(session.sessions) || 0;
    const completed = Number(session.completed) || 0;
    stats.set(id, {
      votes: Number(vote.votes) || 0,
      averageRating: vote.average_rating === undefined || vote.average_rating === null ? null : Number(vote.average_rating),
      onlyStars: Number(vote.only_stars) || 0,
      openCases: Number(byCases.get(id)?.open_cases) || 0,
      questionCount: byQuestions.has(id) ? Number(byQuestions.get(id).question_count) || 0 : null,
      sessions: opened,
      completed,
      completionRate: opened ? Math.round((completed / opened) * 100) : null,
      scans: Number(byScans.get(id)?.scans) || 0,
      spark: sparkBins(hoursByEvent.get(id) || [])
    });
  }
  return stats;
}
