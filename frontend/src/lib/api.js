import { adminBase } from './paths.js';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = configuredApiBase === undefined ? '/api' : configuredApiBase.replace(/\/$/, '');

// Requests whose 401 belongs to the form that sent them: signing in, the first setup, an
// invitation, a reset. Any other 401 means the session has ended.
const sessionForms = ['/admin/login', '/admin/setup/', '/admin/password-reset/', '/admin/accept-invite', '/admin/password-policy'];
let sessionEnded = null;

// The admin area listens here while someone is signed in, so a session that ends in the middle
// of work leads back to the sign-in with its reason. Returns the way to stop listening.
export function onSessionEnded(handler) {
  sessionEnded = handler;
  return () => {
    if (sessionEnded === handler) sessionEnded = null;
  };
}

// While an installation waits for its first setup, every public page leads there.
function leadsToSetup(response) {
  if (response.headers.get('x-qrating-setup') !== 'open') return false;
  if (typeof window === 'undefined' || window.location.pathname.startsWith(adminBase)) return false;
  window.location.replace(response.headers.get('x-qrating-setup-url') || adminBase);
  return true;
}

// Used when a response carries no readable reason of its own (proxy pages, empty bodies).
const statusMessages = {
  400: 'Die Anfrage war unvollständig oder fehlerhaft. Bitte prüfe deine Eingaben.',
  401: 'Du bist nicht angemeldet oder deine Sitzung ist abgelaufen. Bitte melde dich neu an.',
  403: 'Für diese Aktion fehlt die Berechtigung.',
  404: 'Das Angeforderte wurde nicht gefunden. Lade die Seite neu und versuche es erneut.',
  405: 'Der Server unterstützt diese Aktion nicht. Lade die Seite neu, damit du den aktuellen Stand von qrating verwendest.',
  408: 'Der Server hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.',
  409: 'Die Daten wurden inzwischen geändert oder sind schon vorhanden. Lade die Seite neu und versuche es erneut.',
  413: 'Die gesendeten Daten sind zu groß. Bitte kürze die Eingabe.',
  429: 'Zu viele Anfragen in kurzer Zeit. Bitte warte einen Moment und versuche es dann erneut.',
  500: 'Auf dem Server ist ein Fehler aufgetreten. Bitte versuche es erneut.',
  502: 'qrating ist gerade nicht erreichbar, vermutlich startet der Server neu. Bitte versuche es gleich erneut.',
  503: 'qrating ist gerade nicht erreichbar, vermutlich startet der Server neu. Bitte versuche es gleich erneut.',
  504: 'Der Server hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.'
};

export class ApiError extends Error {
  constructor(message, { status = 0, reference = null, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reference = reference;
    this.body = body;
  }
}

function fallbackMessage(status) {
  const message = statusMessages[status]
    || (status >= 500 ? statusMessages[500] : 'Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.');
  return `${message} (HTTP ${status})`;
}

export function assetUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`;
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    console.error(`qrating API nicht erreichbar (${API_BASE || 'gleiche Domain'})`, error);
    throw new ApiError(typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Keine Internetverbindung. Bitte prüfe deine Verbindung und versuche es erneut.'
      : 'Der Server ist gerade nicht erreichbar. Bitte prüfe deine Internetverbindung und versuche es erneut.');
  }
  // The page is on its way to the setup; nothing after this answer is shown anymore.
  if (leadsToSetup(response)) return new Promise(() => {});
  const isJson = response.headers.get('content-type')?.includes('application/json');
  let body = null;
  try {
    body = isJson ? await response.json() : await response.text();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const serverMessage = isJson && typeof body?.error === 'string' ? body.error.trim() : '';
    const error = new ApiError(serverMessage || fallbackMessage(response.status), {
      status: response.status,
      reference: isJson ? body?.reference || null : null,
      body: isJson ? body : null
    });
    if (response.status === 401 && sessionEnded && !sessionForms.some((form) => path.startsWith(form))) {
      sessionEnded(error.message);
    }
    throw error;
  }
  // A web page instead of data means the /api route ends at the wrong service.
  if (!isJson && typeof body === 'string' && body.trimStart().startsWith('<')) {
    throw new ApiError('Der Server hat eine Webseite statt Daten geschickt. Prüfe als Betreiber, ob /api zum qrating-Backend weiterleitet.', {
      status: response.status
    });
  }
  return body;
}

export { API_BASE };
