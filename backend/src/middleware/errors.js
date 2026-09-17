import crypto from 'crypto';
import { env } from '../config/env.js';

// Every error that reaches a person says what happened and what to do next.

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function errorPage(status, message) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>qrating: Das hat nicht geklappt</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#f5f5f5;color:#171717;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:480px;padding:32px;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{margin:0 0 12px;font-size:22px}p{margin:0 0 16px;line-height:1.6}a{color:#1d4ed8}small{color:#737373}
</style>
</head>
<body>
<main>
<h1>Das hat nicht geklappt</h1>
<p>${escapeHtml(message)}</p>
<p><a href="${escapeHtml(env.adminAppUrl)}/admin">Zurück zu qrating</a></p>
<small>HTTP ${status}</small>
</main>
</body>
</html>`;
}

// Links opened in the browser (exports, QR codes) get a page, API calls get JSON.
export function sendError(req, res, status, message, extra = {}) {
  if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
    return res.status(status).type('html').send(errorPage(status, message));
  }
  return res.status(status).json({ error: message, ...extra });
}

export function notFound(req, res) {
  sendError(req, res, 404, 'Diese Funktion gibt es auf dem Server nicht. Lade die Seite neu, damit du den aktuellen Stand von qrating verwendest.');
}

// "eine Minute", "15 Minuten", "eine Stunde" for rate limit messages.
export function describeWait(milliseconds) {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'eine Stunde' : `${hours} Stunden`;
  }
  return minutes === 1 ? 'eine Minute' : `${minutes} Minuten`;
}

// PostgreSQL error codes caused by invalid or conflicting input.
const databaseMessages = {
  '22001': [400, 'Ein Text ist zu lang. Bitte kürze die Eingabe.'],
  '22003': [400, 'Eine Zahl liegt außerhalb des erlaubten Bereichs. Bitte prüfe deine Eingaben.'],
  '22007': [400, 'Ein Datum oder eine Uhrzeit hat ein ungültiges Format. Bitte prüfe deine Eingaben.'],
  '22008': [400, 'Ein Datum oder eine Uhrzeit liegt außerhalb des gültigen Bereichs. Bitte prüfe deine Eingaben.'],
  '22P02': [400, 'Eine Angabe hat ein ungültiges Format. Lade die Seite neu und versuche es erneut.'],
  '23502': [400, 'Ein Pflichtfeld fehlt. Bitte fülle alle Pflichtfelder aus.'],
  '23503': [409, 'Der Eintrag verweist auf Daten, die es nicht mehr gibt, oder wird noch an anderer Stelle gebraucht. Lade die Seite neu und versuche es erneut.'],
  '23505': [409, 'Diese Angabe ist schon vergeben, zum Beispiel ein Name, eine E-Mail-Adresse oder ein Kurzname. Bitte wähle eine andere.'],
  '23514': [400, 'Ein Wert liegt außerhalb der erlaubten Auswahl. Bitte prüfe deine Eingaben.'],
  '40001': [503, 'Die Daten wurden gleichzeitig an anderer Stelle geändert. Bitte versuche es erneut.'],
  '40P01': [503, 'Die Daten wurden gleichzeitig an anderer Stelle geändert. Bitte versuche es erneut.'],
  '53300': [503, 'Die Datenbank ist gerade ausgelastet. Bitte versuche es gleich erneut.'],
  '57P01': [503, 'Die Datenbank startet gerade neu. Bitte versuche es gleich erneut.'],
  '57P03': [503, 'Die Datenbank startet gerade. Bitte versuche es gleich erneut.']
};

const bodyMessages = {
  'entity.parse.failed': [400, 'Die gesendeten Daten ließen sich nicht lesen. Lade die Seite neu und versuche es erneut.'],
  'entity.too.large': [413, 'Die gesendeten Daten sind zu groß. Erlaubt ist höchstens 1 MB.'],
  'charset.unsupported': [415, 'Die gesendeten Daten nutzen eine Zeichenkodierung, die der Server nicht versteht. Bitte sende sie als UTF-8.'],
  'encoding.unsupported': [415, 'Die gesendeten Daten sind in einem Format komprimiert, das der Server nicht versteht.']
};

export function describeError(error) {
  if (error?.publicMessage) return { status: error.status || 500, message: error.publicMessage };
  if (bodyMessages[error?.type]) {
    const [status, message] = bodyMessages[error.type];
    return { status, message };
  }
  if (typeof error?.code === 'string' && databaseMessages[error.code]) {
    const [status, message] = databaseMessages[error.code];
    return { status, message };
  }
  if (error?.code === 'ECONNREFUSED' && error?.port === 5432) {
    return { status: 503, message: 'Die Datenbank ist gerade nicht erreichbar. Bitte versuche es gleich erneut.' };
  }
  // Older code attaches a status to messages that are meant for people.
  if (error?.status >= 400 && error.status < 500 && error.message) return { status: error.status, message: error.message };
  return null;
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const known = describeError(error);
  if (known && known.status < 500) {
    return sendError(req, res, known.status, known.message);
  }
  // Server-side failures get a reference that also appears in the log.
  const reference = crypto.randomBytes(4).toString('hex').toUpperCase();
  console.error(`[Fehler ${reference}] ${req.method} ${req.path}`, error);
  const message = known?.message || 'Auf dem Server ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.';
  return sendError(
    req,
    res,
    known?.status || 500,
    `${message} Bleibt der Fehler bestehen, nenne dem Support die Fehlerkennung ${reference}.`,
    { reference }
  );
}
