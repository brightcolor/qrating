import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles/index.css';
import './admin/admin.css';
import './admin/admin-event.css';
import { api } from './lib/api.js';
import { AdminContext } from './admin/context.js';
import { AcceptInvite, AuthGate, ResetPassword } from './admin/auth.jsx';
import { navGroups, navKeyFor, pathForRoute, routeFromLocation, routeTitle, sameRoute } from './admin/navigation.js';
import { ActingBanner, Shell } from './admin/shells.jsx';
import { Notice, errorNotice } from './admin/ui.jsx';
import { readCachedTheme, themeFor, writeCachedTheme } from './admin/themes.js';
import { loadThemeFonts } from './admin/themeFonts.js';
import { pickCurrentEvent } from './admin/event/model.js';
import { Overview } from './admin/pages/overview.jsx';
import { EventsPage } from './admin/pages/events.jsx';
import { EventWorkspace } from './admin/event/workspace.jsx';
import { Callbacks } from './admin/pages/callbacks.jsx';
import { WallboardPage } from './admin/pages/wallboard.jsx';
import { GuestPage } from './admin/pages/guest.jsx';
import { SettingsPage } from './admin/pages/settings.jsx';
import { PlatformPage } from './admin/pages/platform.jsx';

// Applies a look to the whole document: colours and fonts hang on the root element.
function applyTheme(id) {
  const theme = themeFor(id);
  document.documentElement.dataset.adminTheme = theme.id;
  loadThemeFonts(theme.id);
  return theme;
}

function currentRoute() {
  return routeFromLocation(window.location.pathname, window.location.search) || { page: 'overview' };
}

