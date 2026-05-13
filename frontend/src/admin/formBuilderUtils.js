import {
  CheckCircle2,
  Hash,
  ListChecks,
  MessageSquare,
  Star,
  ToggleLeft
} from 'lucide-react';

export const typeCards = [
  { value: 'text_short', label: 'Short answer', hint: 'One crisp thought', icon: MessageSquare },
  { value: 'text_long', label: 'Story answer', hint: 'Room for feelings', icon: MessageSquare },
  { value: 'checkboxes', label: 'Pick many', hint: 'Tags and reasons', icon: ListChecks },
  { value: 'multiple_choice', label: 'Pick one', hint: 'Clear options', icon: CheckCircle2 },
  { value: 'yes_no', label: 'Yes or no', hint: 'Fast decision', icon: ToggleLeft },
  { value: 'nps', label: 'Recommend', hint: '0 to 10 score', icon: Hash },
  { value: 'rating', label: 'Mini rating', hint: '1 to 5 scale', icon: Star }
];

export const promptIdeas = [
  'What was your favorite moment?',
  'What should we keep exactly like this?',
  'Where can we make the next event smoother?',
  'How did the location feel for you?',
  'What would you tell a friend about this event?',
  'What should we clarify before the next event?'
];

export function makeKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'question';
}

export function linesToOptions(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function optionsToLines(options) {
  return Array.isArray(options) ? options.join('\n') : '';
}
