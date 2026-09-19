// One list for the admin navigation. The sidebar, the drawer on a phone and the
// title in the mobile header all read it, so a new page is added in exactly one place.
export const adminPages = [
  { id: 'tenants', label: 'Mandanten', platformOnly: true },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'security', label: 'Sicherheit' },
  { id: 'events', label: 'Events' },
  { id: 'forms', label: 'Formulare' },
  { id: 'analytics', label: 'Auswertung' },
  { id: 'low-ratings', label: 'Low-Rating' },
  { id: 'texts', label: 'Texte' },
  { id: 'website', label: 'Website' },
  { id: 'billing', label: 'Plan & Billing' },
  { id: 'branding', label: 'Branding' },
  { id: 'qr', label: 'QR & Wallboard' },
  { id: 'pretix', label: 'Pretix' },
  { id: 'users', label: 'Benutzer' },
  { id: 'notifications', label: 'Benachrichtigungen' },
  { id: 'operations', label: 'Betrieb' },
  { id: 'smtp', label: 'SMTP' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'webhooks', label: 'Webhooks' }
];

// The tenant list belongs to the platform role. Everyone else never sees the entry.
export function navFor({ platformAdmin = false } = {}) {
  return adminPages.filter((page) => !page.platformOnly || platformAdmin);
}

export function pageTitle(id) {
  return adminPages.find((page) => page.id === id)?.label || 'Adminbereich';
}

// The drawer travels in both directions, so it stays mounted through the way out.
// It opens straight away and a CSS animation carries it in: should the animation never
// run -- a throttled tab, a browser that skips it -- the drawer is simply there. Pushing
// it in afterwards would leave it beside the screen instead, and the menu would look broken.
export function nextMenuState(current, action) {
  if (action === 'open') return 'open';
  if (action === 'close') return current === 'closed' ? 'closed' : 'closing';
  // A timer that arrives after the drawer was opened again must not close it.
  if (action === 'gone') return current === 'closing' ? 'closed' : current;
  return current;
}

export const menuMounted = (state) => state !== 'closed';
export const menuShown = (state) => state === 'open';
