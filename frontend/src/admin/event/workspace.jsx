import React, { useEffect, useState } from 'react';
import { api, assetUrl } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventTabs } from '../navigation.js';
import { Button, ErrorBox, Icon, Loading, Notice, Page, Stars, Tabs, useAsync } from '../ui.jsx';
import { EventSwitcher, PreviewButton, ReportMenu } from './actions.jsx';
import { Analytics, InboxStream, KpiInline } from './analytics.jsx';
import { dateBlock, formatDateLine, formatLongDate, formatWhen, kpis, recentActivity, roundInfo, timelineModel } from './model.js';
import { EventSettingsTab, QrTab, QuestionsTab } from './tabs.jsx';
import { EventsTable } from '../pages/events.jsx';

// One event with its four tabs. Every look draws its own header around the same tabs; the
// evaluation inside follows the draft of the look (analytics.jsx).
export function EventWorkspace({ eventId, tab }) {
  const { events, eventsState, currentEvent, go, theme, reloadEvents } = useAdmin();
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const event = events.find((item) => item.id === eventId) || null;

  // An address without an event, or with one that is gone, opens the current event instead
  // and says so. The address follows, so a reload lands on the same page.
  useEffect(() => {
    if (eventsState.loading || event || !currentEvent) return;
    if (eventId) setMessage('Dieses Event gibt es nicht mehr. Hier ist das aktuelle.');
    go({ page: 'event', eventId: currentEvent.id, tab }, { replace: true });
  }, [eventId, event, eventsState.loading, currentEvent, tab, go]);

  const { data: analytics, error } = useAsync(() => (event ? api(`/admin/events/${event.id}/analytics`) : Promise.resolve(null)), [event?.id, reload]);
  const refresh = () => {
    setReload((value) => value + 1);
    reloadEvents();
  };

  if (!event) {
    if (eventsState.loading) return <Loading />;
    return <Page title="Events"><p className="text-q-muted">Noch kein Event. Lege unter Events eines an oder hole deine Events aus Pretix.</p>
      <div><Button variant="primary" icon="plus" onClick={() => go({ page: 'events' })}>Event anlegen</Button></div></Page>;
  }

  const setTab = (id) => go({ page: 'event', eventId: event.id, tab: id });
  const content = tab === 'fragen' ? <QuestionsTab event={event} onChanged={reloadEvents} />
    : tab === 'qr' ? <QrTab event={event} />
      : tab === 'einstellungen' ? <EventSettingsTab event={event} onChanged={refresh} />
        : <Analytics themeId={theme.id} event={event} analytics={analytics} onChanged={refresh} />;
  const Frame = frames[theme.id] || BandFrame;
  const shared = { event, tab, setTab, analytics, onMessage: setMessage, onChanged: refresh };
  return <div className={`ws ws-${theme.id}`}>
    <Notice message={message} className="mb-3" />
    <ErrorBox error={error} className="mb-3" />
    <Frame {...shared}>{content}</Frame>
  </div>;
}

function useRound(event) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { round: roundInfo(event, now), now };
}

function meta(event) {
  return [formatLongDate(event.date_from, event.event_timezone), event.location ? `in ${event.location}` : null].filter(Boolean).join(' ');
}

const sourceName = (event) => (event.source === 'pretix' ? 'aus Pretix' : 'von Hand angelegt');

// ------------------------------------------------------------------ 1 Bändchen

function BandFrame({ event, tab, setTab, onMessage, children }) {
  const { go } = useAdmin();
  const { round } = useRound(event);
  return <>
    <div className="crumb">
      <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => go({ page: 'events' })}>Events</button>
      <Icon name="chevronRight" size={14} />
      <EventSwitcher event={event} tab={tab} className="q-btn q-btn-secondary q-btn-sm" label={<span className="truncate">{event.name.split(/\s[–-]\s/)[0]}</span>} />
    </div>
    <div className="sig-band">
      <span className="snap" aria-hidden="true" />
      <div className="min-w-0">
        <h1>{event.name}</h1>
        <p className="meta">{meta(event)}. {sourceName(event)[0].toUpperCase() + sourceName(event).slice(1)}.</p>
      </div>
      <span className="round">{round.state === 'open' ? round.label : round.short}</span>
      <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} className="band-btn" />
      <ReportMenu event={event} onMessage={onMessage} className="band-btn" />
    </div>
    <Tabs items={eventTabs} active={tab} onSelect={setTab} className="ws-tabs" label="Bereiche des Events" />
    {children}
  </>;
}

// ------------------------------------------------------------------ 2 Einlassliste

