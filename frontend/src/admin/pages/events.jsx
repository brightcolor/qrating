import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { dateBlock, eventPhase, formatAverage, formatDateLine, formatDayTime, roundInfo } from '../event/model.js';
import { eventGroups } from '../shells.jsx';
import { Button, ErrorBox, EventsUnavailable, Field, Icon, Input, Loading, Page, Panel } from '../ui.jsx';

// All events of the organisation. A new event starts here; everything about one event lives
// inside it (workspace.jsx).
export function EventsPage() {
  const { theme, events, eventsState, reloadEvents } = useAdmin();
  const [creating, setCreating] = useState(false);
  const actions = <Button variant="primary" icon="plus" onClick={() => setCreating(!creating)}>Neues Event</Button>;
  if (theme.id === 'tabellenwerk') {
    return <div className="grid gap-3">
      {creating && <EventCreate onDone={() => setCreating(false)} />}
      <EventsTable onCreate={() => setCreating(!creating)} />
    </div>;
  }
  return <Page title="Events" subtitle="Events aus Pretix kommen von selbst dazu. Von Hand angelegte stehen daneben." actions={actions}>
    {creating && <EventCreate onDone={() => setCreating(false)} />}
    <EventsUnavailable error={eventsState.error} onRetry={reloadEvents} />
    {eventsState.loading && !events.length && <Loading />}
    {!eventsState.loading && !eventsState.error && !events.length && <Panel><p className="text-q-muted">Noch kein Event. Lege eines an oder verbinde Pretix unter Einstellungen → Verbindungen.</p></Panel>}
    {eventGroups(events).map((group) => <Panel key={group.phase} title={group.title} note={`${group.events.length}`}>
      <div className="grid">
        {group.events.map((event) => <EventRow key={event.id} event={event} phase={group.phase} />)}
      </div>
    </Panel>)}
  </Page>;
}

function EventRow({ event, phase }) {
  const { go } = useAdmin();
  const block = dateBlock(event.date_from, event.event_timezone);
  const stats = event.stats || {};
  const round = roundInfo(event);
  const open = (tab) => go({ page: 'event', eventId: event.id, tab });
  return <div className="event-row">
    <button type="button" className="date" onClick={() => open('auswertung')} aria-label={`${event.name} öffnen`}><b>{block.day}</b><small>{block.month}</small></button>
    <div className="min-w-0">
      <button type="button" className="name" onClick={() => open('auswertung')}>{event.name}</button>
      <p className="text-q-muted">{formatDayTime(event.date_from, event.event_timezone)}{event.location ? `, ${event.location}` : ''}, {event.source === 'pretix' ? 'aus Pretix' : 'von Hand'} <span className={`q-pill ${phase === 'live' ? 'q-pill-live' : 'q-pill-soon'} ml-1`}>{round.short}</span></p>
    </div>
    <div className="figures">
      <span><b className="q-num">{stats.votes ?? 0}</b> Stimmen</span>
      <span><b className="q-num">{formatAverage(stats.averageRating)}</b> Schnitt</span>
      <span className={stats.questionCount ? '' : 'text-q-danger'}><b className="q-num">{stats.questionCount ?? 0}</b> Fragen</span>
      {stats.openCases > 0 && <span className="text-q-danger"><b className="q-num">{stats.openCases}</b> Rückrufe</span>}
    </div>
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" icon="chart" onClick={() => open('auswertung')}>Auswertung</Button>
      <Button size="sm" icon="questions" onClick={() => open('fragen')}>Fragen</Button>
      <Button size="sm" icon="qr" onClick={() => open('qr')}>QR</Button>
    </div>
  </div>;
}

export function EventCreate({ onDone }) {
  const { reloadEvents, go } = useAdmin();
  const [form, setForm] = useState({ name: '', dateFrom: new Date().toISOString().slice(0, 16), location: '' });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const created = await api('/admin/events', { method: 'POST', body: JSON.stringify({ ...form, dateFrom: new Date(form.dateFrom).toISOString() }) });
      await reloadEvents();
      onDone?.();
      go({ page: 'event', eventId: created.id, tab: 'fragen' });
    } catch (err) {
      setError(err.message);
    }
  }

  return <Panel title="Neues Event" note="danach geht es direkt zu den Fragen">
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
      <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus /></Field>
      <Field label="Beginn"><Input type="datetime-local" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required /></Field>
      <Field label="Ort"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
      <Button type="submit" variant="primary">Anlegen</Button>
    </form>
    {error && <p role="alert" className="q-notice q-notice-error mt-3">{error}</p>}
  </Panel>;
}

