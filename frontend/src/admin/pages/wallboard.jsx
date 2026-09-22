import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventLabel } from '../eventLabel.js';
import { formatAverage, hourColumns, relativeTime, wallboardQuotes } from '../event/model.js';
import { Button, Check, ErrorBox, EventsUnavailable, Field, Input, Notice, Page, Panel, Select, Stars, errorNotice, useAsync } from '../ui.jsx';

// A screen for the wall of the venue: the numbers of one event, refreshed by itself.
export function WallboardPage({ eventId: wantedId }) {
  const { events, eventsState, currentEvent, go, reloadEvents } = useAdmin();
  const { data: branding } = useAsync(() => api('/admin/branding'), []);
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const board = useRef(null);
  const eventId = events.some((event) => event.id === wantedId) ? wantedId : currentEvent?.id || '';
  const event = events.find((item) => item.id === eventId);

  useEffect(() => {
    if (branding) setSettings({ dark: branding.wallboard_settings?.dark_mode !== false, refresh: branding.wallboard_settings?.refresh_seconds ?? 15 });
  }, [branding]);

  const refresh = Math.max(5, Number(settings?.refresh) || 15);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), refresh * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  // The numbers carry their event, so a switch never shows the figures of the one before.
  const { data: loaded, error } = useAsync(
    () => (eventId ? api(`/admin/events/${eventId}/analytics`).then((result) => ({ eventId, result })) : Promise.resolve(null)),
    [eventId, tick]
  );
  const data = loaded && loaded.eventId === eventId ? loaded.result : null;

  async function saveSettings(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/branding', { method: 'PATCH', body: JSON.stringify({ wallboardSettings: { dark_mode: settings.dark, refresh_seconds: Number(settings.refresh) || 15 } }) });
      setMessage('Wallboard gespeichert.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const columns = hourColumns(data?.timeline || [], { columns: 10, zone: event?.event_timezone });
  const dark = settings?.dark !== false;
  const voices = wallboardQuotes(data?.voices);

  return <Page title="Wallboard" subtitle="Für den Bildschirm im Saal. Aktualisiert sich von selbst." actions={<>
    <Select value={eventId} onChange={(e) => go({ page: 'wallboard', eventId: e.target.value }, { replace: true })} aria-label="Event">
      {events.map((item) => <option key={item.id} value={item.id}>{eventLabel(item)}</option>)}
    </Select>
    <Button icon="wallboard" onClick={() => board.current?.requestFullscreen?.()}>Vollbild</Button>
  </>}>
    <EventsUnavailable error={events.length ? null : eventsState.error} onRetry={reloadEvents} />
    <ErrorBox error={error} />
    <section ref={board} className="grid content-start gap-5 rounded-2xl p-6" style={{ background: dark ? '#0B0F14' : '#F5F6F8', color: dark ? '#fff' : '#111827', minHeight: 420 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{event?.name || 'Kein Event gewählt'}</h2>
        <span style={{ opacity: 0.6 }}>alle {refresh} Sekunden neu</span>
      </div>
      {data && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Stimmen', data.summary.total || 0],
            ['Schnitt', formatAverage(data.summary.average_rating)],
            ['Newsletter', data.summary.newsletter_optins || 0],
            ['Letzte Stimme', data.voices?.[0] ? relativeTime(data.voices[0].submittedAt) : '–']
          ].map(([label, value]) => <div key={label} className="rounded-xl p-5" style={{ background: dark ? 'rgba(255,255,255,.08)' : '#fff' }}>
            <p style={{ opacity: 0.65, fontSize: 14 }}>{label}</p>
            <p style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
          </div>)}
        </div>
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {columns.map((column) => <div key={column.label} className="flex flex-1 flex-col items-center gap-1" style={{ fontSize: 13, opacity: 0.8 }}>
            <span>{column.count || ''}</span>
            <i style={{ display: 'block', width: '100%', height: `${Math.max(4, column.share * 100)}px`, borderRadius: 6, background: column.later ? 'rgba(96,165,250,.35)' : '#60A5FA' }} />
            <span>{column.label}</span>
          </div>)}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {voices.map((voice) => <blockquote key={voice.id} className="m-0 rounded-xl p-4" style={{ background: dark ? 'rgba(255,255,255,.06)' : '#fff' }}>
            <Stars rating={voice.rating} size={14} className="text-amber-400" offClassName="opacity-25" />
            <p style={{ fontSize: 17, marginTop: 6 }}>„{voice.texts[0].value}“</p>
          </blockquote>)}
        </div>
      </>}
    </section>
    {settings && <Panel title="Einstellungen des Wallboards">
      <form onSubmit={saveSettings} className="flex flex-wrap items-end gap-4">
        <Check label="Dunkel" checked={settings.dark} onChange={(e) => setSettings({ ...settings, dark: e.target.checked })} />
        <Field label="Neu laden alle … Sekunden"><Input type="number" min="5" value={settings.refresh} onChange={(e) => setSettings({ ...settings, refresh: e.target.value })} style={{ width: 120 }} /></Field>
        <Button type="submit" variant="primary">Speichern</Button>
        <Notice message={message} />
      </form>
    </Panel>}
  </Page>;
}