function SheetFrame({ event, tab, setTab, onMessage, children }) {
  const { round } = useRound(event);
  return <div className="sheet">
    <div className="sheet-top">
      <div className="min-w-0">
        <h1 className="q-h1">{event.name}</h1>
        <p className="meta">{formatDateLine(event.date_from, event.event_timezone)}{event.location ? `, ${event.location}` : ''}. <mark>{round.state === 'open' ? round.label : round.short}</mark></p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <EventSwitcher event={event} tab={tab} label="Anderes Event" align="right" />
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
        <ReportMenu event={event} onMessage={onMessage} className="q-btn q-btn-primary" />
      </div>
    </div>
    <Tabs items={eventTabs.map(({ icon, ...item }) => item)} active={tab} onSelect={setTab} className="sheet-tabs" label="Bereiche des Events" />
    <div className={tab === 'auswertung' ? '' : 'sheet-pad'}>{children}</div>
  </div>;
}

// ------------------------------------------------------------------ 3 Mischpult

function LcdFrame({ event, tab, setTab, onMessage, children }) {
  const { round } = useRound(event);
  return <>
    <div className="sig-top">
      <div className="lcd">
        <div className="min-w-0"><div className="name">{event.name}</div><div className="sub">{meta(event)}</div></div>
        <div className={`live ${round.state === 'open' ? '' : 'idle'}`}><i />{round.short}</div>
        <EventSwitcher event={event} tab={tab} className="pick" label="Event wechseln" align="right" />
      </div>
      <div className="flex gap-2">
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} className="q-btn q-btn-secondary key" />
        <ReportMenu event={event} onMessage={onMessage} className="q-btn q-btn-secondary key" />
      </div>
    </div>
    <div className="key-tabs" role="tablist" aria-label="Bereiche des Events">
      {eventTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} className="q-btn q-btn-secondary key" onClick={() => setTab(item.id)}><Icon name={item.icon} size={16} />{item.label}</button>)}
    </div>
    {children}
  </>;
}

// ------------------------------------------------------------------ 4 Ablaufplan

function Timeline({ event, analytics }) {
  const { now } = useRound(event);
  const line = timelineModel(event, analytics?.timeline || [], now);
  const round = roundInfo(event, now);
  if (!line) return null;
  return <section className="plan">
    <div className="top"><b>Die Runde</b><span>{round.start && round.end ? `offen von ${formatWhen(round.start, event.event_timezone)} bis ${formatWhen(round.end, event.event_timezone)}` : round.label}</span></div>
    <div className="tl">
      <div className="bars">{line.bars.map((bar, index) => <i key={index} style={{ left: `${bar.left}%`, height: `${Math.max(3, bar.height * 54)}px` }} title={`${bar.count} Stimmen`} />)}</div>
      <div className="track" />
      <div className="round" style={{ left: `${line.round.left}%`, width: `${line.round.width}%` }} />
      <div className="start" style={{ left: `${line.eventStart}%` }} title="Beginn des Events" />
      {line.now !== null && <div className="now" style={{ left: `${line.now}%` }}><span className={line.now > 80 ? 'flip' : ''}>{line.nowLabel}</span></div>}
      <div className="days">
        <span style={{ left: 0, transform: 'none' }}>{line.startLabel}</span>
        {line.days.map((day) => <span key={day.left} className="tick" style={{ left: `${day.left}%` }}>{day.label}</span>)}
      </div>
    </div>
    <div className="legend"><span><i className="bar" />Stimmen je Stunde</span><span><i className="rnd" />Bewertungszeit</span><span><i className="nw" />Jetzt</span></div>
  </section>;
}

function PlanFrame({ event, tab, setTab, analytics, onMessage, children }) {
  return <>
    <div className="plan-title">
      <div className="min-w-0"><h1 className="q-h1">{event.name}</h1><p className="text-q-muted">{meta(event)}, {sourceName(event)}</p></div>
      <div className="flex flex-wrap gap-2">
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} label="Gästeseite ansehen" />
        <ReportMenu event={event} onMessage={onMessage} className="q-btn q-btn-primary" />
      </div>
    </div>
    <Timeline event={event} analytics={analytics} />
    <div className="pill-tabs" role="tablist" aria-label="Bereiche des Events">
      {eventTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} onClick={() => setTab(item.id)}><Icon name={item.icon} size={15} />{item.label}</button>)}
    </div>
    {children}
  </>;
}

// ------------------------------------------------------------------ 5 Eintrittskarte

