import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { commandEntries, searchCommands } from './commandSearch.js';
import { dateBlock, eventPhase, formatDay } from './event/model.js';
import { menuMounted, menuShown, nextMenuState } from './navigation.js';
import { Button, Icon, useDismiss } from './ui.jsx';

// The frames around the pages. Each look picks one; all of them read the same menu groups
// (navigation.js) and all of them fold into the same drawer on a phone.

function badgeFor(item, counts) {
  if (!item.badge) return null;
  const value = counts?.[item.badge];
  return value ? <span className="q-badge">{value}</span> : null;
}

function NavItem({ item, activeKey, go, counts, className = 'q-nav-item', iconSize = 17 }) {
  return <button type="button" className={className} aria-current={item.key === activeKey ? 'page' : undefined} onClick={() => go(item.route)}>
    <Icon name={item.icon} size={iconSize} />
    <span className="min-w-0 truncate">{item.label}</span>
    {badgeFor(item, counts)}
  </button>;
}

function NavGroups({ groups, activeKey, go, counts, eventSubnav }) {
  return groups.map((group) => <nav key={group.id} aria-label={group.title || 'Hauptmenü'}>
    {group.title && <h4 className="q-nav-group-title">{group.title}</h4>}
    {group.items.map((item) => <React.Fragment key={item.key}>
      <NavItem item={item} activeKey={activeKey} go={go} counts={counts} />
      {item.key === 'events' && eventSubnav}
    </React.Fragment>)}
  </nav>);
}

function OrgButton({ me, go, className = 'q-org' }) {
  if (!me?.organization_name) return null;
  const content = <span className="min-w-0">
    <strong className="truncate">{me.organization_name}</strong>
    <small className="truncate">{me.acting ? 'als Plattform-Admin betreten' : me.organization_slug}</small>
  </span>;
  if (!me.platformAdmin) return <div className={className}>{content}</div>;
  return <button type="button" className={className} onClick={() => go({ page: 'platform', section: 'mandanten' })} title="Mandanten wechseln">
    {content}
    <Icon name="chevronsUpDown" size={15} />
  </button>;
}

// While a platform admin works inside another tenant, the way back stays in sight.
export function ActingBanner({ me }) {
  const [message, setMessage] = useState('');
  if (!me?.acting) return null;
  async function leave() {
    setMessage('');
    try {
      await api('/admin/platform/leave', { method: 'POST', body: '{}' });
      window.location.reload();
    } catch (error) {
      setMessage(error.message);
    }
  }
  return <div className="q-acting">
    <span>Du arbeitest als <strong>{me.organization_name}</strong>. Änderungen hier gehören diesem Mandanten.</span>
    <span className="flex items-center gap-3">
      {message && <span className="text-q-danger">{message}</span>}
      <Button icon="logout" size="sm" onClick={leave}>Zurück zu {me.home_organization_name}</Button>
    </span>
  </div>;
}

// ------------------------------------------------------------------ phone

