import React, { useEffect, useState } from 'react';
import { API_BASE, api, assetUrl } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventLabel } from '../eventLabel.js';
import { EventQuestions } from '../FormBuilder.jsx';
import { Button, ButtonLink, Check, ErrorBox, Field, Icon, Input, Loading, Notice, Panel, Select, errorNotice, useAsync } from '../ui.jsx';
import { SourcesTable } from './analytics.jsx';
import { openPreview } from './actions.jsx';
import { formatDayTime, roundInfo } from './model.js';

export function QuestionsTab({ event, onChanged }) {
  return <EventQuestions event={event} onChanged={onChanged} />;
}

// ------------------------------------------------------------------ QR & Aushang

export function QrTab({ event }) {
  const { data: dashboard } = useAsync(() => api('/admin/dashboard'), []);
  const { data: designs } = useAsync(() => api('/admin/print-designs'), []);
  const [reload, setReload] = useState(0);
  const { data: sources } = useAsync(() => api('/admin/qr-sources'), [reload]);
  const { data: qr } = useAsync(() => api(`/admin/events/${event.id}/qr-analytics`), [event.id, reload]);
  const [design, setDesign] = useState('klassik');
  const [draft, setDraft] = useState({ sourceSlug: '', label: '' });
  const [message, setMessage] = useState('');
  const eventUrl = event.feedbackUrl || `/e/${event.event_feedback_token}`;
  const orgUrl = dashboard ? `${dashboard.feedbackAppUrl}/f/${dashboard.organization.slug}` : '';

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Adresse kopiert.');
    } catch {
      setMessage(errorNotice({ message: 'Der Browser lässt das Kopieren nicht zu. Markiere die Adresse und kopiere sie von Hand.' }));
    }
  }

  async function createSource(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/qr-sources', { method: 'POST', body: JSON.stringify({ ...draft, type: 'dynamic_organization' }) });
      setMessage(`QR-Platz „${draft.label}“ angelegt. Sein Code: ${orgUrl}/${draft.sourceSlug}`);
      setDraft({ sourceSlug: '', label: '' });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div className="grid gap-4">
    <Notice message={message} />
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="QR-Code für alle Events" note="führt immer zum Event, das gerade läuft">
        <div className="flex flex-wrap items-start gap-4">
          {dashboard && <img src={`${API_BASE}/admin/organizations/${dashboard.organization.id}/qr`} alt="QR-Code der Gästeseite" className="h-32 w-32 rounded-lg bg-white p-1.5" />}
          <div className="grid min-w-0 flex-1 gap-2">
            <p className="break-all font-semibold">{orgUrl}</p>
            <p className="text-q-muted">Dieser Code gehört aufs Bändchen und auf feste Aushänge. Er zeigt vor der Runde die Warteseite und danach die kommenden Events.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="file" onClick={() => copy(orgUrl)}>Adresse kopieren</Button>
              {dashboard && <ButtonLink size="sm" icon="printer" href={`${API_BASE}/admin/organizations/${dashboard.organization.id}/qr-print?design=${design}`} target="_blank" rel="noreferrer">Aushang drucken</ButtonLink>}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="QR-Code nur für dieses Event" note={event.name}>
        <div className="flex flex-wrap items-start gap-4">
          <img src={`${API_BASE}/admin/events/${event.id}/qr`} alt="QR-Code dieses Events" className="h-32 w-32 rounded-lg bg-white p-1.5" />
          <div className="grid min-w-0 flex-1 gap-2">
            <p className="break-all font-semibold">{eventUrl}</p>
            <p className="text-q-muted">Führt immer zu diesem Event, auch wenn gerade ein anderes läuft. Gut für Plakate und Mails zu genau diesem Abend.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="file" onClick={() => copy(eventUrl)}>Adresse kopieren</Button>
              <Button size="sm" icon="eye" onClick={() => openPreview(event.id, (err) => setMessage(errorNotice(err)))}>Vorschau</Button>
              <ButtonLink size="sm" icon="printer" href={`${API_BASE}/admin/events/${event.id}/qr-print?design=${design}`} target="_blank" rel="noreferrer">Aushang drucken</ButtonLink>
            </div>
          </div>
        </div>
      </Panel>
    </div>
    <Panel title="Gestaltung des Aushangs" note="gilt für beide Knöpfe „Aushang drucken“">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {designs?.map((item) => <label key={item.id} className={`q-check rounded-lg border p-3 ${design === item.id ? 'border-q-accent bg-q-accent-soft' : 'border-q-line'}`}>
          <input type="radio" name="print-design" value={item.id} checked={design === item.id} onChange={() => setDesign(item.id)} />
          <span><strong className="block">{item.label}</strong><span className="text-q-muted">{item.hint}</span></span>
        </label>)}
      </div>
    </Panel>
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Panel title="QR-Plätze bei diesem Event" note="Scans und Stimmen je Platz">
        <SourcesTable rows={qr?.bySource} />
      </Panel>
      <Panel title="Neuer QR-Platz" note="etwa Bar, Ausgang, Garderobe">
        <form onSubmit={createSource} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value, sourceSlug: draft.sourceSlug || '' })} placeholder="Bar" required /></Field>
          <Field label="Kurzname in der Adresse"><Input value={draft.sourceSlug} onChange={(e) => setDraft({ ...draft, sourceSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="bar" required /></Field>
          <p className="q-hint sm:col-span-2">Der Code dazu: {orgUrl || '…'}/{draft.sourceSlug || 'kurzname'}. Er führt wie der Hauptcode zum laufenden Event, zählt Scans aber für diesen Platz.</p>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" icon="plus">Platz anlegen</Button></div>
        </form>
        {sources?.length > 0 && <div className="mt-3 grid gap-1">
          <p className="q-label">Vorhandene Plätze</p>
          {sources.map((source) => <p key={source.id} className="flex justify-between gap-2"><span>{source.label}</span><span className="truncate text-q-muted">/f/{dashboard?.organization.slug}/{source.source_slug}</span></p>)}
        </div>}
      </Panel>
    </div>
  </div>;
}

// ------------------------------------------------------------------ Einstellungen des Events

const eventStatusLabels = { draft: 'Entwurf', active: 'Aktiv', closed: 'Beendet', archived: 'Archiviert' };
const eventStatusNotices = {
  draft: 'Das Event ist ein Entwurf und nimmt kein Feedback an.',
  active: 'Das Event ist aktiv und nimmt Feedback an.',
  closed: 'Das Event ist beendet. Die Gästeseite nimmt kein Feedback mehr an.',
  archived: 'Das Event ist archiviert und fällt aus QR-Code und Gästeseite.'
};

export function EventSettingsTab({ event, onChanged }) {
  const { events, go } = useAdmin();
  const [message, setMessage] = useState('');
  const [image, setImage] = useState({ imageUrl: event.image_url || '', imageAlt: event.image_alt || '' });
  const [upcoming, setUpcoming] = useState({ enabled: event.upcoming_enabled !== false, ids: Array.isArray(event.upcoming_event_ids) ? event.upcoming_event_ids : [], tickets: event.ticket_link_enabled !== false });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const round = roundInfo(event);

  useEffect(() => {
    setImage({ imageUrl: event.image_url || '', imageAlt: event.image_alt || '' });
    setUpcoming({ enabled: event.upcoming_enabled !== false, ids: Array.isArray(event.upcoming_event_ids) ? event.upcoming_event_ids : [], tickets: event.ticket_link_enabled !== false });
  }, [event.id]);

  async function patch(body, text) {
    setMessage('');
    try {
      await api(`/admin/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setMessage(text);
      onChanged?.();
      return true;
    } catch (err) {
      setMessage(errorNotice(err));
      return false;
    }
  }

  async function syncImage() {
    setMessage('');
    try {
      await api(`/admin/events/${event.id}/sync-image`, { method: 'POST', body: '{}' });
      setMessage('Das Bild wurde neu aus Pretix geladen.');
      onChanged?.();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function askDelete() {
    setMessage('');
    try {
      const analytics = await api(`/admin/events/${event.id}/analytics`);
      setConfirmDelete({ feedbacks: Number(analytics?.summary?.total || 0) });
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function removeEvent() {
    setMessage('');
    try {
      await api(`/admin/events/${event.id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      onChanged?.();
      go({ page: 'events' }, { replace: true });
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const toggleUpcoming = (id) => setUpcoming((current) => ({ ...current, ids: current.ids.includes(id) ? current.ids.filter((item) => item !== id) : [...current.ids, id].slice(0, 5) }));

  return <div className="grid gap-4">
    <Notice message={message} />
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Stand">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status" hint={eventStatusNotices[event.status]}>
            <Select value={event.status || 'active'} onChange={(e) => patch({ status: e.target.value }, eventStatusNotices[e.target.value] || 'Status gespeichert.')}>
              {Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <div className="grid content-start gap-1">
            <p className="q-label">Bewertungszeit</p>
            <p>{round.start ? `${formatDayTime(round.start, event.event_timezone)} bis ${formatDayTime(round.end, event.event_timezone)}` : 'nicht festgelegt'}</p>
            <p className="q-hint">{event.source === 'pretix' ? 'Kommt aus Pretix: Beginn des Events plus die eingestellte Dauer.' : 'Beginn des Events plus die eingestellte Dauer.'}</p>
          </div>
        </div>
      </Panel>
      <Panel title="Bild">
        <form onSubmit={(e) => { e.preventDefault(); patch({ imageUrl: image.imageUrl.trim(), imageAlt: image.imageAlt.trim() }, image.imageUrl.trim() ? 'Das Bild wurde gespeichert.' : 'Das Bild wurde entfernt.'); }} className="grid gap-3 sm:grid-cols-[96px_1fr]">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-q-sunken">
            {event.image_url ? <img className="h-full w-full object-cover" src={assetUrl(event.image_url)} alt="" /> : <Icon name="image" size={24} className="text-q-faint" />}
          </div>
          <div className="grid gap-2">
            <Field label="Bild-Adresse"><Input value={image.imageUrl} onChange={(e) => setImage({ ...image, imageUrl: e.target.value })} placeholder="https://example.com/bild.jpg" /></Field>
            <Field label="Was auf dem Bild zu sehen ist"><Input value={image.imageAlt} onChange={(e) => setImage({ ...image, imageAlt: e.target.value })} /></Field>
            <p className="q-hint">Ein hier gesetztes Bild bleibt beim nächsten Pretix-Abgleich erhalten. Eine leere Adresse entfernt das Bild.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">Bild speichern</Button>
              {event.source === 'pretix' && <Button icon="refresh" onClick={syncImage}>Aus Pretix neu laden</Button>}
            </div>
          </div>
        </form>
      </Panel>
    </div>
    <Panel title="Nach dem Feedback" note="Hinweis auf kommende Events">
      <div className="grid gap-2">
        <Check label="Nach dem Feedback auf kommende Events hinweisen" checked={upcoming.enabled} onChange={(e) => setUpcoming({ ...upcoming, enabled: e.target.checked })} />
        <Check label="Ticketlink zeigen, solange der Vorverkauf läuft" checked={upcoming.tickets} onChange={(e) => setUpcoming({ ...upcoming, tickets: e.target.checked })} />
        <p className="q-hint">Ohne Auswahl zeigt qrating die nächsten Events nach Datum. Wähle bis zu fünf, wenn es bestimmte sein sollen. Der Ticketlink erscheint nur, wenn Pretix den Verkauf offen meldet.</p>
      </div>
      <div className="mt-3 grid gap-1.5 md:grid-cols-2">
        {events.filter((item) => item.id !== event.id).map((item) => <Check key={item.id} label={eventLabel(item)} checked={upcoming.ids.includes(item.id)} onChange={() => toggleUpcoming(item.id)} disabled={!upcoming.enabled} className="rounded-lg bg-q-sunken p-2" />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => patch({ upcomingEnabled: upcoming.enabled, upcomingEventIds: upcoming.ids, ticketLinkEnabled: upcoming.tickets }, upcoming.enabled ? (upcoming.ids.length ? `Gäste sehen nach dem Feedback ${upcoming.ids.length} ausgewählte Events.` : 'Gäste sehen nach dem Feedback die nächsten Events.') : 'Der Hinweis auf kommende Events ist aus.')}>Auswahl speichern</Button>
        <Button onClick={() => setUpcoming({ ...upcoming, ids: [] })}>Automatisch wählen</Button>
      </div>
    </Panel>
    <Panel title="Event entfernen">
      {confirmDelete ? <div className="grid gap-3 rounded-lg bg-q-danger-soft p-3">
        <p>Event „{event.name}“ endgültig löschen? {confirmDelete.feedbacks > 0 ? `Damit verschwinden auch ${confirmDelete.feedbacks} Bewertungen samt Antworten, Rückrufen und Newsletter-Anmeldungen.` : 'Für dieses Event gibt es noch keine Bewertungen.'} Archivieren nimmt das Event aus QR-Code und Gästeseite und lässt die Daten stehen.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" icon="trash" onClick={removeEvent}>Endgültig löschen</Button>
          <Button onClick={() => patch({ status: 'archived' }, eventStatusNotices.archived).then((done) => done && setConfirmDelete(null))}>Lieber archivieren</Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Abbrechen</Button>
        </div>
      </div> : <div className="flex flex-wrap items-center gap-3">
        <p className="text-q-muted">Archivieren lässt die Daten stehen, Löschen nimmt sie mit.</p>
        <Button variant="danger-soft" icon="trash" onClick={askDelete}>Event löschen …</Button>
      </div>}
    </Panel>
  </div>;
}
