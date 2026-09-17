import { httpError } from '../middleware/errors.js';
import { decryptSecret } from './crypto.js';

// Readable messages for failures of services qrating talks to (Pretix, webhooks, chat channels, mail servers).
// The service name is the subject of the sentence, e.g. "Pretix" or "Der Webhook-Empfänger".

const networkReasons = {
  ENOTFOUND: 'der Servername wurde nicht gefunden. Prüfe die Adresse.',
  EAI_AGAIN: 'der Servername ließ sich gerade nicht auflösen. Bitte versuche es später erneut.',
  ECONNREFUSED: 'der Server hat die Verbindung abgelehnt. Prüfe Adresse und Port.',
  ECONNRESET: 'die Verbindung wurde unterbrochen. Bitte versuche es erneut.',
  EHOSTUNREACH: 'der Server ist im Netz nicht erreichbar. Prüfe die Adresse.',
  ENETUNREACH: 'der Server ist im Netz nicht erreichbar. Prüfe die Adresse.',
  ETIMEDOUT: 'der Server antwortet nicht rechtzeitig. Bitte versuche es später erneut.',
  UND_ERR_CONNECT_TIMEOUT: 'der Server antwortet nicht rechtzeitig. Bitte versuche es später erneut.',
  UND_ERR_HEADERS_TIMEOUT: 'der Server antwortet nicht rechtzeitig. Bitte versuche es später erneut.',
  UND_ERR_SOCKET: 'die Verbindung wurde unterbrochen. Bitte versuche es erneut.',
  CERT_HAS_EXPIRED: 'das TLS-Zertifikat des Servers ist abgelaufen.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'der Server nutzt ein selbst signiertes TLS-Zertifikat, dem qrating nicht vertraut.',
  SELF_SIGNED_CERT_IN_CHAIN: 'der Server nutzt ein selbst signiertes TLS-Zertifikat, dem qrating nicht vertraut.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'das TLS-Zertifikat des Servers lässt sich nicht prüfen.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'das TLS-Zertifikat des Servers lässt sich nicht prüfen.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'das TLS-Zertifikat des Servers passt nicht zur Adresse.'
};

export function serviceUnreachable(service, error) {
  const code = error?.cause?.code || error?.code;
  if (code === 'ERR_INVALID_URL' || error?.cause?.code === 'ERR_INVALID_URL' || /invalid url|failed to parse url/i.test(error?.message || '')) {
    return httpError(400, `Die Adresse für ${service} ist ungültig. Bitte prüfe sie.`);
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return httpError(504, `${service} antwortet nicht rechtzeitig. Bitte versuche es später erneut.`);
  }
  const reason = networkReasons[code]
    || `die Verbindung ist fehlgeschlagen${code ? ` (${code})` : ''}. Prüfe die Adresse und versuche es erneut.`;
  return httpError(502, `${service} ist nicht erreichbar: ${reason}`);
}

const statusReasons = {
  400: ['hat die Anfrage abgelehnt', 'Prüfe die Einstellungen.'],
  401: ['hat die Anmeldung abgelehnt', 'Prüfe Token oder Zugangsdaten.'],
  403: ['verweigert den Zugriff', 'Prüfe die Rechte von Token oder Konto.'],
  404: ['kennt die aufgerufene Adresse nicht', 'Prüfe die URL.'],
  405: ['nimmt an dieser Adresse keine Nachrichten an', 'Prüfe die URL.'],
  408: ['hat nicht rechtzeitig geantwortet', 'Bitte versuche es später erneut.'],
  410: ['kennt die aufgerufene Adresse nicht mehr', 'Prüfe die URL.'],
  413: ['lehnt die Nachricht als zu groß ab', 'Kürze die Nachricht oder prüfe die Einstellungen.'],
  422: ['hat die gesendeten Daten abgelehnt', 'Prüfe die Einstellungen.'],
  429: ['begrenzt gerade die Anfragen', 'Bitte versuche es später erneut.']
};

