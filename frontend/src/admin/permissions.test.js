import { describe, expect, it } from 'vitest';
import { can, needs, whoCan } from './permissions.js';

describe('what a role may do in the admin area', () => {
  it('follows the ranks of the server', () => {
    expect(can({ role: 'analyst' }, 'events')).toBe(false);
    expect(can({ role: 'event_manager' }, 'events')).toBe(true);
    expect(can({ role: 'event_manager' }, 'privacy')).toBe(false);
    expect(can({ role: 'admin' }, 'privacy')).toBe(true);
    expect(can({ role: 'admin' }, 'team')).toBe(false);
    expect(can({ role: 'owner' }, 'team')).toBe(true);
    expect(can(null, 'events')).toBe(false);
  });

  it('names who can change a part for every rank in use', () => {
    for (const part of Object.keys(needs)) expect(whoCan(part), part).toMatch(/deiner Organisation$/);
    expect(whoCan('team')).toBe('ein Owner deiner Organisation');
    expect(whoCan('events')).toBe('ein Event-Manager, Admin oder Owner deiner Organisation');
  });
});
