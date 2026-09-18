// Guest feedback flow: one step per question, then a summary. Everything here is plain logic without React.

export const textTypes = new Set(['text_short', 'text_long']);
// Tapping an answer of these types moves on to the next step.
export const choiceTypes = new Set(['rating', 'nps', 'yes_no', 'multiple_choice']);
const knownTypes = new Set([...textTypes, ...choiceTypes, 'checkboxes']);

// Tag questions carry an optional sentence, stored in the comment fields of the response.
const tagDetailFields = { positive_tags: 'commentPositive', improvement_tags: 'commentImprovement' };

// Yes/no answers keep these stored values in every language, so the statistics stay together.
export const yesValue = 'Ja';
export const noValue = 'Nein';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+()\-\s/]*$/;

export function questionType(question) {
  return knownTypes.has(question?.question_type) ? question.question_type : 'text_long';
}

export function questionOptions(question) {
  return Array.isArray(question?.options) ? question.options.filter((option) => typeof option === 'string' && option.trim()) : [];
}

export function detailFieldFor(question) {
  return questionType(question) === 'checkboxes' ? tagDetailFields[question.internal_name] || null : null;
}

export function isLowRating(rating) {
  return rating >= 1 && rating <= 2;
}

export function buildSteps(questions = [], rating = 0) {
  const steps = [{ id: 'rating', kind: 'rating' }];
  if (isLowRating(rating)) steps.push({ id: 'contact', kind: 'contact' });
  const detailFields = new Set();
  let openQuestion = false;
  for (const question of questions) {
    const detailField = detailFieldFor(question);
    if (detailField) detailFields.add(detailField);
    if (textTypes.has(questionType(question))) openQuestion = true;
    steps.push({ id: `question:${question.id ?? question.internal_name}`, kind: 'question', question, detailField });
  }
  // Forms without an open question of their own still ask what was good and what should improve.
  if (!openQuestion) {
    if (!detailFields.has('commentPositive')) steps.push({ id: 'comment:positive', kind: 'comment', field: 'commentPositive' });
    if (!detailFields.has('commentImprovement')) steps.push({ id: 'comment:improvement', kind: 'comment', field: 'commentImprovement' });
  }
  steps.push({ id: 'newsletter', kind: 'newsletter' });
  steps.push({ id: 'summary', kind: 'summary' });
  return steps;
}

export function emptyAnswers() {
  return {
    rating: 0,
    answers: {},
    commentPositive: '',
    commentImprovement: '',
    contactPhone: '',
    contactNote: '',
    newsletter: null,
    newsletterEmail: ''
  };
}

export function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '';
}

export function isRequired(step) {
  return step.kind === 'rating' || (step.kind === 'question' && Boolean(step.question.required));
}

export function isAnswered(step, state) {
  switch (step.kind) {
    case 'rating':
      return state.rating > 0;
    case 'contact':
      return hasValue(state.contactPhone) || hasValue(state.contactNote);
    case 'question':
      return hasValue(state.answers[step.question.internal_name]) || Boolean(step.detailField && hasValue(state[step.detailField]));
    case 'comment':
      return hasValue(state[step.field]);
    case 'newsletter':
      return state.newsletter !== null;
    default:
      return false;
  }
}

// Returns the text key that explains why the guest cannot leave this step yet.
export function stepProblem(step, state) {
  if (isRequired(step) && !isAnswered(step, state)) return 'required_hint';
  if (step.kind === 'contact' && !phonePattern.test(state.contactPhone)) return 'phone_invalid';
  if (step.kind === 'newsletter' && state.newsletter === true && !emailPattern.test(state.newsletterEmail.trim())) {
    return 'email_invalid';
  }
  return null;
}

export function firstProblem(steps, state) {
  for (const step of steps) {
    if (step.kind === 'summary') continue;
    const problem = stepProblem(step, state);
    if (problem) return { step, problem };
  }
  return null;
}

