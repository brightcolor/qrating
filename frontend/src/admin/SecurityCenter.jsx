import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';

function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let active = true;
    setState((old) => ({ ...old, loading: true, error: null }));
    fn()
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }));
    return () => {
      active = false;
    };
  }, deps);
  return state;
}

function Panel({ title, children }) {
  return <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
    {title && <h2 className="text-lg font-semibold">{title}</h2>}
    <div className={title ? 'mt-4' : ''}>{children}</div>
  </section>;
}

function Stat({ title, value }) {
  return <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
    <p className="text-sm text-neutral-500">{title}</p>
    <p className="mt-2 text-2xl font-semibold">{value}</p>
  </div>;
}

function ErrorBox({ error }) {
  return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message || String(error)}</p>;
}

function CheckRow({ item }) {
  const Icon = item.ok ? CheckCircle2 : ShieldAlert;
  return <div className={`rounded-md border p-3 ${item.ok ? 'border-emerald-200 bg-emerald-50' : item.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
    <div className="flex items-start gap-3">
      <Icon className={item.ok ? 'text-emerald-700' : item.severity === 'critical' ? 'text-red-700' : 'text-amber-700'} size={18} />
      <div>
        <p className="font-medium">{item.label}</p>
        {item.detail && <p className="mt-1 text-sm text-neutral-600">{item.detail}</p>}
      </div>
    </div>
  </div>;
}

function TwoFactorSetup({ onRefresh }) {
  const { data: me, loading } = useAsync(() => api('/admin/me'), []);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [message, setMessage] = useState('');
  const [enabledOverride, setEnabledOverride] = useState(null);
  const enabled = enabledOverride ?? me?.twoFactorEnabled;

  async function startSetup() {
    setMessage('');
    setSetup(await api('/admin/2fa/setup', { method: 'POST', body: '{}' }));
  }

  async function confirmSetup() {
    const result = await api('/admin/2fa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
    setRecoveryCodes(result.recoveryCodes || []);
    setSetup(null);
    setEnabledOverride(true);
    setMessage('2FA ist aktiv. Bewahre die Recovery-Codes sicher auf.');
    onRefresh?.();
  }

  async function disable2fa() {
    await api('/admin/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) });
    setPassword('');
    setCode('');
    setEnabledOverride(false);
    setMessage('2FA wurde deaktiviert.');
    onRefresh?.();
  }

  if (loading) return <p className="text-sm text-neutral-500">Lade 2FA-Status ...</p>;
  return <div className="space-y-4">
    <div className="rounded-md bg-neutral-50 p-4">
      <p className="font-medium">Status: {enabled ? 'aktiv' : 'nicht aktiv'}</p>
      <p className="mt-1 text-sm text-neutral-600">2FA schuetzt Admin-Zugaenge auch dann, wenn ein Passwort kompromittiert wird.</p>
    </div>
    {message && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    {!enabled && !setup && <button className="button-primary" onClick={startSetup}><ShieldCheck size={16} /> 2FA einrichten</button>}
    {setup && <div className="space-y-4 rounded-md border border-neutral-200 p-4">
      <div className="max-w-44" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
      <p className="text-sm text-neutral-600">Scanne den QR-Code mit deiner Authenticator-App oder trage diesen Secret manuell ein:</p>
      <code className="block rounded-md bg-neutral-100 p-3 text-sm">{setup.secret}</code>
      <input className="input" inputMode="numeric" placeholder="6-stelliger Code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="button-primary" onClick={confirmSetup}>Code bestaetigen</button>
    </div>}
    {recoveryCodes.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="font-medium text-amber-950">Recovery-Codes nur jetzt sichtbar</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{recoveryCodes.map((item) => <code key={item} className="rounded bg-white px-2 py-1 text-sm">{item}</code>)}</div>
    </div>}
    {enabled && <div className="grid gap-3 md:grid-cols-2">
      <input className="input" type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="input" placeholder="2FA- oder Recovery-Code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="button-secondary md:col-span-2" onClick={disable2fa}><EyeOff size={16} /> 2FA deaktivieren</button>
    </div>}
  </div>;
}

export function SecurityCenter() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/security-center'), [reload]);
  const { data: pii, error: piiError } = useAsync(() => api('/admin/pii-vault'), [reload]);
  const [revealed, setRevealed] = useState({});
  const [message, setMessage] = useState('');

  async function revealLowCase(id) {
    setRevealed({ ...revealed, [id]: await api(`/admin/pii-vault/low-rating-cases/${id}/reveal`, { method: 'POST', body: '{}' }) });
  }

  async function revealNewsletter(id) {
    setRevealed({ ...revealed, [`newsletter-${id}`]: await api(`/admin/pii-vault/newsletter-optins/${id}/reveal`, { method: 'POST', body: '{}' }) });
  }

  async function deleteLowCaseContact(id) {
    await api(`/admin/pii-vault/low-rating-cases/${id}/contact`, { method: 'DELETE' });
    setMessage('Kontaktdaten geloescht.');
    setReload(reload + 1);
  }

  async function deleteNewsletter(id) {
    await api(`/admin/pii-vault/newsletter-optins/${id}`, { method: 'DELETE' });
    setMessage('Newsletter-Opt-in geloescht.');
    setReload(reload + 1);
  }

  async function cleanupLegacy() {
    const result = await api('/admin/pii-vault/cleanup-legacy', { method: 'POST', body: '{}' });
    setMessage(`Legacy-Bereinigung abgeschlossen. Newsletter-Zeilen bereinigt: ${result.newsletterRows || 0}.`);
    setReload(reload + 1);
  }

  return <div>
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <div>
        <h1 className="text-3xl font-semibold">Security Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600">Produktionschecks, 2FA, PII-Vault und Audit-Log fuer sensible Datenzugriffe.</p>
      </div>
      <button onClick={() => setReload(reload + 1)} className="button-secondary"><RefreshCw size={16} /> Aktualisieren</button>
    </div>
    {message && <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    {error && <div className="mt-4"><ErrorBox error={error} /></div>}
    {loading && <p className="mt-4 text-sm text-neutral-500">Lade Security Center ...</p>}
    {data && <div className="mt-6 grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Aktive User" value={data.summary.activeUsers} />
        <Stat title="User mit 2FA" value={data.summary.usersWith2fa} />
        <Stat title="Admin ohne 2FA" value={data.summary.adminsWithout2fa} />
        <Stat title="Legacy PII" value={(data.summary.legacyNewsletterRows || 0) + (data.summary.legacyWebhookSecrets || 0)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Production Checks">
          <div className="grid gap-3">{data.checks.map((item) => <CheckRow key={item.id} item={item} />)}</div>
        </Panel>
        <Panel title="2FA fuer deinen Account">
          <TwoFactorSetup onRefresh={() => setReload(reload + 1)} />
        </Panel>
      </div>
      <Panel title="PII Vault">
        {piiError && <ErrorBox error={piiError} />}
        {pii && <div className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat title="Low-Rating Kontakte" value={pii.summary.low_rating_contacts || 0} />
            <Stat title="Newsletter Kontakte" value={pii.summary.newsletter_contacts || 0} />
            <Stat title="Legacy Newsletter" value={pii.summary.legacy_newsletter_plaintext || 0} />
            <Stat title="Legacy Webhook Secrets" value={pii.summary.legacy_webhook_secrets || 0} />
          </div>
          <button onClick={cleanupLegacy} className="button-secondary w-fit">Legacy-Klartext bereinigen</button>
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <h3 className="font-semibold">Low-Rating Kontakte</h3>
              <div className="mt-3 space-y-2">
                {pii.lowRatingCases.map((item) => <div key={item.id} className="rounded-md border border-neutral-200 p-3 text-sm">
                  <strong>{item.event_name}</strong>
                  <p className="text-neutral-500">{item.rating} Sterne - {item.status}</p>
                  {revealed[item.id] && <p className="mt-2 rounded bg-neutral-50 p-2">Telefon: {revealed[item.id].contactPhone || '-'}<br />Hinweis: {revealed[item.id].contactNote || '-'}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="button-secondary" onClick={() => revealLowCase(item.id)}><Eye size={16} /> Anzeigen</button>
                    <button className="button-secondary" onClick={() => deleteLowCaseContact(item.id)}><Trash2 size={16} /> Loeschen</button>
                  </div>
                </div>)}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Newsletter Opt-ins</h3>
              <div className="mt-3 space-y-2">
                {pii.newsletterOptins.map((item) => <div key={item.id} className="rounded-md border border-neutral-200 p-3 text-sm">
                  <strong>{item.event_name || 'Ohne Event'}</strong>
                  <p className="text-neutral-500">{item.email_domain || 'keine Domain'} - {item.legacy_plaintext ? 'Legacy-Klartext vorhanden' : 'verschluesselt'}</p>
                  {revealed[`newsletter-${item.id}`] && <p className="mt-2 rounded bg-neutral-50 p-2">{revealed[`newsletter-${item.id}`].email}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="button-secondary" onClick={() => revealNewsletter(item.id)}><Eye size={16} /> Anzeigen</button>
                    <button className="button-secondary" onClick={() => deleteNewsletter(item.id)}><Trash2 size={16} /> Loeschen</button>
                  </div>
                </div>)}
              </div>
            </div>
          </div>
        </div>}
      </Panel>
      <Panel title="Letzte Audit-Events">
        <div className="space-y-2">{data.recentAudit.map((item) => <div key={item.id} className="rounded-md bg-neutral-50 p-3 text-sm">
          <strong>{item.action}</strong>
          <p className="text-neutral-500">{item.user_email || 'System'} - {new Date(item.created_at).toLocaleString('de-DE')}</p>
        </div>)}</div>
      </Panel>
    </div>}
  </div>;
}
