// QR places as the admin area names and checks them. The server checks the same rules again;
// saying them in the form spares a round trip and puts the message next to the field.

// A name for a place, or the reason it cannot be one.
export function placeLabelProblem(label, maxLength) {
  const text = String(label ?? '').trim();
  if (!text) return 'Gib dem QR-Platz einen Namen, etwa „Bar“ oder „Eingang“.';
  if (maxLength && text.length > maxLength) return `Der Name darf höchstens ${maxLength} Zeichen lang sein. Kürze ihn bitte.`;
  return null;
}

// The address a printed code of the place carries; the start of it arrives with the organization.
export function placeAddress(organizationUrl, source) {
  return `${organizationUrl || '…'}/${source.source_slug}`;
}

// What deleting a place does, said before it happens.
export function placeDeleteNotice(source, address) {
  return `QR-Platz „${source.label}“ löschen? Stimmen und Scans, die über ihn kamen, behalten den Namen „${source.label}“. Gedruckte Codes mit der Adresse ${address} führen weiter zur Gästeseite; ihre Scans zählen dann ohne Platz.`;
}
