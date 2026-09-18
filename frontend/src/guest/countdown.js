// The wait until a round opens, split into the segments the waiting page shows.
const minute = 60;
const hour = 60 * minute;
const day = 24 * hour;

function asTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : null;
}

export function countdownParts(target, now = new Date()) {
  const end = asTime(target);
  const start = asTime(now);
  if (end === null || start === null) return null;
  const total = Math.max(0, Math.floor((end - start) / 1000));
  return {
    total,
    days: Math.floor(total / day),
    hours: Math.floor(total / hour) % 24,
    minutes: Math.floor(total / minute) % 60,
    seconds: total % 60,
    done: total === 0
  };
}

export const countdownLabels = {
  de: { days: 'Tage', day: 'Tag', hours: 'Std', minutes: 'Min', seconds: 'Sek' },
  en: { days: 'days', day: 'day', hours: 'hrs', minutes: 'min', seconds: 'sec' }
};

// Days drop out once the last one is over, so the remaining segments get the room.
export function countdownSegments(parts, lang = 'de') {
  if (!parts || parts.done) return [];
  const labels = countdownLabels[lang] || countdownLabels.de;
  const keys = parts.days > 0 ? ['days', 'hours', 'minutes', 'seconds'] : ['hours', 'minutes', 'seconds'];
  return keys.map((key) => ({
    key,
    label: key === 'days' && parts.days === 1 ? labels.day : labels[key],
    value: key === 'days' ? String(parts.days) : String(parts[key]).padStart(2, '0')
  }));
}
