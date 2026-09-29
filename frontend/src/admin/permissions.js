// What the parts of the admin area need, in the ranks the server checks. The server decides every
// request; the pages use this to leave out what a role cannot do, to load only what it may read,
// and to say who can change the rest.
import { hasRole } from './roles.js';

export const needs = {
  events: 'event_manager', // create, change and delete events, forms, questions and QR places
  guestPage: 'event_manager', // texts, look, wallboard settings, name and links of the organization
  privacy: 'admin', // deletion periods and the details of the privacy page
  assignments: 'event_manager', // who works on which event
  team: 'owner', // invitations, roles and access
  channels: 'event_manager', // alert channels of the organization and of other people
  pretix: 'event_manager',
  mailServer: 'admin',
  newsletter: 'admin',
  webhooks: 'admin',
  plan: 'admin',
  operations: 'event_manager',
  checks: 'admin', // checks of the installation and the audit log
  contacts: 'event_manager' // protected contacts of guests
};

export function can(me, part) {
  return hasRole(me?.role, needs[part]);
}

const who = {
  event_manager: 'ein Event-Manager, Admin oder Owner deiner Organisation',
  admin: 'ein Admin oder Owner deiner Organisation',
  owner: 'ein Owner deiner Organisation'
};

// Who may change a part that the reader can only look at.
export function whoCan(part) {
  return who[needs[part]];
}

// For a role that sees only the events it is assigned to, while none is.
export const unassignedNote = `Dir ist noch kein Event zugewiesen. Das übernimmt ${who[needs.assignments]} unter Einstellungen → Team.`;
