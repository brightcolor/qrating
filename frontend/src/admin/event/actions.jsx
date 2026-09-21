import React, { useRef, useState } from 'react';
import { API_BASE, api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventLabel } from '../eventLabel.js';
import { Icon, useDismiss } from '../ui.jsx';

// The three things every header of an event offers: look at the guest page, take the report
// along, switch to another event. Each look draws them its own way; they work the same.

// Opens the guest page of the event, also outside its round. The tab opens at once, before the
// signed link arrives, so the browser does not treat it as an unwanted pop-up.
export async function openPreview(eventId, onError) {
  const tab = window.open('', '_blank');
  try {
    const { url } = await api(`/admin/events/${eventId}/preview-link`);
    if (tab) tab.location = url;
    else window.location.href = url;
  } catch (err) {
    tab?.close();
    onError?.(err);
  }
}

export function PreviewButton({ event, onError, className = 'q-btn q-btn-secondary', label = 'Gästeseite', iconSize = 16 }) {
  return <button type="button" className={className} onClick={() => openPreview(event.id, onError)}>
    <Icon name="eye" size={iconSize} />{label}
  </button>;
}

export function ReportMenu({ event, onMessage, className = 'q-btn q-btn-secondary', label = 'Bericht', align = 'right', iconSize = 16 }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, () => setOpen(false), open);

  async function mail() {
    setOpen(false);
    try {
      await api(`/admin/events/${event.id}/report-email`, { method: 'POST', body: '{}' });
      onMessage?.('Der Bericht als PDF wird erstellt und an deine E-Mail-Adresse geschickt.');
    } catch (err) {
      onMessage?.({ tone: 'error', text: err.message });
    }
  }

  return <div ref={box} className="relative inline-block">
    <button type="button" className={className} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
      <Icon name="download" size={iconSize} />{label}
    </button>
    {open && <div role="menu" className={`q-menu ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ top: 'calc(100% + 4px)' }}>
      <a role="menuitem" className="q-menu-item" href={`${API_BASE}/admin/events/${event.id}/report.pdf`} onClick={() => setOpen(false)}><Icon name="file" />Bericht als PDF</a>
      <a role="menuitem" className="q-menu-item" href={`${API_BASE}/admin/events/${event.id}/export.xlsx`} onClick={() => setOpen(false)}><Icon name="download" />Alle Antworten als Excel</a>
      <a role="menuitem" className="q-menu-item" href={`${API_BASE}/admin/events/${event.id}/export.csv`} onClick={() => setOpen(false)}><Icon name="download" />Alle Antworten als CSV</a>
      <hr />
      <button type="button" role="menuitem" className="q-menu-item" onClick={mail}><Icon name="mail" />Bericht per E-Mail an mich</button>
    </div>}
  </div>;
}

export function EventSwitcher({ event, tab, className = 'q-btn q-btn-secondary', label, align = 'left', iconSize = 15 }) {
  const { events, go } = useAdmin();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(box, () => setOpen(false), open);
  const sorted = [...events].sort((a, b) => new Date(b.date_from) - new Date(a.date_from));
  return <div ref={box} className="relative inline-block">
    <button type="button" className={className} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
      {label ?? <span className="truncate">{event?.name}</span>}
      <Icon name="chevronsUpDown" size={iconSize} />
    </button>
    {open && <div role="menu" className={`q-menu ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ top: 'calc(100% + 4px)', maxHeight: 360, overflowY: 'auto', minWidth: 300 }}>
      <p className="q-menu-title">Event wechseln</p>
      {sorted.map((item) => <button key={item.id} type="button" role="menuitem" className="q-menu-item" aria-current={item.id === event?.id ? 'true' : undefined} onClick={() => { setOpen(false); go({ page: 'event', eventId: item.id, tab }); }}>
        <span className="min-w-0 truncate">{eventLabel(item)}</span>
      </button>)}
    </div>}
  </div>;
}
