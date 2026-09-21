import React from 'react';
import { API_BASE, api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventPhase, formatAverage, formatDayTime, roundInfo } from '../event/model.js';
import { Button, ButtonLink, ErrorBox, Loading, Page, Panel, Stars, useAsync } from '../ui.jsx';
import { caseTexts } from './callbacks.jsx';

// The first page after sign-in: what runs now, what needs a call, what comes next.
export function Overview() {
  const { events, eventsState, currentEvent, go, me } = useAdmin();
  const { data: dashboard, error } = useAsync(() => api('/admin/dashboard'), []);
  const { data: cases } = useAsync(() => api('/admin/low-rating-cases'), []);
  const openCases = (cases || []).filter((item) => ['open', 'contact_planned'].includes(item.status));
  const now = new Date();
  const coming = events.filter((event) => eventPhase(event, now) === 'soon').sort((a, b) => new Date(a.date_from) - new Date(b.date_from)).slice(0, 4);
  const round = currentEvent ? roundInfo(currentEvent, now) : null;
  const stats = currentEvent?.stats || {};

  return <Page title="Übersicht" subtitle={me?.organization_name}>
    <ErrorBox error={error || eventsState.error} />
    {eventsState.loading && !events.length && <Loading />}
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title={round?.state === 'open' ? 'Läuft gerade' : 'Als Nächstes'} note={round?.label}>
        {currentEvent ? <div className="grid gap-4">
          <div>
            <h2 className="q-h1" style={{ fontSize: 24 }}>{currentEvent.name}</h2>
            <p className="text-q-muted">{formatDayTime(currentEvent.date_from, currentEvent.event_timezone)}{currentEvent.location ? `, ${currentEvent.location}` : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Stimmen', stats.votes ?? 0],
              ['Schnitt', formatAverage(stats.averageRating)],
              ['Abgeschickt', stats.completionRate === null || stats.completionRate === undefined ? '–' : `${stats.completionRate} %`],
              ['Rückrufe offen', stats.openCases ?? 0]
            ].map(([label, value]) => <div key={label} className="rounded-lg bg-q-sunken p-3">
              <p className="q-label">{label}</p>
              <p className="q-num" style={{ fontSize: 24 }}>{value}</p>
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="chart" onClick={() => go({ page: 'event', eventId: currentEvent.id, tab: 'auswertung' })}>Auswertung</Button>
            <Button icon="questions" onClick={() => go({ page: 'event', eventId: currentEvent.id, tab: 'fragen' })}>Fragen</Button>
            <Button icon="qr" onClick={() => go({ page: 'event', eventId: currentEvent.id, tab: 'qr' })}>QR & Aushang</Button>
          </div>
        </div> : <div className="grid gap-3">
          <p className="text-q-muted">Noch kein Event. Lege eines an oder hole deine Events aus Pretix.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="plus" onClick={() => go({ page: 'events' })}>Event anlegen</Button>
            <Button icon="plug" onClick={() => go({ page: 'settings', section: 'verbindungen', part: 'pretix' })}>Pretix verbinden</Button>
          </div>
        </div>}
      </Panel>
      <Panel title="Offene Rückrufe" note={openCases.length ? `${openCases.length} offen` : null} actions={<Button size="sm" onClick={() => go({ page: 'callbacks' })}>Alle</Button>}>
        {openCases.length ? <div className="grid gap-2">
          {openCases.slice(0, 4).map((item) => <button key={item.id} type="button" className="grid gap-0.5 rounded-lg bg-q-danger-soft p-2 text-left" onClick={() => go({ page: 'callbacks' })}>
            <span className="flex items-center gap-2 text-q-danger"><Stars rating={item.rating} size={11} offClassName="opacity-30" /><span className="text-q-muted">{item.event_name}</span></span>
            <span className="truncate">{caseTexts(item)[0]?.value || 'Der Gast hat nichts geschrieben.'}</span>
          </button>)}
        </div> : <p className="text-q-muted">Kein offener Rückruf.</p>}
      </Panel>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Demnächst" actions={<Button size="sm" onClick={() => go({ page: 'events' })}>Alle Events</Button>}>
        {coming.length ? <table className="q-table">
          <tbody>
            {coming.map((event) => {
              const questions = event.stats?.questionCount;
              return <tr key={event.id} className="cursor-pointer" onClick={() => go({ page: 'event', eventId: event.id, tab: 'fragen' })}>
                <td><strong>{event.name}</strong></td>
                <td className="text-q-muted">{formatDayTime(event.date_from, event.event_timezone)}</td>
                <td className="r">{questions ? `${questions} Fragen` : <span className="text-q-danger">noch keine Fragen</span>}</td>
              </tr>;
            })}
          </tbody>
        </table> : <p className="text-q-muted">Nichts geplant.</p>}
      </Panel>
      <Panel title="QR-Code für alle Events" note="führt immer zum Event, das gerade läuft">
        {dashboard ? <div className="grid gap-3">
          <p className="break-all text-q-muted">{dashboard.feedbackAppUrl}/f/{dashboard.organization.slug}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink icon="qr" href={`${API_BASE}/admin/organizations/${dashboard.organization.id}/qr`} target="_blank" rel="noreferrer">QR-Code</ButtonLink>
            <ButtonLink icon="printer" href={`${API_BASE}/admin/organizations/${dashboard.organization.id}/qr-print`} target="_blank" rel="noreferrer">Aushang drucken</ButtonLink>
          </div>
        </div> : <Loading />}
      </Panel>
    </div>
  </Page>;
}
