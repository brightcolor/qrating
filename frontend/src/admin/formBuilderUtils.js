import {
  Briefcase,
  Cake,
  CheckCircle2,
  Drama,
  GraduationCap,
  Hash,
  Heart,
  HeartHandshake,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Mic2,
  PartyPopper,
  Sparkles,
  Star,
  Tent,
  ToggleLeft,
  Users,
  Zap
} from 'lucide-react';

export const typeCards = [
  { value: 'text_short', label: 'Kurze Antwort', hint: 'Ein knapper Gedanke', icon: MessageSquare },
  { value: 'text_long', label: 'Lange Antwort', hint: 'Platz für Erlebnisse', icon: MessageSquare },
  { value: 'checkboxes', label: 'Mehrfachauswahl', hint: 'Stichworte und Gründe', icon: ListChecks },
  { value: 'multiple_choice', label: 'Einfachauswahl', hint: 'Klare Optionen', icon: CheckCircle2 },
  { value: 'yes_no', label: 'Ja oder Nein', hint: 'Schnelle Entscheidung', icon: ToggleLeft },
  { value: 'nps', label: 'Weiterempfehlung', hint: 'Skala von 0 bis 10', icon: Hash },
  { value: 'rating', label: 'Sterne', hint: 'Skala von 1 bis 5', icon: Star }
];

export const promptIdeas = [
  'Was war dein Lieblingsmoment?',
  'Was sollen wir genau so beibehalten?',
  'Was machen wir beim nächsten Event einfacher?',
  'Wie hat sich die Location für dich angefühlt?',
  'Was würdest du Freunden über das Event erzählen?',
  'Was sollen wir vor dem nächsten Event klären?'
];

export const profileIcons = {
  'quick-vibe': Zap,
  'club-party': PartyPopper,
  festival: Tent,
  concert: Mic2,
  'birthday-party': Cake,
  wedding: Heart,
  'company-party': Users,
  'city-festival': HeartHandshake,
  'conference-b2b': Briefcase,
  'workshop-seminar': GraduationCap,
  'culture-show': Drama,
  'emotional-night': Sparkles,
  'low-rating-recovery': LifeBuoy
};

const transliterations = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

// Internal keys stay ASCII; they appear in exports and webhooks.
export function makeKey(label) {
  return label
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => transliterations[char])
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'frage';
}

export function linesToOptions(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function optionsToLines(options) {
  return Array.isArray(options) ? options.join('\n') : '';
}

// Only these two types put a list in front of the guest; the others carry their own scale.
const withOptions = new Set(['multiple_choice', 'checkboxes']);

export function needsOptions(type) {
  return withOptions.has(type);
}

export function isKnownType(type) {
  return typeCards.some((card) => card.value === type);
}

// The guest page falls back to a long answer for a type it does not know, so that is
// what the label says as well.
export function typeLabel(type) {
  return typeCards.find((card) => card.value === type)?.label || 'Lange Antwort';
}

// A stored type the editor does not offer must never be swallowed by the list: the
// dropdown would quietly pick its first entry and the next save would rewrite the
// question. It gets an entry of its own instead, and the card says what is going on.
export function unknownTypeOption(type) {
  if (!type || isKnownType(type)) return null;
  return { value: type, label: `Unbekannte Antwortart „${type}"`, hint: 'Gäste sehen sie als lange Antwort' };
}

// What the collapsed card says about a question. It reads the stored question, never a
// draft, so a card can never claim something the server has not seen.
export function questionSummary(question = {}) {
  const unknown = unknownTypeOption(question.question_type);
  const parts = [unknown ? `${unknown.label} · zeigt sich als ${typeLabel(question.question_type)}` : typeLabel(question.question_type)];
  if (question.required) parts.push('Pflichtfrage');
  if (question.active === false) parts.push('ausgeblendet');
  const options = Array.isArray(question.options) ? question.options.length : 0;
  if (needsOptions(question.question_type)) parts.push(options === 1 ? '1 Antwort' : `${options} Antworten`);
  return parts.join(' · ');
}

// Moving one entry of a list to another place, without touching the rest of the order.
export function moveItem(list = [], from, to) {
  const items = [...list];
  if (from < 0 || from >= items.length) return items;
  const target = Math.min(Math.max(to, 0), items.length - 1);
  if (target === from) return items;
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved);
  return items;
}

export function moveById(list = [], id, direction) {
  const from = list.findIndex((item) => item.id === id);
  if (from === -1) return list;
  return moveItem(list, from, from + (direction === 'up' ? -1 : 1));
}

// What is wrong with the answers of a choice question, in the words of the person editing.
// An empty answer and a duplicate both break the guest page, so both have to be named.
export function optionProblems(options = []) {
  const problems = [];
  const trimmed = options.map((option) => String(option).trim());
  if (trimmed.some((option) => option === '')) problems.push('Eine Antwortmöglichkeit ist leer. Schreib etwas hinein oder entferne die Zeile.');
  const seen = new Set();
  const twice = new Set();
  for (const option of trimmed) {
    if (option === '') continue;
    if (seen.has(option.toLowerCase())) twice.add(option);
    seen.add(option.toLowerCase());
  }
  for (const option of twice) problems.push(`„${option}" steht zweimal in der Liste. Gäste können die beiden nicht auseinanderhalten.`);
  if (trimmed.filter(Boolean).length < 2) problems.push('Eine Auswahl braucht mindestens zwei Antwortmöglichkeiten.');
  return problems;
}

// What the editor sends for one question.
export function questionPayload(draft) {
  return {
    label: draft.label,
    internalName: draft.internalName || makeKey(draft.label || ''),
    questionType: draft.questionType,
    helpText: draft.helpText || '',
    placeholder: draft.placeholder || '',
    required: Boolean(draft.required),
    active: draft.active !== false,
    options: needsOptions(draft.questionType) ? (draft.options || []).map((option) => String(option).trim()).filter(Boolean) : []
  };
}

// A question is ready to be saved when the guest could answer it.
export function questionProblems(draft) {
  const problems = [];
  if (!String(draft.label || '').trim()) problems.push('Ohne Frage sieht der Gast ein leeres Feld. Schreib auf, was er beantworten soll.');
  if (needsOptions(draft.questionType)) problems.push(...optionProblems(draft.options || []));
  return problems;
}
