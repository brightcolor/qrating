// What the pages of an event show, worked out from the answers of the server: the state of the
// round, the numbers on top, the stars, the hours, the way from the scan to the form, and the
// voices of the guests. Everything here is plain data, so it can be tested without a browser.

const defaultZone = 'Europe/Berlin';

function parts(date, zone, options) {
  const out = {};
  for (const part of new Intl.DateTimeFormat('de-DE', { timeZone: zone || defaultZone, ...options }).formatToParts(date)) {
    out[part.type] = part.value;
  }
  return out;
}

const weekday = (date, zone) => parts(date, zone, { weekday: 'short' }).weekday.replace('.', '');

// "Di 22.09."
export function formatDay(value, zone) {
  if (!value) return '';
  const date = new Date(value);
  const p = parts(date, zone, { day: '2-digit', month: '2-digit' });
  return `${weekday(date, zone)} ${p.day}.${p.month}.`;
}

// "22:00"
export function formatTime(value, zone) {
  if (!value) return '';
  const p = parts(new Date(value), zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

// "Di 22.09., 22:00"
export function formatDayTime(value, zone) {
  if (!value) return '';
  return `${formatDay(value, zone)}, ${formatTime(value, zone)}`;
}

// "So 00:41"
export function formatWhen(value, zone) {
  if (!value) return '';
  return `${weekday(new Date(value), zone)} ${formatTime(value, zone)}`;
}

// "Sa 19.09.2026, 21:00"
export function formatDateLine(value, zone) {
  if (!value) return '';
  const date = new Date(value);
  const p = parts(date, zone, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekday(date, zone)} ${p.day}.${p.month}.${p.year}, ${formatTime(date, zone)}`;
}

// "Samstag, 19.09.2026, 21:00"
export function formatLongDate(value, zone) {
  if (!value) return '';
  const date = new Date(value);
  const p = parts(date, zone, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.weekday}, ${p.day}.${p.month}.${p.year}, ${formatTime(date, zone)}`;
}

// "19" and "Sep" for a date block.
export function dateBlock(value, zone) {
  if (!value) return { day: '', month: '' };
  const p = parts(new Date(value), zone, { day: 'numeric', month: 'short' });
  return { day: p.day, month: p.month.replace('.', '') };
}

// "noch 1 Tag", "noch 5 Stunden", "noch 20 Minuten"
export function durationLeft(ms, prefix = 'noch') {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes >= 48 * 60) return `${prefix} ${Math.floor(minutes / 1440)} Tage`;
  if (minutes >= 24 * 60) return `${prefix} 1 Tag`;
  if (minutes >= 120) return `${prefix} ${Math.floor(minutes / 60)} Stunden`;
  if (minutes >= 60) return `${prefix} 1 Stunde`;
  return `${prefix} ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
}

// "vor 4 Min.", "vor 2 Std.", "vor 3 Tagen"
export function relativeTime(value, now = new Date()) {
  const minutes = Math.round((now - new Date(value)) / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}

const statusWords = { draft: 'Entwurf', closed: 'Beendet', archived: 'Archiviert' };

// Where the round of an event stands: before, open, over, or switched off.
export function roundInfo(event, now = new Date()) {
  const zone = event?.event_timezone || defaultZone;
  const start = event?.feedbackWindow?.feedbackStart ? new Date(event.feedbackWindow.feedbackStart) : null;
  const end = event?.feedbackWindow?.feedbackEnd ? new Date(event.feedbackWindow.feedbackEnd) : null;
  if (!event) return { state: 'unknown', label: '', short: '', left: '', start, end };
  if (event.status && event.status !== 'active') {
    const word = statusWords[event.status] || event.status;
    return { state: 'off', label: `${word}, nimmt kein Feedback an`, short: word, left: '', start, end };
  }
  if (event.feedback_enabled === false) {
    return { state: 'off', label: 'Feedback ist ausgeschaltet', short: 'Feedback aus', left: '', start, end };
  }
  if (start && now < start) {
    return { state: 'before', label: `Runde startet ${formatDayTime(start, zone)}`, short: `startet ${formatWhen(start, zone)}`, left: durationLeft(start - now, 'in'), start, end };
  }
  if (end && now > end) {
    return { state: 'after', label: `Runde beendet seit ${formatDayTime(end, zone)}`, short: 'Runde beendet', left: '', start, end };
  }
  if (start && end) {
    return { state: 'open', label: `Runde offen bis ${formatDayTime(end, zone)}`, short: `Runde offen bis ${formatWhen(end, zone)}`, left: durationLeft(end - now), start, end };
  }
  return { state: 'unknown', label: 'Keine Bewertungszeit festgelegt', short: 'ohne Zeitraum', left: '', start, end };
}

// The kind of an event in a list: running, coming, over.
export function eventPhase(event, now = new Date()) {
  const round = roundInfo(event, now);
  if (round.state === 'open') return 'live';
  if (round.state === 'before') return 'soon';
  return 'past';
}

// The event the admin area opens when nothing else is named: the running round, else the
// next one to come, else the most recent one.
export function pickCurrentEvent(events = [], now = new Date()) {
  const running = events.filter((event) => roundInfo(event, now).state === 'open')
    .sort((a, b) => new Date(a.date_from) - new Date(b.date_from));
  if (running.length) return running[0];
  const coming = events.filter((event) => roundInfo(event, now).state === 'before')
    .sort((a, b) => new Date(a.date_from) - new Date(b.date_from));
  if (coming.length) return coming[0];
  return [...events].sort((a, b) => new Date(b.date_from) - new Date(a.date_from))[0] || null;
}

export function formatAverage(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '–';
  return Number(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// The numbers on top of an evaluation.
export function kpis(analytics) {
  const summary = analytics?.summary || {};
  const funnel = analytics?.funnel || {};
  const cases = analytics?.cases || {};
  return {
    votes: Number(summary.total) || 0,
    onlyStars: Number(summary.only_stars) || 0,
    average: formatAverage(summary.average_rating),
    averageValue: Number(summary.average_rating) || 0,
    opened: Number(funnel.sessions) || 0,
    sent: Number(funnel.completed) || 0,
    completion: Number(funnel.completionRate) || 0,
    scans: Number(funnel.scanned) || 0,
    scansBefore: Number(funnel.scansBefore) || 0,
    scansAfter: Number(funnel.scansAfter) || 0,
    newsletter: Number(summary.newsletter_optins) || 0,
    openCases: Number(cases.open) || 0,
    openWithPhone: Number(cases.open_with_phone) || 0
  };
}

// Five rows, five stars first, with the share of the largest row for the bar.
export function distributionRows(distribution = []) {
  const counts = new Map(distribution.map((row) => [Number(row.rating), Number(row.count) || 0]));
  const rows = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) || 0 }));
  const max = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({ ...row, share: row.count / max }));
}

// Votes per hour from the first vote on, a fixed number of columns, the rest summed up.
export function hourColumns(timeline = [], { columns = 8, zone } = {}) {
  const rows = timeline
    .map((row) => ({ at: new Date(row.bucket).getTime(), count: Number(row.count) || 0 }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  if (!rows.length) return [];
  const hour = 3_600_000;
  const first = rows[0].at;
  const out = Array.from({ length: columns }, (_, index) => ({
    label: String(Number(formatTime(first + index * hour, zone).slice(0, 2))),
    count: 0,
    later: false
  }));
  let later = 0;
  for (const row of rows) {
    const index = Math.round((row.at - first) / hour);
    if (index < columns) out[index].count += row.count;
    else later += row.count;
  }
  // Trailing empty hours say nothing; a round that ended early keeps only its own hours.
  while (out.length > 1 && out[out.length - 1].count === 0 && !later) out.pop();
  if (later) out.push({ label: 'später', count: later, later: true });
  const max = Math.max(1, ...out.map((column) => column.count));
  return out.map((column) => ({ ...column, share: column.count / max }));
}

// Steps whose name the page gives itself; the steps of questions carry the question.
const stepNames = {
  scan: 'QR-Code gescannt',
  rating: 'Bewertung geöffnet',
  contact: 'Rückruf angeboten',
  newsletter: 'Newsletter',
  summary: 'Zusammenfassung',
  submitted: 'Abgeschickt'
};

// The way from the scan to the sent form, each step with its share of the start.
export function funnelSteps(funnel) {
  if (!funnel?.steps?.length) return { basis: 0, steps: [] };
  const basis = Number(funnel.scansCounted ? funnel.scanned : funnel.sessions) || 0;
  const toStep = (kind, label, count, dropped = 0) => ({
    label,
    kind,
    count,
    share: basis ? count / basis : 0,
    percent: basis ? Math.round((count / basis) * 100) : 0,
    dropped
  });
  const steps = funnel.steps.map((step) => toStep(step.kind, stepNames[step.kind] || step.label || step.step || 'Schritt', Number(step.reached) || 0, Number(step.dropped) || 0));
  // The server counts who reached each step; the sent forms close the way.
  steps.push(toStep('submitted', stepNames.submitted, Number(funnel.completed) || 0));
  return { basis, steps };
}

const choiceTypes = ['multiple_choice', 'single_choice', 'select', 'yes_no', 'checkboxes', 'rating', 'nps', 'scale'];

function answerValues(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
  }
  if (Array.isArray(parsed)) return parsed.map(String);
  if (parsed === true) return ['Ja'];
  if (parsed === false) return ['Nein'];
  if (parsed === null || parsed === undefined || parsed === '') return [];
  return [String(parsed)];
}

// The answers to the choice questions of the form, one block per question, most chosen first.
export function choiceQuestions(questionStats = []) {
  const byQuestion = new Map();
  for (const row of questionStats) {
    if (!choiceTypes.includes(row.question_type)) continue;
    if (!byQuestion.has(row.id)) byQuestion.set(row.id, { id: row.id, label: row.label, type: row.question_type, counts: new Map() });
    const question = byQuestion.get(row.id);
    for (const value of answerValues(row.answer_value)) {
      question.counts.set(value, (question.counts.get(value) || 0) + (Number(row.count) || 0));
    }
  }
  return [...byQuestion.values()].map((question) => {
    const answers = [...question.counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    const total = answers.reduce((sum, answer) => sum + answer.count, 0);
    return { id: question.id, label: question.label, type: question.type, total, answers };
  }).filter((question) => question.total > 0);
}

// Texts the guests wrote to open questions, grouped by question, newest first.
export function textAnswers(voices = []) {
  const byLabel = new Map();
  for (const voice of voices) {
    for (const text of voice.texts || []) {
      if (!byLabel.has(text.label)) byLabel.set(text.label, []);
      byLabel.get(text.label).push({ id: voice.id, rating: voice.rating, value: text.value, submittedAt: voice.submittedAt });
    }
  }
  return [...byLabel.entries()].map(([label, answers]) => ({ label, answers }));
}

const placeNames = { dynamic: 'QR-Code', dynamic_organization: 'QR-Code', event_specific: 'Eventlink', preview: 'Vorschau' };

// One voice as a list shows it.
export function voiceView(voice, zone) {
  const first = voice.texts?.[0] || null;
  return {
    ...voice,
    when: formatWhen(voice.submittedAt, zone),
    place: voice.source || placeNames[voice.sourceType] || 'Direkt',
    kind: first ? first.label : 'nur Sterne',
    text: first ? first.value : null,
    more: (voice.texts || []).slice(1)
  };
}

export const voiceFilters = [
  { id: 'all', label: 'Alle' },
  { id: 'text', label: 'Mit Text' },
  { id: 'low', label: '1–2 Sterne' },
  { id: 'callback', label: 'Rückruf' },
  { id: 'stars', label: 'Nur Sterne' }
];

const filterTests = {
  all: () => true,
  text: (voice) => (voice.texts || []).length > 0,
  low: (voice) => Number(voice.rating) <= 2,
  callback: (voice) => Boolean(voice.caseOpen),
  stars: (voice) => !voice.completed
};

export function filterVoices(voices = [], filter = 'all') {
  return voices.filter(filterTests[filter] || filterTests.all);
}

export function voiceCounts(voices = []) {
  return Object.fromEntries(voiceFilters.map((filter) => [filter.id, filterVoices(voices, filter.id).length]));
}

// Open calls first, then the newest.
export function callbacksFirst(voices = []) {
  return [...voices].sort((a, b) => Number(Boolean(b.caseOpen)) - Number(Boolean(a.caseOpen)));
}

// What happened lately: votes of the last hour and the three newest with their age.
export function recentActivity(voices = [], now = new Date()) {
  const hourAgo = now - 3_600_000;
  return {
    lastHour: voices.filter((voice) => new Date(voice.submittedAt) >= hourAgo).length,
    latest: voices.slice(0, 3).map((voice) => ({ id: voice.id, rating: voice.rating, ago: relativeTime(voice.submittedAt, now) }))
  };
}

// The round drawn along a line: some hours before its start, the round itself, and after
// its end; with the votes per hour as bars and a mark for now.
export function timelineModel(event, timeline = [], now = new Date()) {
  const round = roundInfo(event, now);
  if (!round.start || !round.end) return null;
  const hour = 3_600_000;
  const zone = event.event_timezone || defaultZone;
  const eventStart = event.date_from ? new Date(event.date_from) : round.start;
  const from = Math.floor((Math.min(round.start, eventStart) - 6 * hour) / hour) * hour;
  const until = Math.ceil((round.end.getTime() + 4 * hour) / hour) * hour;
  const span = until - from;
  const at = (value) => Math.max(0, Math.min(100, ((new Date(value).getTime() - from) / span) * 100));
  const rows = timeline.map((row) => ({ at: new Date(row.bucket).getTime(), count: Number(row.count) || 0 })).filter((row) => row.at >= from && row.at <= until);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const days = [];
  const first = parts(new Date(from), zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let midnight = from + ((24 - Number(first.hour)) % 24) * hour - Number(first.minute) * 60000;
  if (midnight <= from) midnight += 24 * hour;
  for (; midnight < until; midnight += 24 * hour) {
    days.push({ left: at(midnight), label: weekday(new Date(midnight + hour), zone) });
  }
  return {
    bars: rows.map((row) => ({ left: at(row.at), height: row.count / max, count: row.count })),
    round: { left: at(round.start), width: at(round.end) - at(round.start) },
    eventStart: at(eventStart),
    now: now >= from && now <= until ? at(now) : null,
    nowLabel: `Jetzt, ${formatWhen(now, zone)}`,
    days,
    startLabel: formatWhen(from, zone),
    endLabel: formatWhen(round.end, zone),
    endLeft: at(round.end)
  };
}
