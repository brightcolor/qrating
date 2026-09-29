import { describe, expect, it } from 'vitest';
import { accessLabel, activeOwners, invitationToRenew, teamLock } from './team.js';

const now = new Date('2026-09-29T12:00:00Z');
const owner = { id: 'o1', role: 'owner', status: 'active' };
const colleague = { id: 'a1', role: 'admin', status: 'active' };

describe('what an owner may change in the team', () => {
  it('keeps the own account for another owner', () => {
    expect(teamLock(owner, { id: 'o1' }, ['o1', 'o2'])).toMatch(/eigenes Konto/);
  });

  it('keeps a platform account for the platform role', () => {
    const platform = { id: 'p1', role: 'owner', status: 'active', platform_admin: true };
    expect(teamLock(platform, { id: 'o2', platformAdmin: false }, ['p1', 'o2'])).toMatch(/Plattform-Konto/);
    expect(teamLock(platform, { id: 'o2', platformAdmin: true }, ['p1', 'o2'])).toBe(null);
  });

  it('keeps the last active owner', () => {
    const users = [owner, colleague, { id: 'o2', role: 'owner', status: 'disabled' }];

    expect(activeOwners(users)).toEqual(['o1']);
    expect(teamLock(owner, { id: 'x', platformAdmin: true }, activeOwners(users))).toMatch(/Letzter aktiver Owner/);
    expect(teamLock(owner, { id: 'x', platformAdmin: true }, ['o1', 'o3'])).toBe(null);
    expect(teamLock(colleague, { id: 'o1' }, ['o1'])).toBe(null);
  });
});

describe('the access of a person in words', () => {
  it('tells an open invitation from one that ran out', () => {
    expect(accessLabel({ status: 'invited', invite_expires_at: '2026-10-06T12:00:00Z' }, now)).toMatch(/^Eingeladen, gilt bis /);
    expect(accessLabel({ status: 'invited', invite_expires_at: '2026-09-20T12:00:00Z' }, now)).toBe('Einladung abgelaufen');
  });

  it('tells a withdrawn invitation from a deactivated account', () => {
    expect(accessLabel({ status: 'disabled', open_invite: true }, now)).toBe('Einladung zurückgezogen');
    expect(accessLabel({ status: 'disabled', open_invite: false }, now)).toBe('Deaktiviert');
    expect(accessLabel({ status: 'active' }, now)).toBe('Aktiv');
  });

  it('offers a new invitation where the old one was withdrawn or ran out', () => {
    expect(invitationToRenew({ status: 'disabled', open_invite: true }, now)).toBe(true);
    expect(invitationToRenew({ status: 'invited', invite_expires_at: '2026-09-20T12:00:00Z' }, now)).toBe(true);
    expect(invitationToRenew({ status: 'invited', invite_expires_at: '2026-10-06T12:00:00Z' }, now)).toBe(false);
    expect(invitationToRenew({ status: 'disabled', open_invite: false }, now)).toBe(false);
  });
});
