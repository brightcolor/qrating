// QR places as the admin area names and checks them. The server checks the same rules again;
// saying them in the form spares a round trip and puts the message next to the field.

// Names the guest page gives its own ways in. A place with such a short name could not be told
// apart from them in the numbers; the server refuses them as well.
export const reservedSlugs = ['event', 'dynamic', 'dynamic_organization', 'event_specific', 'preview', 'unknown'];

// A name for a place, or the reason it cannot be one.
export function placeLabelProblem(label, maxLength) {
  const text = String(label ?? '').trim();
  if (!text) return 'Gib dem QR-Platz einen Namen, etwa „Bar“ oder „Eingang“.';
  if (maxLength && text.length > maxLength) return `Der Name darf höchstens ${maxLength} Zeichen lang sein. Kürze ihn bitte.`;
  return null;
}

// A short name for the address of the code, or the reason it cannot be one.
export function placeSlugProblem(slug, maxLength) {
  const text = String(slug ?? '').trim();
  if (!text || /^-+$/.test(text)) return 'Gib dem Platz einen Kurznamen für die Adresse, etwa „bar“.';
  if (!/^[a-z0-9-]+$/.test(text)) return 'Der Kurzname darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten, etwa „bar“ oder „eingang-nord“.';
  if (maxLength && text.length > maxLength) return `Der Kurzname darf höchstens ${maxLength} Zeichen lang sein. Kürze ihn bitte.`;
  if (reservedSlugs.includes(text)) return `„${text}“ benennt schon einen Weg zur Gästeseite. Wähle einen anderen Kurznamen, etwa „${text}-platz“.`;
  return null;
}

// The address a printed code of the place carries. A place for all events hangs its short name on
// the address of the organization; a place for a single event rides on the link of that event,
// which only the page of that event knows. Elsewhere there is no address to show: null.
export function placeAddress(organizationUrl, source, event = null) {
  if (source.type === 'event_specific') {
    return event?.url && source.event_id === event.id ? `${event.url}?source=${source.source_slug}` : null;
  }
  return `${organizationUrl || '…'}/${source.source_slug}`;
}

// What deleting a place does, said before it happens: the names stay, the printed codes keep
// working, and whatever comes through them afterwards stands under the short name, until a new
// place takes that short name up.
export function placeDeleteNotice(source, address) {
  const codes = address ? `Gedruckte Codes mit der Adresse ${address}` : 'Gedruckte Codes des Platzes';
  return `QR-Platz „${source.label}“ löschen? Stimmen und Scans, die über ihn kamen, behalten den Namen „${source.label}“. ${codes} führen weiter zur Gästeseite; was danach über sie kommt, steht unter dem Kurznamen „${source.source_slug}“. Ein neuer Platz mit dem Kurznamen „${source.source_slug}“ zählt diese Codes wieder für sich.`;
}