// The step after this one. Changes made from the summary lead back to it, via the callback step for low ratings.
export function nextStepId(steps, currentId, { editing = false, rating = 0 } = {}) {
  if (editing) {
    if (currentId === 'rating' && isLowRating(rating)) return 'contact';
    return 'summary';
  }
  const index = steps.findIndex((step) => step.id === currentId);
  return steps[Math.min(index + 1, steps.length - 1)]?.id ?? 'summary';
}

export function fillText(template, values = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

export function answerText(question, value, texts) {
  if (!hasValue(value)) return '';
  switch (questionType(question)) {
    case 'checkboxes':
      return (Array.isArray(value) ? value : [value]).join(', ');
    case 'yes_no':
      if (value === yesValue) return texts.yes_label;
      if (value === noValue) return texts.no_label;
      return String(value);
    case 'nps':
      return fillText(texts.nps_value, { wert: value });
    case 'rating':
      return fillText(texts.stars_value, { wert: value });
    default:
      return String(value);
  }
}

export function buildPayload(state, { questions = [], sourceType, startedAt, honeypot = '', language = 'de' }) {
  const answers = {};
  for (const question of questions) {
    const value = state.answers[question.internal_name];
    if (hasValue(value)) answers[question.internal_name] = value;
  }
  const npsQuestion = questions.find((question) => questionType(question) === 'nps' && hasValue(state.answers[question.internal_name]));
  const lowRating = isLowRating(state.rating);
  const contactPhone = lowRating ? state.contactPhone.trim() : '';
  const newsletterOptin = state.newsletter === true;
  return {
    rating: state.rating,
    npsScore: npsQuestion ? Number(state.answers[npsQuestion.internal_name]) : null,
    commentPositive: state.commentPositive.trim(),
    commentImprovement: state.commentImprovement.trim(),
    generalComment: '',
    newsletterOptin,
    newsletterEmail: newsletterOptin ? state.newsletterEmail.trim() : '',
    contactRequested: Boolean(contactPhone),
    contactPhone,
    contactNote: lowRating ? state.contactNote.trim() : '',
    testimonialAllowed: false,
    language,
    sourceType,
    honeypot,
    startedAt,
    answers
  };
}

export function formatDateTime(value, locale = 'de-DE') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatDay(value, locale = 'de-DE') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

// Answers survive a reload in the same tab. Contact details and the email address stay out of storage,
// because a device at the exit may serve many guests.
const draftPrefix = 'qrating:feedback:';
const draftMaxAge = 2 * 60 * 60 * 1000;

export function loadDraft(token, now = Date.now()) {
  try {
    const raw = globalThis.sessionStorage?.getItem(draftPrefix + token);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || now - Number(draft.savedAt) > draftMaxAge) return null;
    const saved = draft.state && typeof draft.state === 'object' ? draft.state : {};
    const rating = Number(saved.rating);
    return {
      stepId: typeof draft.stepId === 'string' ? draft.stepId : 'rating',
      startedAt: typeof draft.startedAt === 'string' ? draft.startedAt : null,
      state: {
        ...emptyAnswers(),
        rating: Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0,
        answers: saved.answers && typeof saved.answers === 'object' && !Array.isArray(saved.answers) ? saved.answers : {},
        commentPositive: typeof saved.commentPositive === 'string' ? saved.commentPositive : '',
        commentImprovement: typeof saved.commentImprovement === 'string' ? saved.commentImprovement : '',
        newsletter: typeof saved.newsletter === 'boolean' ? saved.newsletter : null
      }
    };
  } catch {
    return null;
  }
}

export function saveDraft(token, { state, stepId, startedAt }, now = Date.now()) {
  try {
    const { rating, answers, commentPositive, commentImprovement, newsletter } = state;
    globalThis.sessionStorage?.setItem(draftPrefix + token, JSON.stringify({
      savedAt: now,
      stepId,
      startedAt,
      state: { rating, answers, commentPositive, commentImprovement, newsletter }
    }));
  } catch {
    // Private windows may refuse storage; the flow works without it.
  }
}

export function clearDraft(token) {
  try {
    globalThis.sessionStorage?.removeItem(draftPrefix + token);
  } catch {
    // See saveDraft.
  }
}
