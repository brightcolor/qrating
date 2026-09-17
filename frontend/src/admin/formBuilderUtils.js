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
