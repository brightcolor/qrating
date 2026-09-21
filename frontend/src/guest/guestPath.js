// The address the guest page asks the server for. index.html starts this very request
// before any bundle has arrived, with a copy of this function in its inline script; a
// test holds the two together. Both must agree to the letter: the request counts a scan,
// and a second one for the same visit would count it twice.
export function guestApiPath(pathname, search = '') {
  const query = new URLSearchParams(search);
  const keep = new URLSearchParams();
  if (query.get('lang')) keep.set('lang', query.get('lang'));
  if (query.get('preview')) keep.set('preview', query.get('preview'));
  const suffix = keep.toString() ? `?${keep.toString()}` : '';
  if (pathname.startsWith('/e/')) return `/public/e/${pathname.split('/')[2]}${suffix}`;
  if (pathname.startsWith('/f/')) {
    const parts = pathname.split('/').filter(Boolean);
    const source = parts[2] || query.get('source');
    return `/public/f/${parts[1]}${source ? `/${source}` : ''}${suffix}`;
  }
  return null;
}
