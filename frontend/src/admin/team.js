// The team as the admin area shows it. The server keeps the same rules; the page uses these to
// offer only what it would accept and to say why a row stays as it is.
import { formatDate } from './eventLabel.js';

export const roleLabels = { support: 'Support', analyst: 'Analyst', event_manager: 'Event Manager', admin: 'Admin', owner: 'Owner' };

export function activeOwners(users = []) {
  return users.filter((user) => user.role === 'owner' && user.status === 'active').map((user) => user.id);
}

// Why the reader cannot change a person, or null.
export function teamLock(user, me, owners = []) {
  if (user.id === me?.id) return 'Dein eigenes Konto ändert ein anderer Owner deiner Organisation.';
  if (user.platform_admin && !me?.platformAdmin) return 'Plattform-Konto: Ändern kann es nur ein Plattform-Admin.';
  if (user.role === 'owner' && user.status === 'active' && !owners.some((id) => id !== user.id)) {
    return 'Letzter aktiver Owner: Mach zuerst eine andere Person zum Owner.';
  }
  return null;
}

// The access of a person in words, with the state of an invitation.
export function accessLabel(user, now = new Date()) {
  if (user.status === 'invited') {
    const until = user.invite_expires_at ? new Date(user.invite_expires_at) : null;
    if (until && until < now) return 'Einladung abgelaufen';
    return `Eingeladen${until ? `, gilt bis ${formatDate(user.invite_expires_at)}` : ''}`;
  }
  if (user.status === 'disabled') return user.open_invite ? 'Einladung zurückgezogen' : 'Deaktiviert';
  return 'Aktiv';
}

// An invitation that can be sent again: withdrawn, or run out.
export function invitationToRenew(user, now = new Date()) {
  if (user.status === 'disabled') return Boolean(user.open_invite);
  return user.status === 'invited' && Boolean(user.invite_expires_at) && new Date(user.invite_expires_at) < now;
}