// ------------------------------------------------------------------ the table of the spreadsheet look

function Spark({ values }) {
  if (!values?.length) return <span className="text-q-faint">noch keine</span>;
  const max = Math.max(1, ...values);
  const width = 112;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(22 - (value / max) * 20).toFixed(1)}`).join(' ');
  return <svg width={width} height="24" viewBox={`0 0 ${width} 24`} aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

const phases = [
  { id: 'all', label: 'Alle' },
  { id: 'live', label: 'Läuft' },
  { id: 'soon', label: 'Demnächst' },
  { id: 'past', label: 'Vorbei' }
];

export function EventsTable({ selectedId = null, selectedTab = 'auswertung', onCreate }) {
  const { events, go, reloadEvents, eventsState } = useAdmin();
  const [phase, setPhase] = useState('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const now = new Date();
  const counted = Object.fromEntries(phases.map((item) => [item.id, item.id === 'all' ? events.length : events.filter((event) => eventPhase(event, now) === item.id).length]));
  const needle = search.trim().toLowerCase();
  const list = events
    .filter((event) => phase === 'all' || eventPhase(event, now) === phase)
    .filter((event) => !needle || event.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const order = { live: 0, soon: 1, past: 2 };
      const pa = eventPhase(a, now);
      const pb = eventPhase(b, now);
      if (pa !== pb) return order[pa] - order[pb];
      return pa === 'past' ? new Date(b.date_from) - new Date(a.date_from) : new Date(a.date_from) - new Date(b.date_from);
    });
  return <section className="events-table">
    <div className="toolbar">
      <Button variant="primary" size="sm" icon="plus" onClick={() => (onCreate ? onCreate() : setCreating(!creating))}>Neues Event</Button>
      <Button size="sm" icon="refresh" onClick={reloadEvents}>{eventsState.loading ? 'Lädt …' : 'Neu laden'}</Button>
      <div className="seg" role="group" aria-label="Auswahl">
        {phases.map((item) => <button key={item.id} type="button" aria-pressed={phase === item.id} onClick={() => setPhase(item.id)}>{item.label} {counted[item.id]}</button>)}
      </div>
      <label className="search"><Icon name="search" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Event suchen" aria-label="Event suchen" /></label>
    </div>
    {creating && <div className="p-3"><EventCreate onDone={() => setCreating(false)} /></div>}
    <EventsUnavailable error={eventsState.error} onRetry={reloadEvents} className="p-3" />
    <div className="overflow-x-auto">
      <table className="q-table master">
        <thead><tr><th>Event</th><th>Datum</th><th>Stand</th><th className="r">Scans</th><th className="r">Stimmen</th><th className="r">Schnitt</th><th className="r">nur Sterne</th><th className="r">Abgeschickt</th><th className="r">Rückrufe</th><th className="r">Fragen</th><th>Verlauf</th></tr></thead>
        <tbody>
          {list.map((event) => {
            const stats = event.stats || {};
            const round = roundInfo(event, now);
            const tone = eventPhase(event, now);
            return <tr key={event.id} className={event.id === selectedId ? 'sel' : ''} onClick={() => go({ page: 'event', eventId: event.id, tab: selectedId ? selectedTab : 'auswertung' })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go({ page: 'event', eventId: event.id, tab: selectedTab }); }}>
              <td className="name">{event.name}</td>
              <td>{formatDateLine(event.date_from, event.event_timezone).replace(/,.*$/, '')}</td>
              <td><span className={`state ${tone}`}><i />{tone === 'live' ? 'Runde offen' : round.short}</span></td>
              <td className="r">{stats.scans || '–'}</td>
              <td className="r">{stats.votes || '–'}</td>
              <td className="r">{stats.votes ? formatAverage(stats.averageRating) : '–'}</td>
              <td className="r">{stats.votes ? stats.onlyStars : '–'}</td>
              <td className="r">{stats.completionRate === null || stats.completionRate === undefined ? '–' : `${stats.completionRate} %`}</td>
              <td className="r">{stats.openCases ? <span className="lowc">{stats.openCases} offen</span> : '–'}</td>
              <td className="r">{stats.questionCount ? stats.questionCount : <span className="lowc">keine</span>}</td>
              <td className="spark"><Spark values={stats.spark} /></td>
            </tr>;
          })}
          {!list.length && !eventsState.error && <tr><td colSpan={11} className="text-q-muted">Keine Events in dieser Auswahl.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
