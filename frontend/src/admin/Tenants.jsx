import React, { useState } from 'react';
import { Building2, LogIn, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';

function Panel({ title, children, action }) {
  return <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
    {(title || action) && <div className="mb-4 flex items-start justify-between gap-3">
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      {action}
    </div>}
    {children}
  </section>;
}

function Notice({ message }) {
  if (!message) return null;
  const isError = typeof message === 'object' && message.tone === 'error';
  const text = typeof message === 'object' ? message.text : message;
  return <p role={isError ? 'alert' : 'status'} className={`mt-4 rounded-md p-3 text-sm ${isError ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>{text}</p>;
}

function errorNotice(error) {
  return { tone: 'error', text: error?.message || String(error) };
}

export function Tenants() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ name: '', slug: '' });

  async function load() {
    setLoading(true);
    try {
      setData(await api('/admin/platform/organizations'));
    } catch (error) {
      setMessage(errorNotice(error));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function createTenant(submitEvent) {
    submitEvent.preventDefault();
    setMessage('');
    try {
      const created = await api('/admin/platform/organizations', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ name: '', slug: '' });
      setMessage(`Mandant „${created.name}“ angelegt. Slug: ${created.slug}`);
      load();
    } catch (error) {
      setMessage(errorNotice(error));
    }
  }

  async function enter(organization) {
    setMessage('');
    try {
      await api(`/admin/platform/organizations/${organization.id}/enter`, { method: 'POST', body: '{}' });
      // Every page holds data of the previous tenant, so the admin area starts fresh.
      window.location.reload();
    } catch (error) {
      setMessage(errorNotice(error));
    }
  }

  const organizations = data?.organizations || [];
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mandanten</h1>
        <p className="mt-1 text-neutral-600">Jeder Mandant hat eigene Events, Formulare, Texte und Gäste. Betrete einen Mandanten, um darin zu arbeiten.</p>
      </div>
      <button onClick={load} className="button-secondary"><RefreshCw size={16} /> Neu laden</button>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {loading && <Panel><p className="text-sm text-neutral-500">Lade Mandanten …</p></Panel>}
        {organizations.map((organization) => {
          const here = organization.id === data.currentOrganizationId;
          const home = organization.id === data.homeOrganizationId;
          return <Panel key={organization.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 size={18} className="text-neutral-500" />
                  <strong className="text-lg">{organization.name}</strong>
                  <span className="font-mono text-xs text-neutral-500">{organization.slug}</span>
                  {here && <span className="rounded-full bg-neutral-950 px-2 py-1 text-xs text-white">Hier bist du</span>}
                  {home && <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">Dein Konto</span>}
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  Tarif {organization.plan}{organization.planSource === 'override' ? ' (Override)' : ''} · {organization.events} aktive Events · {organization.feedbacks} Bewertungen · {organization.users} Benutzer · {organization.pretixConnections} Pretix-Verbindungen
                </p>
              </div>
              {here
                ? <span className="text-sm text-neutral-500">Aktueller Mandant</span>
                : <button onClick={() => enter(organization)} className="button-primary"><LogIn size={16} /> Betreten</button>}
            </div>
          </Panel>;
        })}
        {!loading && organizations.length === 0 && <Panel><p className="text-sm text-neutral-500">Noch kein Mandant angelegt.</p></Panel>}
      </div>

      <Panel title="Neuer Mandant">
        <form onSubmit={createTenant} className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input className="input mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Stadthalle Wismar" required />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Slug, optional</span>
            <input className="input mt-1" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="stadthalle-wismar" />
            <span className="mt-1 block text-xs text-neutral-500">Der Slug steht im QR-Code des Mandanten und lässt sich später nicht mehr ändern. Leer lassen bildet ihn aus dem Namen.</span>
          </label>
          <button className="button-blue w-full"><Plus size={16} /> Mandant anlegen</button>
        </form>
        <Notice message={message} />
      </Panel>
    </div>
  </div>;
}