function MobileChrome({ title, subtitle, groups, activeKey, go, counts, me, onLogout, onSearch }) {
  const [state, setState] = useState('closed');
  const opener = useRef(null);
  const panel = useRef(null);
  const mounted = menuMounted(state);
  const shown = menuShown(state);

  useEffect(() => {
    if (state !== 'closing') return undefined;
    const timer = setTimeout(() => setState((current) => nextMenuState(current, 'gone')), 200);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!mounted) return undefined;
    // The drawer lies over the page; the page behind it does not scroll.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setState((current) => nextMenuState(current, 'close'));
      opener.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [mounted]);

  useEffect(() => {
    if (shown) panel.current?.focus();
  }, [shown]);

  function close() {
    setState((current) => nextMenuState(current, 'close'));
    opener.current?.focus();
  }

  function pick(route) {
    go(route);
    close();
  }

  return <>
    <header className="q-mobilebar">
      <button ref={opener} type="button" className="q-btn q-btn-ghost q-btn-icon" style={{ color: 'inherit' }} aria-label="Menü öffnen" aria-expanded={shown} aria-controls="admin-menu" onClick={() => setState((current) => nextMenuState(current, 'open'))}>
        <Icon name="menu" size={22} />
      </button>
      <div className="title">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {onSearch && <button type="button" className="q-btn q-btn-ghost q-btn-icon ml-auto" style={{ color: 'inherit' }} aria-label="Suchen" onClick={onSearch}><Icon name="search" size={20} /></button>}
    </header>
    {mounted && <div className="fixed inset-0 z-50 lg:hidden">
      <div className={`absolute inset-0 bg-black/50 ${shown ? 'scrim' : 'scrim-closing'}`} onClick={close} aria-hidden="true" />
      <div id="admin-menu" ref={panel} role="dialog" aria-modal="true" aria-label="Navigation" tabIndex={-1} className={`q-drawer ${shown ? 'drawer' : 'drawer-closing'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="q-brand" style={{ color: 'inherit' }}>qrating</span>
          <button type="button" className="q-btn q-btn-ghost q-btn-icon" style={{ color: 'inherit' }} aria-label="Menü schließen" onClick={close}><Icon name="x" size={20} /></button>
        </div>
        <OrgButton me={me} go={pick} />
        <NavGroups groups={groups} activeKey={activeKey} go={pick} counts={counts} />
        <div className="q-sidebar-foot mt-4">
          <button type="button" className="q-nav-item" onClick={onLogout}><Icon name="logout" size={17} />Abmelden</button>
        </div>
      </div>
    </div>}
  </>;
}

// ------------------------------------------------------------------ 1, 5, 7, 9: sidebar

function EventSubnav({ events, route, go }) {
  const now = new Date();
  const shown = events
    .filter((event) => eventPhase(event, now) !== 'past' || event.id === route.eventId)
    .sort((a, b) => new Date(a.date_from) - new Date(b.date_from))
    .slice(0, 3);
  return <div className="q-subnav">
    {shown.map((event) => <button key={event.id} type="button" className="q-nav-item" aria-current={route.page === 'event' && route.eventId === event.id ? 'page' : undefined} onClick={() => go({ page: 'event', eventId: event.id, tab: 'auswertung' })}>
      <span className="truncate">{event.name.split(/\s[–-]\s/)[0]}</span>
    </button>)}
    <button type="button" className="q-nav-item" aria-current={route.page === 'events' ? 'page' : undefined} onClick={() => go({ page: 'events' })}>Alle Events</button>
  </div>;
}

function SidebarShell({ theme, groups, activeKey, go, counts, me, events, route, onLogout, children }) {
  return <div className="q-app q-with-sidebar">
    <aside className="q-sidebar">
      <span className="q-brand">{theme.id === 'schwarzlicht' ? <>qrat<em>ing</em></> : 'qrating'}</span>
      <OrgButton me={me} go={go} />
      <NavGroups
        groups={groups}
        activeKey={activeKey}
        go={go}
        counts={counts}
        eventSubnav={theme.id === 'baendchen' && events.length ? <EventSubnav events={events} route={route} go={go} /> : null}
      />
      <div className="q-sidebar-foot">
        <button type="button" className="q-nav-item" onClick={onLogout}><Icon name="logout" size={17} />Abmelden</button>
      </div>
    </aside>
    {children}
  </div>;
}

// ------------------------------------------------------------------ 2, 8, 10: bar on top

function TopMenu({ group, activeKey, go }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, () => setOpen(false), open);
  const current = group.items.some((item) => item.key === activeKey);
  return <div ref={box} className="relative flex">
    <button type="button" className="q-topbar-link" aria-expanded={open} aria-current={current ? 'page' : undefined} onClick={() => setOpen(!open)}>
      {group.title}<Icon name="chevronDown" size={14} />
    </button>
    {open && <div className="q-menu left-0" role="menu" style={{ minWidth: 300 }}>
      {group.items.map((item) => <button key={item.key} type="button" role="menuitem" className="q-menu-item" aria-current={item.key === activeKey ? 'true' : undefined} onClick={() => { setOpen(false); go(item.route); }}>
        <Icon name={item.icon} size={16} />{item.label}{item.hint && <small>{item.hint}</small>}
      </button>)}
    </div>}
  </div>;
}

function UserMenu({ me, go, onLogout }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, () => setOpen(false), open);
  const initial = (me?.name || me?.email || '?').trim().charAt(0).toUpperCase();
  return <div ref={box} className="relative flex items-center gap-2">
    <span className="hidden xl:inline">{me?.name}</span>
    <button type="button" className="q-avatar" aria-label="Konto" aria-expanded={open} onClick={() => setOpen(!open)}>{initial}</button>
    {open && <div className="q-menu right-0" role="menu" style={{ top: 'calc(100% + 8px)' }}>
      <p className="q-menu-title">{me?.email}</p>
      <button type="button" role="menuitem" className="q-menu-item" onClick={() => { setOpen(false); go({ page: 'settings', section: 'darstellung' }); }}><Icon name="design" />Design wählen</button>
      <button type="button" role="menuitem" className="q-menu-item" onClick={() => { setOpen(false); go({ page: 'settings', section: 'sicherheit' }); }}><Icon name="shield" />2FA und Sicherheit</button>
      <hr />
      <button type="button" role="menuitem" className="q-menu-item" onClick={onLogout}><Icon name="logout" />Abmelden</button>
    </div>}
  </div>;
}

function TopbarShell({ groups, activeKey, go, counts, me, onLogout, children }) {
  const [main, ...menus] = groups;
  return <div className="q-app">
    <header className="q-topbar">
      <span className="q-brand">qrating</span>
      {me?.platformAdmin
        ? <button type="button" className="q-topbar-org" onClick={() => go({ page: 'platform', section: 'mandanten' })}>{me?.organization_name}<Icon name="chevronDown" size={14} /></button>
        : <span className="q-topbar-org">{me?.organization_name}</span>}
      <nav className="q-topbar-nav" aria-label="Hauptmenü">
        {main.items.map((item) => <button key={item.key} type="button" className="q-topbar-link" aria-current={item.key === activeKey ? 'page' : undefined} onClick={() => go(item.route)}>
          {item.label}{badgeFor(item, counts)}
        </button>)}
        {menus.map((group) => <TopMenu key={group.id} group={group} activeKey={activeKey} go={go} />)}
      </nav>
      <div className="q-topbar-right"><UserMenu me={me} go={go} onLogout={onLogout} /></div>
    </header>
    {children}
  </div>;
}

// ------------------------------------------------------------------ 3: rail

function RailShell({ groups, activeKey, go, counts, onLogout, children }) {
  const [main, guest, settings, platform] = groups;
  const settingsActive = activeKey.startsWith('settings:');
  const platformActive = activeKey.startsWith('platform:');
  const railItem = (item) => <NavItem key={item.key} item={item} activeKey={activeKey} go={go} counts={counts} className="q-rail-item" iconSize={20} />;
  return <div className="q-app q-with-rail">
    <nav className="q-rail" aria-label="Hauptmenü">
      <button type="button" className="q-rail-logo" aria-label="Übersicht" onClick={() => go({ page: 'overview' })}>q</button>
      {main.items.map(railItem)}
      <hr />
      {guest.items.map(railItem)}
      <hr />
      <button type="button" className="q-rail-item" aria-current={settingsActive ? 'page' : undefined} onClick={() => go(settings.items[0].route)}><Icon name="settings" size={20} />Einstellungen</button>
      {platform && <button type="button" className="q-rail-item" aria-current={platformActive ? 'page' : undefined} onClick={() => go(platform.items[0].route)}><Icon name="tenants" size={20} />Plattform</button>}
      <button type="button" className="q-rail-item" style={{ marginTop: 'auto' }} onClick={onLogout}><Icon name="logout" size={20} />Abmelden</button>
    </nav>
    {children}
  </div>;
}

// ------------------------------------------------------------------ 4: the event list is the menu

const phaseTitles = { live: 'Läuft', soon: 'Demnächst', past: 'Vorbei' };

export function eventGroups(events = [], now = new Date()) {
  const groups = { live: [], soon: [], past: [] };
  for (const event of events) groups[eventPhase(event, now)].push(event);
  groups.live.sort((a, b) => new Date(a.date_from) - new Date(b.date_from));
  groups.soon.sort((a, b) => new Date(a.date_from) - new Date(b.date_from));
  groups.past.sort((a, b) => new Date(b.date_from) - new Date(a.date_from));
  return ['live', 'soon', 'past'].map((phase) => ({ phase, title: phaseTitles[phase], events: groups[phase] })).filter((group) => group.events.length);
}

function eventStateLine(event, phase) {
  const stats = event.stats || {};
  if (phase === 'live') return 'Runde offen';
  if (phase === 'soon') {
    const questions = stats.questionCount;
    return questions === null || questions === undefined ? formatDay(event.date_from, event.event_timezone) : `${questions} ${questions === 1 ? 'Frage' : 'Fragen'}`;
  }
  return stats.votes ? `${stats.votes} Stimmen, Schnitt ${String(stats.averageRating ?? '–').replace('.', ',')}` : 'keine Stimmen';
}

function EventListShell({ groups, activeKey, go, counts, me, events, route, onLogout, children }) {
  const [main, guest, settings, platform] = groups;
  const lists = eventGroups(events);
  const foot = [
    main.items.find((item) => item.key === 'overview'),
    main.items.find((item) => item.key === 'callbacks'),
    main.items.find((item) => item.key === 'wallboard'),
    { key: 'guest', label: 'Gästeseite', icon: 'texts', route: guest.items[0].route },
    { key: 'settings', label: 'Einstellungen', icon: 'settings', route: settings.items[0].route },
    ...(platform ? [{ key: 'platform', label: 'Plattform', icon: 'tenants', route: platform.items[0].route }] : [])
  ];
  const footKey = activeKey.split(':')[0];
  return <div className="q-app q-with-eventlist">
    <aside className="q-eventlist">
      <div className="q-eventlist-head">
        <span className="q-brand">qrating</span>
        {me?.platformAdmin
          ? <button type="button" className="q-topbar-org" onClick={() => go({ page: 'platform', section: 'mandanten' })}>{me?.organization_name}<Icon name="chevronsUpDown" size={14} /></button>
          : <span className="q-topbar-org">{me?.organization_name}</span>}
      </div>
      <nav className="q-eventlist-list" aria-label="Events">
        {lists.map((group) => <div key={group.phase}>
          <h4>{group.title}</h4>
          {group.events.map((event) => {
            const block = dateBlock(event.date_from, event.event_timezone);
            return <button key={event.id} type="button" className="q-ev" aria-current={route.page === 'event' && route.eventId === event.id ? 'page' : undefined} onClick={() => go({ page: 'event', eventId: event.id, tab: route.page === 'event' ? route.tab : 'auswertung' })}>
              <span className="q-ev-date"><b>{block.day}</b><small>{block.month}</small></span>
              <span className="min-w-0">
                <span className="q-ev-name block">{event.name}</span>
                <span className={`q-ev-state block ${group.phase === 'live' ? 'live' : ''}`}>{eventStateLine(event, group.phase)}</span>
              </span>
            </button>;
          })}
        </div>)}
        {!events.length && <p className="p-3 text-q-muted">Noch keine Events.</p>}
        <button type="button" className="q-nav-item mt-2" style={{ color: 'rgb(var(--q-muted))' }} onClick={() => go({ page: 'events' })}><Icon name="plus" size={15} />Event anlegen</button>
      </nav>
      <div className="q-eventlist-foot">
        {foot.map((item) => <button key={item.key} type="button" className="q-nav-item" aria-current={item.key === footKey ? 'page' : undefined} onClick={() => go(item.route)}>
          <Icon name={item.icon} size={17} />{item.label}{badgeFor(item, counts)}
        </button>)}
        <button type="button" className="q-nav-item" onClick={onLogout}><Icon name="logout" size={17} />Abmelden</button>
      </div>
    </aside>
    {children}
  </div>;
}

// ------------------------------------------------------------------ 6: command bar

export function CommandPalette({ open, onClose, go, events, me }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef(null);
  const entries = useMemo(() => commandEntries({ events, platformAdmin: me?.platformAdmin, eventDate: (event) => formatDay(event.date_from, event.event_timezone) }), [events, me?.platformAdmin]);
  const hits = useMemo(() => searchCommands(entries, query), [entries, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  function choose(entry) {
    if (!entry) return;
    onClose();
    go(entry.route);
  }

  function onKey(event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((index) => Math.min(hits.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((index) => Math.max(0, index - 1)); }
    if (event.key === 'Enter') { event.preventDefault(); choose(hits[selected]); }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  }

  let lastGroup = null;
  return <>
    <div className="q-palette-scrim" onClick={onClose} aria-hidden="true" />
    <div className="q-palette" role="dialog" aria-modal="true" aria-label="Suchen und springen">
      <div className="q-palette-input">
        <Icon name="search" size={18} />
        <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} placeholder="Event, Seite oder Einstellung suchen …" aria-label="Suchen" aria-controls="palette-list" aria-activedescendant={hits[selected] ? `hit-${selected}` : undefined} />
        <kbd className="q-kbd">Esc</kbd>
      </div>
      <div id="palette-list" className="q-palette-list" role="listbox">
        {hits.map((entry, index) => {
          const header = entry.group !== lastGroup ? <h5 key={`h-${entry.group}`}>{entry.group}</h5> : null;
          lastGroup = entry.group;
          return <React.Fragment key={entry.id}>
            {header}
            <button id={`hit-${index}`} type="button" role="option" aria-selected={index === selected} className="q-palette-item" onMouseEnter={() => setSelected(index)} onClick={() => choose(entry)}>
              <Icon name={entry.icon} size={16} />
              <span className="grow truncate">{entry.label}</span>
              {entry.note && <small>{entry.note}</small>}
              {index === selected && <kbd className="q-kbd">Enter</kbd>}
            </button>
          </React.Fragment>;
        })}
        {!hits.length && <p className="px-3 py-4 text-q-muted">Nichts gefunden. Probier einen Teil des Eventnamens oder ein Wort wie „Pretix“ oder „Impressum“.</p>}
      </div>
      <div className="q-palette-foot"><span><kbd className="q-kbd">↑</kbd> <kbd className="q-kbd">↓</kbd> auswählen</span><span><kbd className="q-kbd">Enter</kbd> öffnen</span><span><kbd className="q-kbd">Esc</kbd> schließen</span></div>
    </div>
  </>;
}

function CommandShell({ go, counts, me, onLogout, onSearch, children }) {
  return <div className="q-app">
    <header className="q-cmdbar">
      <div className="q-cmdbar-left">
        <span className="q-brand">qrating</span>
        {me?.platformAdmin
          ? <button type="button" className="q-topbar-org" onClick={() => go({ page: 'platform', section: 'mandanten' })}>{me?.organization_name}<Icon name="chevronDown" size={14} /></button>
          : <span className="q-topbar-org">{me?.organization_name}</span>}
      </div>
      <button type="button" className="q-cmd" onClick={onSearch} aria-label="Suchen und springen (Strg K)">
        <Icon name="search" size={17} /><span className="grow">Suchen oder springen …</span><kbd className="q-kbd">Strg K</kbd>
      </button>
      <div className="q-cmdbar-right">
        <button type="button" className="q-btn q-btn-ghost q-btn-icon" aria-label="Rückrufe" onClick={() => go({ page: 'callbacks' })}>
          <Icon name="callbacks" size={18} />{counts?.callbacks ? <span className="q-badge">{counts.callbacks}</span> : null}
        </button>
        <button type="button" className="q-btn q-btn-ghost q-btn-icon" aria-label="Einstellungen" onClick={() => go({ page: 'settings', section: 'organisation' })}><Icon name="settings" size={18} /></button>
        <UserMenu me={me} go={go} onLogout={onLogout} />
      </div>
    </header>
    {children}
  </div>;
}

// ------------------------------------------------------------------ the frame of the chosen look

export function Shell(props) {
  const { theme, title, subtitle, groups, activeKey, go, counts, me, onLogout, events, route, children } = props;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const command = theme.shell === 'command';

  // Strg K and Cmd K open the search of the command look from anywhere.
  useEffect(() => {
    if (!command) return undefined;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [command]);

  const main = <main className="q-main">{children}</main>;
  const mobile = <MobileChrome title={title} subtitle={subtitle} groups={groups} activeKey={activeKey} go={go} counts={counts} me={me} onLogout={onLogout} onSearch={command ? () => setPaletteOpen(true) : null} />;
  const shared = { theme, groups, activeKey, go, counts, me, events, route, onLogout };
  let frame;
  if (theme.shell === 'topbar' || theme.shell === 'menubar') frame = <TopbarShell {...shared}>{mobile}{main}</TopbarShell>;
  else if (theme.shell === 'rail') frame = <RailShell {...shared}>{mobile}{main}</RailShell>;
  else if (theme.shell === 'eventlist') frame = <EventListShell {...shared}>{mobile}{main}</EventListShell>;
  else if (command) frame = <CommandShell {...shared} onSearch={() => setPaletteOpen(true)}>{mobile}{main}</CommandShell>;
  else frame = <SidebarShell {...shared}>{mobile}{main}</SidebarShell>;
  return <>
    {frame}
    {command && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} go={go} events={events} me={me} />}
  </>;
}