function TicketFrame({ event, tab, setTab, analytics, onMessage, children }) {
  const { round } = useRound(event);
  const block = dateBlock(event.date_from, event.event_timezone);
  const longMonth = new Date(event.date_from).toLocaleDateString('de-DE', { month: 'long', timeZone: event.event_timezone || 'Europe/Berlin' });
  const weekday = new Date(event.date_from).toLocaleDateString('de-DE', { weekday: 'long', timeZone: event.event_timezone || 'Europe/Berlin' });
  return <>
    <section className="ticket">
      <div className="stub"><b>{block.day}</b><span>{longMonth}</span><small>{weekday}, {formatWhen(event.date_from, event.event_timezone).split(' ')[1]}</small></div>
      <div className="perf" aria-hidden="true" />
      <div className="body">
        <div className="row1">
          <div className="min-w-0"><h1 className="q-h1">{event.name}</h1><p className="meta">{[event.location, sourceName(event)].filter(Boolean).join(', ')}</p></div>
          <div className={`stamp ${round.state === 'open' ? '' : 'idle'}`}><b>{round.state === 'open' ? 'Runde offen' : round.short}</b>{round.state === 'open' && round.end && <small>bis {formatWhen(round.end, event.event_timezone)}</small>}</div>
          <div className="flex flex-wrap gap-2">
            <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
            <ReportMenu event={event} onMessage={onMessage} />
          </div>
        </div>
        {analytics && <KpiInline k={kpis(analytics)} />}
      </div>
    </section>
    <div className="seg-tabs" role="tablist" aria-label="Bereiche des Events">
      {eventTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} onClick={() => setTab(item.id)}><Icon name={item.icon} size={15} />{item.label}</button>)}
    </div>
    {children}
  </>;
}

// ------------------------------------------------------------------ 6 Kommandozeile

function CrumbFrame({ event, tab, setTab, onMessage, children }) {
  const { go } = useAdmin();
  const { round } = useRound(event);
  // The digits 1 to 4 switch the tabs while no field has the keyboard.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < eventTabs.length) setTab(eventTabs[index].id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setTab]);
  return <>
    <div className="crumbs">
      <button type="button" className="q-btn q-btn-ghost q-btn-sm" onClick={() => go({ page: 'events' })}>Events</button>
      <Icon name="chevronRight" size={14} />
      <EventSwitcher event={event} tab={tab} className="crumb-title" label={<b>{event.name}</b>} />
      <span className={`q-pill ${round.state === 'open' ? 'q-pill-live' : 'q-pill-soon'}`}>{round.short}</span>
      <span className="acts">
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
        <ReportMenu event={event} onMessage={onMessage} />
      </span>
    </div>
    <Tabs items={eventTabs.map((item, index) => ({ id: item.id, label: item.label, kbd: String(index + 1) }))} active={tab} onSelect={setTab} className="cmd-tabs" label="Bereiche des Events" />
    {children}
  </>;
}

// ------------------------------------------------------------------ 7 Posteingang

function InboxFrame({ event, tab, setTab, analytics, onMessage, onChanged, children }) {
  const { round } = useRound(event);
  const tabRow = <div className="flex flex-wrap gap-1.5">
    {eventTabs.map((item) => <button key={item.id} type="button" className="q-chip" aria-pressed={item.id === tab} onClick={() => setTab(item.id)}><Icon name={item.icon} size={14} />{item.id === 'auswertung' ? 'Stimmen' : item.label}</button>)}
  </div>;
  if (tab !== 'auswertung') {
    return <>
      <div className="inbox-head">
        <div className="min-w-0"><h1 className="q-h1">{event.name}</h1><p className="text-q-muted">{meta(event)}</p></div>
        {tabRow}
      </div>
      {children}
    </>;
  }
  const header = <>
    <div className="t">
      <h1 className="q-h1">Stimmen</h1>
      <ReportMenu event={event} onMessage={onMessage} />
    </div>
    <EventSwitcher event={event} tab={tab} className="ev" label={<span className="truncate">{event.name}, {formatWhen(event.date_from, event.event_timezone)}</span>} />
  </>;
  return <>
    <div className="inbox-round">
      <span className={`dot ${round.state === 'open' ? '' : 'idle'}`} aria-hidden="true" />
      <div className="min-w-0"><b>{round.state === 'open' ? 'Runde offen' : round.short}</b><p>{round.state === 'open' ? `${round.label.replace('Runde offen ', '')}, ${round.left}` : round.label}</p></div>
      <div className="acts">
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
        <Button icon="questions" onClick={() => setTab('fragen')}>Fragen</Button>
        <Button icon="qr" onClick={() => setTab('qr')}>QR</Button>
        <Button icon="settings" aria-label="Einstellungen des Events" onClick={() => setTab('einstellungen')} />
      </div>
    </div>
    <InboxStream event={event} analytics={analytics} onChanged={onChanged} header={header} />
  </>;
}

