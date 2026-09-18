import { describe, expect, it } from 'vitest';
import { PretixService } from '../src/services/pretixService.js';
import { encryptSecret } from '../src/utils/crypto.js';

const connection = {
  id: 'connection-1',
  organization_id: 'org-1',
  base_url: 'https://tickets.example.com/',
  pretix_organizer_slug: 'hsp',
  api_token_encrypted: encryptSecret('token-123'),
  import_live_only: false,
  ignore_testmode: false,
  import_public_only: false,
  import_event_images: false
};

function pretixEvent(slug) {
  return {
    slug,
    name: { de: `Event ${slug}` },
    date_from: '2026-09-19T15:30:00Z',
    location: { de: 'Alter Hafen' },
    live: true
  };
}

// Collects the events that would be written and answers like the database.
function recordingDb() {
  const events = [];
  const statuses = [];
  return {
    events,
    statuses,
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO events')) {
        events.push({ slug: params[3], name: params[7], location: params[14] });
        return { rows: [{ id: `event-${events.length}` }] };
      }
      if (sql.includes('UPDATE pretix_connections')) {
        statuses.push(params[0]);
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
}

function answering(pages) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, token: options?.headers?.Authorization });
    const page = pages[calls.length - 1];
    if (!page) throw new Error(`Unerwarteter Aufruf: ${url}`);
    return { ok: true, status: 200, json: async () => page };
  };
  return { calls, fetchImpl };
}

describe('Pretix sync', () => {
  it('walks every page of the event list', async () => {
    const db = recordingDb();
    const { calls, fetchImpl } = answering([
      { count: 3, next: 'https://tickets.example.com/api/v1/organizers/hsp/events/?page=2', results: [pretixEvent('a'), pretixEvent('b')] },
      { count: 3, next: null, results: [pretixEvent('c')] }
    ]);

    const result = await new PretixService(db, fetchImpl).syncConnection(connection);

    expect(result.imported).toBe(3);
    expect(db.events.map((event) => event.slug)).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://tickets.example.com/api/v1/organizers/hsp/events/');
    expect(calls[1].url).toBe('https://tickets.example.com/api/v1/organizers/hsp/events/?page=2');
    expect(calls[1].token).toBe('Token token-123');
    expect(db.statuses[0]).toContain('3 Events synchronisiert');
  });

  it('follows no address that leaves Pretix', async () => {
    const db = recordingDb();
    const { calls, fetchImpl } = answering([
      { count: 1, next: 'https://fremde-seite.example.net/api/v1/organizers/hsp/events/?page=2', results: [pretixEvent('a')] }
    ]);

    const result = await new PretixService(db, fetchImpl).syncConnection(connection);

    expect(result.imported).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('stores name and place as the text of the event', async () => {
    const db = recordingDb();
    const { fetchImpl } = answering([{ count: 1, next: null, results: [pretixEvent('a')] }]);

    await new PretixService(db, fetchImpl).syncConnection(connection);

    expect(db.events[0]).toMatchObject({ name: 'Event a', location: 'Alter Hafen' });
  });
});
