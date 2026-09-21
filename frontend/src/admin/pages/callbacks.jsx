import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { formatDayTime } from '../event/model.js';
import { Button, ErrorBox, Field, Loading, Notice, Page, Panel, Select, Stars, TextArea, errorNotice, useAsync } from '../ui.jsx';

export const caseStatuses = [
  { id: 'open', label: 'Offen' },
  { id: 'contact_planned', label: 'Rückruf geplant' },
  { id: 'contacted', label: 'Kontaktiert' },
  { id: 'resolved', label: 'Geklärt' },
  { id: 'archived', label: 'Archiviert' }
];

const openStatuses = ['open', 'contact_planned'];

// Everything the guest wrote: the answers to the open questions of the form first, then the
// free-text fields of the flow.
export function caseTexts(item) {
  return [
    ...(item.answer_texts || []).filter((text) => text.value),
    item.comment_improvement && { label: 'Was besser werden soll', value: item.comment_improvement },
    item.general_comment && { label: 'Kommentar', value: item.general_comment },
    item.comment_positive && { label: 'Was gut war', value: item.comment_positive }
  ].filter(Boolean);
}

// Low ratings as cases to settle: who calls back, what came of it. The phone number stays
// encrypted until someone asks for it, and every reveal lands in the audit log.
export function Callbacks() {
  const { reloadEvents } = useAdmin();
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('open');
  const { data, loading, error } = useAsync(() => api('/admin/low-rating-cases'), [reload]);
  const { data: users } = useAsync(() => api('/admin/users'), []);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState({});

  async function updateCase(item, patch) {
    try {
      await api(`/admin/low-rating-cases/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setMessage('Fall gespeichert.');
      setReload(reload + 1);
      reloadEvents();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function revealContact(item) {
    try {
      const result = await api(`/admin/pii-vault/low-rating-cases/${item.id}/reveal`, { method: 'POST', body: '{}' });
      setRevealed({ ...revealed, [item.id]: result });
      setMessage('Kontaktdaten geladen. Der Zugriff steht im Protokoll.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const cases = (data || []).filter((item) => filter === 'all' || openStatuses.includes(item.status));
  const openCount = (data || []).filter((item) => openStatuses.includes(item.status)).length;

  return <Page title="Rückrufe" subtitle="Niedrige Bewertungen als Fälle zum Klären. Rückrufnummern bleiben verschlüsselt, bis jemand sie anzeigt." actions={<div className="flex gap-1.5">
    <button type="button" className="q-chip" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Offen {openCount}</button>
    <button type="button" className="q-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Alle {data?.length || 0}</button>
  </div>}>
    <Notice message={message} />
    <ErrorBox error={error} />
    {loading && <Loading />}
    {!loading && cases.length === 0 && <Panel><p className="text-q-muted">{filter === 'open' ? 'Kein offener Rückruf. Neue niedrige Bewertungen erscheinen hier von selbst.' : 'Noch keine niedrigen Bewertungen.'}</p></Panel>}
    {cases.map((item) => {
      const texts = caseTexts(item);
      return <Panel key={item.id}>
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="q-pill q-pill-danger"><Stars rating={item.rating} size={11} offClassName="opacity-30" />{item.rating} {item.rating === 1 ? 'Stern' : 'Sterne'}</span>
              <strong style={{ fontSize: 15 }}>{item.event_name}</strong>
              <span className="text-q-muted">{formatDayTime(item.submitted_at)}</span>
            </div>
            {texts.length ? <div className="mt-2 grid gap-1">{texts.map((text, index) => <p key={index} style={{ fontSize: index ? 13.5 : 15 }}>{index ? <span className="text-q-muted">{text.label}: </span> : null}{index ? text.value : `„${text.value}“`}</p>)}</div> : <p className="mt-2 text-q-muted">Der Gast hat nichts geschrieben.</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-q-sunken p-2"><p className="q-label">Rückrufnummer</p><p className="font-semibold">{revealed[item.id]?.contactPhone || (item.contactPhoneAvailable ? 'hinterlegt' : 'keine')}</p></div>
              <div className="rounded-lg bg-q-sunken p-2"><p className="q-label">Anliegen</p><p className="font-semibold">{revealed[item.id]?.contactNote || (item.contactNoteAvailable ? 'hinterlegt' : 'keines')}</p></div>
            </div>
            {(item.contactPhoneAvailable || item.contactNoteAvailable) && !revealed[item.id] && <Button className="mt-3" variant="primary" icon="phone" onClick={() => revealContact(item)}>Kontaktdaten anzeigen</Button>}
          </div>
          <div className="grid content-start gap-3">
            <Field label="Stand"><Select value={item.status} onChange={(e) => updateCase(item, { status: e.target.value })}>
              {caseStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
            </Select></Field>
            <Field label="Zuständig"><Select value={item.assigned_user_id || ''} onChange={(e) => updateCase(item, { assignedUserId: e.target.value || null })}>
              <option value="">noch niemand</option>
              {users?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select></Field>
            <Field label="Interne Notiz" hint="Wird beim Verlassen des Feldes gespeichert."><TextArea defaultValue={item.internal_note || ''} onBlur={(e) => { if (e.target.value !== (item.internal_note || '')) updateCase(item, { internalNote: e.target.value }); }} style={{ minHeight: 64 }} /></Field>
          </div>
        </div>
      </Panel>;
    })}
  </Page>;
}
