import { createContext, useContext } from 'react';

// What every page of the admin area can reach: the account, the chosen look, the route,
// the way to another page, and the list of events with their numbers.
export const AdminContext = createContext(null);

export function useAdmin() {
  return useContext(AdminContext);
}
