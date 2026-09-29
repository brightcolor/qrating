import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, api, assetUrl } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventLabel } from '../eventLabel.js';
import { EventQuestions } from '../FormBuilder.jsx';
import { Button, ButtonLink, Check, ErrorBox, Field, Icon, Input, Loading, Notice, Panel, Select, errorNotice, useAsync } from '../ui.jsx';
import { SourcesTable } from './analytics.jsx';
import { openPreview } from './actions.jsx';
import { formatDayTime, roundInfo } from './model.js';
import { placeAddress, placeDeleteNotice, placeLabelProblem, placeSlugProblem } from './qrPlaces.js';
import { toggleUpcoming, upcomingFull } from './upcomingChoice.js';
import { hasRole } from '../roles.js';

export function QuestionsTab({ event, onChanged }) {
  return <EventQuestions event={event} onChanged={onChanged} />;
}

// ------------------------------------------------------------------ QR & Aushang

export function QrTab({ event }) {
  const { me } = useAdmin();
  const { data: dashboard } = useAsync(() => api('/admin/dashboard'), []);
  const { data: designs } = useAsync(() => api('/admin/print-designs'), []);
  const [reload, setReload] = useState(0);
  const { data: sources, error: sourcesError } = useAsync(() => api('/admin/qr-sources'), [reload]);
  const { data: qr, error: qrError } = useAsync(() => api(`/admin/events/${event.id}/qr-analytics`), [event.id, reload]);
  const [design, setDesign] = useState('klassik');
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
        <SourcesTable rows={qr?.bySource} error={qrError} />
      </Panel>
      <QrPlacesPanel sources={sources} sourcesError={sourcesError} orgUrl={orgUrl} event={{ id: event.id, url: eventUrl }} me={me} onChanged={() => setReload((count) => count + 1)} onReload={() => setReload((count) => count + 1)} />
    </div>
  </div>;
}

// The places of the organization: each one has a code of its own that counts scans and votes for
// its spot. Most belong to every event, so a new name or a deletion counts for all of them; a
// place for a single event says so in its row.
function QrPlacesPanel({ sources, sourcesError, orgUrl, event, me, onChanged, onReload }) {
  const labelMax = me?.settings?.qrSourceLabelMaxLength || undefined;
  const slugMax = me?.settings?.qrSourceSlugMaxLength || undefined;
  const canManage = hasRole(me?.role, 'event_manager');
  const [message, setMessage] = useState('');
  const messageRef = useRef(null);

  // After a deletion the row is gone; the focus goes to the message that says so.
  function announce(text, { focus = false } = {}) {
    setMessage(text);
    if (focus) setTimeout(() => messageRef.current?.focus(), 0);
  }

  return <Panel title="QR-Plätze verwalten" note="eigene Codes für einzelne Stellen, etwa die Bar">
    <div className="grid gap-3">
      <div ref={messageRef} tabIndex={-1} className="outline-none"><Notice message={message} /></div>
      {sourcesError && <div className="grid gap-2">
        <ErrorBox error={sourcesError} />
        <div><Button size="sm" icon="refresh" onClick={onReload}>Erneut laden</Button></div>
      </div>}
      {sources && (sources.length ? <ul className="grid gap-2">
        {sources.map((source) => <PlaceRow key={source.id} source={source} orgUrl={orgUrl} event={event} labelMax={labelMax} canManage={canManage} onChanged={onChanged} announce={announce} />)}
      </ul> : <p className="text-q-muted">Noch keine QR-Plätze. Ein Platz bekommt einen eigenen Code und zählt Scans und Stimmen für seine Stelle, etwa an der Bar.</p>)}
      {canManage
        ? <PlaceCreate orgUrl={orgUrl} labelMax={labelMax} slugMax={slugMax} onChanged={onChanged} />
        : <p className="q-hint">Plätze anlegen, umbenennen und löschen können Event-Manager, Admins und Owner.</p>}
    </div>
  </Panel>;
}