// overrides: { 401: ['hat den API-Token abgelehnt', 'Trage einen gültigen Token ein.'] }
export function serviceRejected(service, status, overrides = {}) {
  const [clause, advice] = overrides[status]
    || statusReasons[status]
    || (status >= 500
      ? ['meldet einen eigenen Fehler', 'Bitte versuche es später erneut.']
      : ['hat die Anfrage nicht angenommen', 'Prüfe die Einstellungen.']);
  return httpError(502, `${service} ${clause} (HTTP ${status}). ${advice}`);
}

// fetch() with readable errors; non-2xx responses throw unless allowStatus accepts them.
export async function fetchService(service, fetchImpl, url, options = {}, { overrides = {}, allowStatus = () => false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw serviceUnreachable(service, error);
  }
  if (!response.ok && !allowStatus(response.status)) throw serviceRejected(service, response.status, overrides);
  return response;
}

const smtpMessages = {
  EAUTH: 'Der Mailserver hat die Anmeldung abgelehnt. Prüfe Benutzername und Passwort in den SMTP-Einstellungen.',
  ENOAUTH: 'Der Mailserver verlangt eine Anmeldung. Trage Benutzername und Passwort in den SMTP-Einstellungen ein.',
  EDNS: 'Der Mailserver wurde nicht gefunden. Prüfe den Servernamen in den SMTP-Einstellungen.',
  ENOTFOUND: 'Der Mailserver wurde nicht gefunden. Prüfe den Servernamen in den SMTP-Einstellungen.',
  EAI_AGAIN: 'Der Name des Mailservers ließ sich gerade nicht auflösen. Bitte versuche es später erneut.',
  ECONNECTION: 'Der Mailserver ist nicht erreichbar. Prüfe Server, Port und Verschlüsselung in den SMTP-Einstellungen.',
  ECONNREFUSED: 'Der Mailserver hat die Verbindung abgelehnt. Prüfe Server und Port in den SMTP-Einstellungen.',
  ETIMEDOUT: 'Der Mailserver antwortet nicht rechtzeitig. Prüfe Server, Port und Verschlüsselung in den SMTP-Einstellungen.',
  ESOCKET: 'Die verschlüsselte Verbindung zum Mailserver ist fehlgeschlagen. Üblich sind Port 465 mit Häkchen bei „SSL/TLS direkt verwenden“ oder Port 587 ohne dieses Häkchen.',
  ETLS: 'Der Mailserver unterstützt die gewählte Verschlüsselung nicht. Prüfe Port und Verschlüsselung in den SMTP-Einstellungen.',
  EREQUIRETLS: 'Der Mailserver bietet keine verschlüsselte Verbindung an. Prüfe Port und Verschlüsselung in den SMTP-Einstellungen.',
  EENVELOPE: 'Der Mailserver hat Absender oder Empfänger abgelehnt. Prüfe die E-Mail-Adressen.',
  EMESSAGE: 'Der Mailserver hat die Nachricht abgelehnt.',
  EPROTOCOL: 'Der Mailserver antwortet unerwartet. Prüfe Port und Verschlüsselung in den SMTP-Einstellungen.'
};

export function smtpFailure(error) {
  if (error?.publicMessage) return error;
  const serverAnswer = String(error?.response || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let message = smtpMessages[error?.code];
  if (!message && Number(error?.responseCode) >= 500) message = 'Der Mailserver hat die Nachricht abgelehnt.';
  if (!message && Number(error?.responseCode) >= 400) message = 'Der Mailserver hat die Nachricht vorübergehend abgelehnt. Bitte versuche es später erneut.';
  if (!message) message = 'Die E-Mail ließ sich nicht versenden. Prüfe die SMTP-Einstellungen und versuche es erneut.';
  return httpError(502, serverAnswer ? `${message} Antwort des Mailservers: ${serverAnswer}` : message);
}

// Stored secrets become unreadable when PRETIX_TOKEN_SECRET changes.
export function openSecret(payload, what) {
  try {
    return decryptSecret(payload);
  } catch {
    throw httpError(400, `${what} lässt sich nicht entschlüsseln, vermutlich wurde PRETIX_TOKEN_SECRET geändert. Bitte trage den Wert neu ein und speichere.`);
  }
}
