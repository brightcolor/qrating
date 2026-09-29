// The order of the roles, the same as on the server: each role can do what the ones below it can.
// The server decides every request; the pages use this only to leave out what a role cannot do.
const roleRank = { support: 10, analyst: 20, event_manager: 30, admin: 40, owner: 50 };

export function hasRole(role, minimumRole) {
  return (roleRank[role] || 0) >= (roleRank[minimumRole] || 0);
}