function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [me, setMe] = useState(null);
  const [themeId, setThemeId] = useState(() => readCachedTheme());
  const [route, setRoute] = useState(currentRoute);
  const [events, setEvents] = useState([]);
  const [eventsState, setEventsState] = useState({ loading: true, error: null });
  // A message that outlives a change of look: the new frame mounts the page afresh.
  const [flash, setFlash] = useState('');
  // A message about the session itself, shown above every page.
  const [sessionNotice, setSessionNotice] = useState('');

  const theme = useMemo(() => applyTheme(themeId), [themeId]);

  // Choices of a look go to the server one after the other, so the last click is the one the
  // account keeps. `saved` is the look the server confirmed last; a failed choice returns to it.
  const themeSaves = useRef({ chain: Promise.resolve(), latest: 0, pending: 0, saved: themeId });

  const loadMe = useCallback(async () => {
    const data = await api('/admin/me');
    setMe(data);
    const saves = themeSaves.current;
    if (data?.adminTheme !== undefined) {
      saves.saved = data.adminTheme;
      // A choice still on its way wins over the account value that was read before it.
      if (!saves.pending) {
        setThemeId(data.adminTheme);
        writeCachedTheme(data.adminTheme);
      }
    }
    return data;
  }, []);

  const reloadEvents = useCallback(async () => {
    setEventsState((old) => ({ ...old, loading: true }));
    try {
      const list = await api('/admin/events?stats=1');
      setEvents(list || []);
      setEventsState({ loading: false, error: null });
    } catch (error) {
      setEventsState({ loading: false, error });
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    // Only an ended session leads back to the sign-in; any other failure is said out loud.
    loadMe().catch((error) => {
      if (error?.status === 401) setAuthenticated(false);
      else setSessionNotice(errorNotice({ message: `Dein Konto ließ sich nicht laden. ${error?.message || ''} Lade die Seite neu, sobald qrating wieder erreichbar ist.`.replace(/\s+/g, ' ').trim() }));
    });
    reloadEvents();
  }, [authenticated, loadMe, reloadEvents]);

  // Back and forward in the browser move through the admin area like links.
  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // An address that names no page, or an old one, is straightened to the page on screen.
  useEffect(() => {
    if (!authenticated) return;
    const address = pathForRoute(route);
    if (`${window.location.pathname}${window.location.search}` === address) return;
    if (route.page === 'event' && !route.eventId) return; // the event page picks one and writes it itself
    window.history.replaceState({ ...(window.history.state || {}) }, '', address);
  }, [authenticated, route]);

  // The route in a ref as well, so a click reads the page on screen without waiting for React.
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
    setFlash('');
  }, [route]);

  const go = useCallback((next, { replace = false } = {}) => {
    const current = routeRef.current;
    if (!replace && current.page === next.page && sameRoute(current, next)) return;
    const address = pathForRoute(next);
    if (replace) window.history.replaceState({ ...(window.history.state || {}) }, '', address);
    else window.history.pushState({}, '', address);
    routeRef.current = next;
    setRoute(next);
    if (!replace) window.scrollTo(0, 0);
  }, []);

  const chooseTheme = useCallback((id) => {
    const saves = themeSaves.current;
    const ticket = ++saves.latest;
    saves.pending += 1;
    setThemeId(id);
    writeCachedTheme(id);
    const request = saves.chain.then(() => api('/admin/me/preferences', { method: 'PATCH', body: JSON.stringify({ adminTheme: id }) }));
    saves.chain = request.catch(() => null);
    return request.then((saved) => {
      saves.saved = saved.adminTheme;
      setMe((old) => (old ? { ...old, adminTheme: saved.adminTheme } : old));
      return saved;
    }, (error) => {
      // The newest choice failed: the page returns to the look the account really keeps.
      if (ticket === saves.latest) {
        setThemeId(saves.saved);
        writeCachedTheme(saves.saved);
      }
      throw Object.assign(error, { keptTheme: saves.saved });
    }).finally(() => {
      saves.pending -= 1;
    });
  }, []);

  const logout = useCallback(async () => {
    setSessionNotice('');
    try {
      await api('/admin/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (error) {
      setSessionNotice(errorNotice({ message: `Das Abmelden hat nicht geklappt, du bist noch angemeldet. ${error?.message || ''} Versuch es gleich noch einmal.`.replace(/\s+/g, ' ').trim() }));
      return;
    }
    // A fresh page keeps nothing of this account for whoever signs in next on this device.
    window.location.assign('/admin');
  }, []);

  const inbox = theme.id === 'posteingang';
  const currentEvent = useMemo(() => pickCurrentEvent(events), [events]);
  const groups = useMemo(() => navGroups({ platformAdmin: me?.platformAdmin, inbox, currentEventId: currentEvent?.id || null }), [me?.platformAdmin, inbox, currentEvent?.id]);
  const counts = useMemo(() => ({ callbacks: events.reduce((sum, event) => sum + (event.stats?.openCases || 0), 0) }), [events]);
  const routeEvent = route.page === 'event' ? events.find((event) => event.id === route.eventId) : null;
  const title = routeTitle(route, { eventName: routeEvent?.name });

  useEffect(() => {
    document.title = `${title} · qrating`;
  }, [title]);

  const path = window.location.pathname;
  const query = new URLSearchParams(window.location.search);
  if (!authenticated && path.includes('/accept-invite')) return <AcceptInvite token={query.get('token')} onLogin={() => setAuthenticated(true)} />;
  if (!authenticated && path.includes('/reset-password')) return <ResetPassword token={query.get('token')} onLogin={() => setAuthenticated(true)} />;
  if (!authenticated) return <AuthGate onLogin={() => setAuthenticated(true)} />;

  const context = {
    me, theme, chooseTheme, route, go, events, eventsState, reloadEvents, currentEvent, reloadMe: loadMe, flash, setFlash
  };

  return <AdminContext.Provider value={context}>
    <Shell
      theme={theme}
      title={title}
      subtitle={me?.organization_name}
      groups={groups}
      activeKey={navKeyFor(route, { inbox })}
      go={go}
      counts={counts}
      me={me}
      events={events}
      route={route}
      onLogout={logout}
    >
      <ActingBanner me={me} />
      <Notice message={sessionNotice} className="mb-3" />
      <Page route={route} />
    </Shell>
  </AdminContext.Provider>;
}

function Page({ route }) {
  switch (route.page) {
    case 'events':
      return <EventsPage />;
    case 'event':
      return <EventWorkspace eventId={route.eventId} tab={route.tab} />;
    case 'callbacks':
      return <Callbacks />;
    case 'wallboard':
      return <WallboardPage eventId={route.eventId} />;
    case 'guest':
      return <GuestPage section={route.section} />;
    case 'settings':
      return <SettingsPage section={route.section} part={route.part} />;
    case 'platform':
      return <PlatformPage section={route.section} />;
    default:
      return <Overview />;
  }
}

export default AdminApp;