// One place. Renaming and deleting open inline; the focus goes into them and back to the button
// that opened them, so keyboard and screen reader users keep their place in the list.
function PlaceRow({ source, orgUrl, event, labelMax, canManage, onChanged, announce }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const renameRef = useRef(null);
  const deleteRef = useRef(null);
  const keepRef = useRef(null);
  const giveBack = useRef(null);
  const address = placeAddress(orgUrl, source, event);
  const problemId = `qr-place-problem-${source.id}`;
  const askId = `qr-place-ask-${source.id}`;

  useEffect(() => {
    if (deleting) keepRef.current?.focus();
  }, [deleting]);
  useEffect(() => {
    if (editing || deleting || !giveBack.current) return;
    giveBack.current.current?.focus();
    giveBack.current = null;
  }, [editing, deleting]);

  function closeRename() {
    giveBack.current = renameRef;
    setEditing(null);
    setProblem('');
  }

  function closeDelete() {
    giveBack.current = deleteRef;
    setDeleting(false);
    setProblem('');
  }

  async function saveName(e) {
    e.preventDefault();
    const found = placeLabelProblem(editing, labelMax);
    if (found) {
      setProblem(found);
      return;
    }
    setBusy(true);
    try {
      const saved = await api(`/admin/qr-sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ label: editing }) });
      closeRename();
      announce(`QR-Platz heißt jetzt „${saved.label}“.`);
      onChanged();
    } catch (err) {
      if (err.status === 404) {
        // Deleted meanwhile: the row leaves the list, so the word goes to the panel.
        announce(`„${source.label}“ gibt es nicht mehr, die Liste ist neu geladen.`, { focus: true });
        onChanged();
      } else {
        setProblem(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/qr-sources/${source.id}`, { method: 'DELETE' });
      announce(`QR-Platz „${source.label}“ gelöscht. Stimmen und Scans behalten den Namen.`, { focus: true });
      onChanged();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <li className="grid gap-2 rounded-lg bg-q-sunken p-2.5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold">{source.label}{source.active === false && <span className="q-pill q-pill-warn ml-1.5">pausiert</span>}</p>
        {address && <p className="break-all text-q-muted">{address}</p>}
        {source.type === 'event_specific' && <p className="q-hint">nur für {source.event_name || 'ein einzelnes Event'}{address ? '' : '; die Adresse steht im QR-Tab dieses Events'}</p>}
      </div>
      {canManage && editing === null && !deleting && <div className="flex flex-wrap gap-1.5">
        <Button ref={renameRef} size="sm" icon="pencil" aria-label={`„${source.label}“ umbenennen`} onClick={() => { setProblem(''); setEditing(source.label); }}>Umbenennen</Button>
        <Button ref={deleteRef} size="sm" variant="danger-soft" icon="trash" aria-label={`„${source.label}“ löschen …`} onClick={() => { setProblem(''); setDeleting(true); }}>Löschen …</Button>
      </div>}
    </div>
    {editing !== null && <form onSubmit={saveName} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) closeRename(); }} className="grid gap-2">
      <Field label="Neuer Name" hint={address ? `Die Adresse ${address} bleibt, gedruckte Codes gelten weiter.` : 'Die Adresse bleibt, gedruckte Codes gelten weiter.'}>
        <Input
          value={editing}
          onChange={(e) => { setEditing(e.target.value); setProblem(''); }}
          maxLength={labelMax}
          autoFocus
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? problemId : undefined}
        />
      </Field>
      {problem && <p id={problemId} role="alert" className="q-notice q-notice-error">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" icon="check" disabled={busy}>Namen speichern</Button>
        <Button variant="ghost" size="sm" onClick={closeRename} disabled={busy}>Abbrechen</Button>
      </div>
    </form>}
    {deleting && <div role="group" aria-labelledby={askId} className="grid gap-2 rounded-lg bg-q-danger-soft p-3" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) closeDelete(); }}>
      <p id={askId}>{placeDeleteNotice(source, address)}</p>
      {problem && <p role="alert" className="q-notice q-notice-error">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" icon="trash" onClick={remove} disabled={busy}>Platz löschen</Button>
        <Button ref={keepRef} variant="ghost" size="sm" onClick={closeDelete} disabled={busy}>Abbrechen</Button>
      </div>
    </div>}
  </li>;
}

