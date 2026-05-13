const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = configuredApiBase === undefined ? '/api' : configuredApiBase.replace(/\/$/, '');

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
    throw new Error(`Backend nicht erreichbar (${API_BASE || 'gleiche Domain'}). Bitte pruefe, ob die API laeuft und der Reverse Proxy korrekt konfiguriert ist.`);
  }
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(body?.error || 'Anfrage fehlgeschlagen.');
  }
  return body;
}

export { API_BASE };
