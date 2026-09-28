import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onSessionEnded } from './api.js';

function respond(status, body, contentType = 'application/json; charset=utf-8') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => JSON.parse(text),
    text: async () => text
  };
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the data of successful requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { ok: true })));
    await expect(api('/public/site')).resolves.toEqual({ ok: true });
  });

  it('shows the reason the server gives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(403, {
      error: 'Die Ersteinrichtung ist aus Sicherheitsgründen nur über eine lokale Verbindung möglich.'
    })));
    const error = await api('/admin/setup/first-admin', { method: 'POST' }).catch((failure) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Die Ersteinrichtung ist aus Sicherheitsgründen nur über eine lokale Verbindung möglich.');
  });

  it('explains proxy error pages by their status code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(502, '<html><body>Bad Gateway</body></html>', 'text/html')));
    await expect(api('/admin/me')).rejects.toThrow(
      'qrating ist gerade nicht erreichbar, vermutlich startet der Server neu. Bitte versuche es gleich erneut. (HTTP 502)'
    );
  });

  it('explains a missing connection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await api('/admin/me').catch((failure) => failure);
    expect(error.status).toBe(0);
    expect(error.message).toBe('Der Server ist gerade nicht erreichbar. Bitte prüfe deine Internetverbindung und versuche es erneut.');
  });

  it('keeps the answer of closed guest pages for their texts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(404, { status: 'no_event', texts: { no_event_headline: 'Heute nicht' } })));
    const error = await api('/public/f/demo-events').catch((failure) => failure);
    expect(error.status).toBe(404);
    expect(error.body.texts.no_event_headline).toBe('Heute nicht');
    expect(error.message).toContain('(HTTP 404)');
  });

  it('reports a web page where data was expected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, '<!doctype html><html></html>', 'text/html')));
    await expect(api('/admin/dashboard')).rejects.toThrow('Der Server hat eine Webseite statt Daten geschickt.');
  });
});

// An answer with headers beyond the content type.
function answer(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('a session that ends in the middle of work', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the reason to the admin area', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(401, { error: 'Dein Konto ist deaktiviert.' })));
    const ended = vi.fn();
    const stop = onSessionEnded(ended);

    await expect(api('/admin/events')).rejects.toMatchObject({ status: 401 });

    expect(ended).toHaveBeenCalledWith('Dein Konto ist deaktiviert.');
    stop();
  });

  it('leaves a 401 of the sign-in forms to the form that sent it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(401, { error: 'E-Mail oder Passwort ist falsch.' })));
    const ended = vi.fn();
    const stop = onSessionEnded(ended);

    await expect(api('/admin/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 });
    await expect(api('/admin/login/2fa', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 401 });

    expect(ended).not.toHaveBeenCalled();
    stop();
  });

  it('reports nothing once the admin area stopped listening', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(401, { error: 'Abgelaufen.' })));
    const ended = vi.fn();

    onSessionEnded(ended)();
    await expect(api('/admin/events')).rejects.toMatchObject({ status: 401 });

    expect(ended).not.toHaveBeenCalled();
  });
});

describe('an installation that waits for its first setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leads a public page to the setup', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/f/beispiel', replace } });
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, { ok: true }, {
      'x-qrating-setup': 'open',
      'x-qrating-setup-url': 'https://app.example.test/admin'
    })));

    const pending = api('/public/f/beispiel');
    const outcome = await Promise.race([pending.then(() => 'answered'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 20))]);

    expect(replace).toHaveBeenCalledWith('https://app.example.test/admin');
    expect(outcome).toBe('waiting');
  });

  it('keeps the admin area where it is, since the setup lives there', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/admin', replace } });
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, { setupRequired: true }, { 'x-qrating-setup': 'open' })));

    expect(await api('/admin/setup/status')).toEqual({ setupRequired: true });
    expect(replace).not.toHaveBeenCalled();
  });
});