// A new place. Problems stand at the field they belong to; the answer of the server as well.
function PlaceCreate({ orgUrl, labelMax, slugMax, onChanged }) {
  const [draft, setDraft] = useState({ sourceSlug: '', label: '' });
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState('');

  async function create(e) {
    e.preventDefault();
    setDone('');
    const labelProblem = placeLabelProblem(draft.label, labelMax);
    const slugProblem = placeSlugProblem(draft.sourceSlug, slugMax);
    if (labelProblem || slugProblem) {
      setProblem(labelProblem ? { field: 'label', text: labelProblem } : { field: 'slug', text: slugProblem });
      return;
    }
    try {
      const created = await api('/admin/qr-sources', { method: 'POST', body: JSON.stringify({ ...draft, type: 'dynamic_organization' }) });
      setProblem(null);
      setDone(`QR-Platz „${created.label}“ angelegt. Sein Code: ${placeAddress(orgUrl, created)}`);
      setDraft({ sourceSlug: '', label: '' });
      onChanged();
    } catch (err) {
      // A short name that is taken belongs to its field; anything else to the form.
      setProblem({ field: err.status === 409 ? 'slug' : 'form', text: err.message });
    }
  }

  const fieldProps = (field) => ({
    'aria-invalid': problem?.field === field || undefined,
    'aria-describedby': problem?.field === field ? `qr-create-${field}` : undefined
  });
  const fieldProblem = (field) => (problem?.field === field ? <p id={`qr-create-${field}`} role="alert" className="q-notice q-notice-error">{problem.text}</p> : null);

  return <form onSubmit={create} className="grid gap-3 border-t border-q-line pt-3 sm:grid-cols-2">
    <p className="q-label sm:col-span-2">Neuer Platz, etwa Bar, Ausgang oder Garderobe</p>
    <div className="grid gap-1.5">
      <Field label="Name"><Input value={draft.label} onChange={(e) => { setDraft({ ...draft, label: e.target.value }); setProblem(null); }} placeholder="Bar" maxLength={labelMax} {...fieldProps('label')} /></Field>
      {fieldProblem('label')}
    </div>
    <div className="grid gap-1.5">
      <Field label="Kurzname in der Adresse"><Input value={draft.sourceSlug} onChange={(e) => { setDraft({ ...draft, sourceSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }); setProblem(null); }} placeholder="bar" maxLength={slugMax} {...fieldProps('slug')} /></Field>
      {fieldProblem('slug')}
    </div>
    <p className="q-hint sm:col-span-2">Der Code dazu: {orgUrl || '…'}/{draft.sourceSlug || 'kurzname'}. Er führt wie der Hauptcode zum laufenden Event, zählt Scans aber für diesen Platz.</p>
    <div className="grid gap-2 sm:col-span-2">
      <div><Button type="submit" variant="primary" icon="plus">Platz anlegen</Button></div>
      {fieldProblem('form')}
      <Notice message={done} />
    </div>
  </form>;
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
  const { events, go, me } = useAdmin();
  // How many events can be picked by hand is a setting of the server; it arrives with the account.
  const upcomingMax = me?.settings?.upcomingEventsMax || null;
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

  const pick = (id) => setUpcoming((current) => ({ ...current, ids: toggleUpcoming(current.ids, id, upcomingMax) }));
  const full = upcomingFull(upcoming.ids, upcomingMax);
  const fullNotice = upcoming.enabled && full ? `${upcoming.ids.length} Events sind gewählt, mehr zeigt die Gästeseite nicht. Nimm eines heraus, um ein anderes zu wählen.` : '';

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
        <p className="q-hint">Ohne Auswahl zeigt qrating die nächsten Events nach Datum. Wähle {upcomingMax ? `bis zu ${upcomingMax}` : 'einige'}, wenn es bestimmte sein sollen. Der Ticketlink erscheint nur, wenn Pretix den Verkauf offen meldet.</p>
      </div>
      <div className="mt-3 grid gap-1.5 md:grid-cols-2">
        {events.filter((item) => item.id !== event.id).map((item) => {
          const checked = upcoming.ids.includes(item.id);
          return <Check key={item.id} label={eventLabel(item)} checked={checked} onChange={() => pick(item.id)} disabled={!upcoming.enabled || (full && !checked)} className="rounded-lg bg-q-sunken p-2" />;
        })}
      </div>
      <p className={fullNotice ? 'q-hint mt-2' : 'q-hint'} role="status">{fullNotice}</p>
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