// ------------------------------------------------------------------ 8 Plakat

function PosterFrame({ event, tab, setTab, onMessage, children }) {
  const { round } = useRound(event);
  const [head, ...rest] = event.name.split(/\s[–-]\s/);
  const date = new Date(event.date_from).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: event.event_timezone || 'Europe/Berlin' });
  const image = event.image_url ? assetUrl(event.image_url) : null;
  return <>
    <section className={`poster ${image ? 'with-image' : ''}`} style={image ? { '--poster-image': `url("${image}")` } : undefined}>
      <div className="big">
        <span className={head.length > 18 ? 'long' : ''}>{head}</span>
        {rest.length > 0 && <span className="outline">{rest.join(' – ')}</span>}
      </div>
      <div className="date">{date}<small>{formatLongDate(event.date_from, event.event_timezone).split(', ')[0]}, {formatWhen(event.date_from, event.event_timezone).split(' ')[1]}{event.location ? `, ${event.location}` : ''}</small></div>
    </section>
    <div className="poster-bar">
      <span className="live"><i className={round.state === 'open' ? '' : 'idle'} />{round.state === 'open' ? round.label : round.short}</span>
      <EventSwitcher event={event} tab={tab} className="q-btn q-btn-secondary" label="Anderes Event" />
      <span className="acts">
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
        <ReportMenu event={event} onMessage={onMessage} className="q-btn q-btn-primary" />
      </span>
    </div>
    <Tabs items={eventTabs.map(({ icon, ...item }) => item)} active={tab} onSelect={setTab} className="poster-tabs" label="Bereiche des Events" />
    {children}
  </>;
}

// ------------------------------------------------------------------ 9 Schwarzlicht

function LiveFrame({ event, tab, setTab, analytics, onMessage, children }) {
  const { round, now } = useRound(event);
  const activity = recentActivity(analytics?.voices || [], now);
  return <>
    <div className="live-head">
      <div className="min-w-0"><h1 className="q-h1">{event.name}</h1><p className="text-q-muted">{meta(event)}</p></div>
      <div className="flex flex-wrap gap-2">
        <EventSwitcher event={event} tab={tab} label="Event wechseln" align="right" />
        <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
        <ReportMenu event={event} onMessage={onMessage} className="q-btn q-btn-primary" />
      </div>
    </div>
    <div className={`live-band ${round.state === 'open' ? '' : 'idle'}`}>
      <span className="dot" aria-hidden="true" />
      <div className="min-w-0"><b>{round.state === 'open' ? 'Runde offen' : round.short}</b> <span className="txt">{round.state === 'open' ? `${round.label.replace('Runde offen ', '')}. ` : ''}{activity.lastHour ? `In der letzten Stunde ${activity.lastHour} neue ${activity.lastHour === 1 ? 'Stimme' : 'Stimmen'}.` : 'In der letzten Stunde keine neue Stimme.'}</span></div>
      <div className="ticker">
        {activity.latest.map((item) => <div key={item.id}><span className="s"><Stars rating={item.rating} size={11} /></span><small>{item.ago}</small></div>)}
      </div>
    </div>
    <Tabs items={eventTabs} active={tab} onSelect={setTab} className="live-tabs" label="Bereiche des Events" />
    {children}
  </>;
}

// ------------------------------------------------------------------ 10 Tabellenwerk

function TableFrame({ event, tab, setTab, onMessage, children }) {
  const { round } = useRound(event);
  return <>
    <EventsTable selectedId={event.id} selectedTab={tab} />
    <section className="detail">
      <div className="dh">
        <h2>{event.name}</h2>
        <span className="text-q-muted">{round.state === 'open' ? round.label : round.short}</span>
        <div className="small-tabs" role="tablist" aria-label="Bereiche des Events">
          {eventTabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === tab} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>
        <div className="acts">
          <PreviewButton event={event} onError={(err) => onMessage({ tone: 'error', text: err.message })} />
          <ReportMenu event={event} onMessage={onMessage} label="CSV, Excel, PDF" />
        </div>
      </div>
      <div className={tab === 'auswertung' ? '' : 'p-4'}>{children}</div>
    </section>
  </>;
}

const frames = {
  baendchen: BandFrame,
  einlassliste: SheetFrame,
  mischpult: LcdFrame,
  ablaufplan: PlanFrame,
  eintrittskarte: TicketFrame,
  kommandozeile: CrumbFrame,
  posteingang: InboxFrame,
  plakat: PosterFrame,
  schwarzlicht: LiveFrame,
  tabellenwerk: TableFrame
};
