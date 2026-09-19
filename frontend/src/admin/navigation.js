// One list for the admin navigation. The sidebar, the drawer on a phone and the
// title in the mobile header all read it, so a new page is added in exactly one place.
export const adminPages = [
  { id: 'tenants', slug: 'mandanten', label: 'Mandanten', platformOnly: true },
  { id: 'dashboard', slug: 'dashboard', label: 'Dashboard' },
  { id: 'security', slug: 'sicherheit', label: 'Sicherheit' },
  { id: 'events', slug: 'events', label: 'Events' },
  { id: 'forms', slug: 'formulare', label: 'Formulare' },
  { id: 'analytics', slug: 'auswertung', label: 'Auswertung' },
  { id: 'low-ratings', slug: 'low-rating', label: 'Low-Rating' },
  { id: 'texts', slug: 'texte', label: 'Texte' },
  { id: 'website', slug: 'website', label: 'Website' },
  { id: 'billing', slug: 'plan', label: 'Plan & Billing' },
  { id: 'branding', slug: 'branding', label: 'Branding' },
  { id: 'qr', slug: 'qr', label: 'QR & Wallboard' },
  { id: 'pretix', slug: 'pretix', label: 'Pretix' },
  { id: 'users', slug: 'benutzer', label: 'Benutzer' },
  { id: 'notifications', slug: 'benachrichtigungen', label: 'Benachrichtigungen' },
  { id: 'operations', slug: 'betrieb', label: 'Betrieb' },
  { id: 'smtp', slug: 'smtp', label: 'SMTP' },
  { id: 'newsletter', slug: 'newsletter', label: 'Newsletter' },
  { id: 'webhooks', slug: 'webhooks', label: 'Webhooks' }
];

export const adminBase = '/admin';

// Addresses under /admin that carry a flow of their own and never name a page.
// An invite and a password reset arrive with a token and have to stay untouched.
export const reservedPaths = ['accept-invite', 'reset-password'];

export function slugFor(id) {
  return adminPages.find((page) => page.id === id)?.slug || null;
}

// The address of a page, ready for the history. Anything a page keeps beside its
// name -- the event an evaluation is showing, for instance -- rides in the query.
export function pathFor(id, params = {}) {
  const slug = slugFor(id);
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(name, String(value));
  }
  const tail = query.toString();
  return `${adminBase}${slug ? `/${slug}` : ''}${tail ? `?${tail}` : ''}`;
}

// Which page an address names, or null when it names none: a reserved flow, a deeper
// path, an unknown name. The caller falls back to the dashboard and straightens the
// address, so a wrong link never leaves the reader on a page the address contradicts.
export function pageFromPath(pathname = '', search = '') {
  const path = String(pathname).replace(/\/+$/, '') || adminBase;
  if (path !== adminBase && !path.startsWith(`${adminBase}/`)) return null;
  const parts = path.slice(adminBase.length).split('/').filter(Boolean);
  if (parts.length === 0) {
    // The website links to the plan with a query of its own; both spellings exist.
    const query = new URLSearchParams(String(search).replace(/^\?/, ''));
    return query.has('plan') || query.has('billing') ? 'billing' : 'dashboard';
  }
  if (parts.length > 1) return null;
  if (reservedPaths.includes(parts[0])) return null;
  return adminPages.find((page) => page.slug === parts[0])?.id || null;
}

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
