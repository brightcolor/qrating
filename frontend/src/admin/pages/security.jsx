import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { eventLabel, formatDate } from '../eventLabel.js';
import { Button, ErrorBox, Icon, Input, Loading, Notice, Panel, errorNotice, useAsync } from '../ui.jsx';

function Figure({ label, value, tone }) {
  return <div className="q-panel" style={{ padding: 12 }}>
    <p className="q-label">{label}</p>
    <p className={`q-num mt-1 ${tone === 'bad' ? 'text-q-danger' : ''}`} style={{ fontSize: 24 }}>{value}</p>
  </div>;
}

// Written out in full, so Tailwind finds every class in the source.
const tones = {
  ok: { box: 'bg-q-ok-soft', icon: 'text-q-ok' },
  danger: { box: 'bg-q-danger-soft', icon: 'text-q-danger' },
  warn: { box: 'bg-q-warn-soft', icon: 'text-q-warn' }
};

function CheckRow({ item }) {
  const tone = tones[item.ok ? 'ok' : item.severity === 'critical' ? 'danger' : 'warn'];
  return <div className={`flex items-start gap-3 rounded-lg p-3 ${tone.box}`}>
    <Icon name={item.ok ? 'check' : 'alert'} size={18} className={`mt-0.5 ${tone.icon}`} />
    <div>
      <p className="font-semibold">{item.label}</p>
      {item.detail && <p className="mt-0.5 text-q-muted">{item.detail}</p>}
    </div>
  </div>;
}

function TwoFactorSetup({ onRefresh }) {
  const { me, reloadMe } = useAdmin();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [message, setMessage] = useState('');
  const [enabledOverride, setEnabledOverride] = useState(null);
  const enabled = enabledOverride ?? me?.twoFactorEnabled;

  async function startSetup() {
    setMessage('');
    try {
      setSetup(await api('/admin/2fa/setup', { method: 'POST', body: '{}' }));
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function confirmSetup() {
    setMessage('');
    if (!code.trim()) {
      setMessage(errorNotice({ message: 'Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.' }));
      return;
    }
    try {
      const result = await api('/admin/2fa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
      setRecoveryCodes(result.recoveryCodes || []);
      setSetup(null);
      setCode('');
      setEnabledOverride(true);
      setMessage('2FA ist aktiv. Bewahre die Recovery-Codes sicher auf.');
      reloadMe?.();
      onRefresh?.();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function disable2fa() {
    setMessage('');
    if (!password || !code.trim()) {
      setMessage(errorNotice({ message: 'Zum Ausschalten brauchst du dein Passwort und einen aktuellen 2FA- oder Recovery-Code.' }));
      return;
    }
    try {
      await api('/admin/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) });
      setPassword('');
      setCode('');
      setEnabledOverride(false);
      setMessage('2FA ist ausgeschaltet.');
      reloadMe?.();
      onRefresh?.();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div className="grid gap-3">
    <p><strong>{enabled ? '2FA ist aktiv.' : '2FA ist nicht aktiv.'}</strong> <span className="text-q-muted">Sie schützt deinen Zugang auch dann, wenn jemand dein Passwort kennt.</span></p>
    <Notice message={message} />
    {!enabled && !setup && <div><Button variant="primary" icon="shield" onClick={startSetup}>2FA einrichten</Button></div>}
    {setup && <div className="grid gap-3 rounded-lg border border-q-line p-3">
      <div className="max-w-44 rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
      <p className="text-q-muted">Scanne den QR-Code mit deiner Authenticator-App oder trage diesen Schlüssel von Hand ein:</p>
      <code className="block break-all rounded-md bg-q-sunken p-2">{setup.secret}</code>
      <Input inputMode="numeric" placeholder="6-stelliger Code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" aria-label="Code aus der App" />
      <div><Button variant="primary" onClick={confirmSetup}>Code bestätigen</Button></div>
    </div>}
    {recoveryCodes.length > 0 && <div className="rounded-lg bg-q-warn-soft p-3">
      <p className="font-semibold">Recovery-Codes, nur jetzt sichtbar</p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{recoveryCodes.map((item) => <code key={item} className="rounded bg-q-surface px-2 py-1">{item}</code>)}</div>
    </div>}
    {enabled && <div className="grid gap-2 sm:grid-cols-2">
      <Input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Passwort" />
      <Input placeholder="2FA- oder Recovery-Code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" aria-label="2FA- oder Recovery-Code" />
      <div className="sm:col-span-2"><Button icon="shield" onClick={disable2fa}>2FA ausschalten</Button></div>
    </div>}
  </div>;
}

export function SecurityCenter() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/security-center'), [reload]);
  const { data: pii, error: piiError } = useAsync(() => api('/admin/pii-vault'), [reload]);
  const [revealed, setRevealed] = useState({});
  const [message, setMessage] = useState('');

  async function run(action, success) {
    setMessage('');
    try {
      const result = await action();
      if (success) setMessage(typeof success === 'function' ? success(result) : success);
      return result;
    } catch (err) {
      setMessage(errorNotice(err));
      return null;
    }
  }

  async function revealCase(id) {
    const result = await run(() => api(`/admin/pii-vault/low-rating-cases/${id}/reveal`, { method: 'POST', body: '{}' }));
    if (result) setRevealed((old) => ({ ...old, [id]: result }));
  }

  async function revealNewsletter(id) {
    const result = await run(() => api(`/admin/pii-vault/newsletter-optins/${id}/reveal`, { method: 'POST', body: '{}' }));
    if (result) setRevealed((old) => ({ ...old, [`newsletter-${id}`]: result }));
  }

  return <div className="grid gap-4">
    <Notice message={message} />
    <ErrorBox error={error} />
    {loading && <Loading />}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Aktive Personen" value={data.summary.activeUsers} />
        <Figure label="mit 2FA" value={data.summary.usersWith2fa} />
        <Figure label="Admins ohne 2FA" value={data.summary.adminsWithout2fa} tone={data.summary.adminsWithout2fa ? 'bad' : ''} />
        <Figure label="Alte Klartextdaten" value={(data.summary.legacyNewsletterRows || 0) + (data.summary.legacyWebhookSecrets || 0)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Prüfungen der Installation" actions={<Button size="sm" icon="refresh" onClick={() => setReload(reload + 1)}>Neu prüfen</Button>}>
          <div className="grid gap-2">{data.checks.map((item) => <CheckRow key={item.id} item={item} />)}</div>
        </Panel>
        <Panel title="2FA für dein Konto"><TwoFactorSetup onRefresh={() => setReload(reload + 1)} /></Panel>
      </div>
    </>}
    <Panel title="Geschützte Kontaktdaten" note="Jedes Anzeigen landet im Protokoll.">
      <ErrorBox error={piiError} />
      {pii && <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3 text-q-muted">
          <span>{pii.summary.low_rating_contacts || 0} Rückrufnummern</span>
          <span>{pii.summary.newsletter_contacts || 0} Newsletter-Adressen</span>
          <span>{(pii.summary.legacy_newsletter_plaintext || 0) + (pii.summary.legacy_webhook_secrets || 0)} alte Klartextdaten</span>
          <Button size="sm" onClick={async () => { if (await run(() => api('/admin/pii-vault/cleanup-legacy', { method: 'POST', body: '{}' }), (result) => `Bereinigung abgeschlossen. Bereinigte Newsletter-Zeilen: ${result.newsletterRows || 0}.`)) setReload(reload + 1); }}>Alte Klartextdaten bereinigen</Button>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="q-panel-title mb-2">Rückrufnummern</h3>
            <div className="grid gap-2">
              {pii.lowRatingCases.map((item) => <div key={item.id} className="rounded-lg border border-q-line p-3">
                <strong>{eventLabel(item)}</strong>
                <p className="text-q-muted">{item.rating} Sterne, Status {item.status}</p>
                {revealed[item.id] && <p className="mt-2 rounded bg-q-sunken p-2">Telefon: {revealed[item.id].contactPhone || '–'}<br />Hinweis: {revealed[item.id].contactNote || '–'}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" icon="eye" onClick={() => revealCase(item.id)}>Anzeigen</Button>
                  <Button size="sm" icon="trash" onClick={async () => { if (await run(() => api(`/admin/pii-vault/low-rating-cases/${item.id}/contact`, { method: 'DELETE' }), 'Kontaktdaten gelöscht.')) setReload(reload + 1); }}>Löschen</Button>
                </div>
              </div>)}
              {!pii.lowRatingCases.length && <p className="text-q-muted">Keine gespeicherten Rückrufnummern.</p>}
            </div>
          </div>
          <div>
            <h3 className="q-panel-title mb-2">Newsletter-Adressen</h3>
            <div className="grid gap-2">
              {pii.newsletterOptins.map((item) => <div key={item.id} className="rounded-lg border border-q-line p-3">
                <strong>{item.event_name ? eventLabel(item) : 'Ohne Event'}</strong>
                <p className="text-q-muted">{item.email_domain || 'keine Domain'}, {item.legacy_plaintext ? 'noch im Klartext' : 'verschlüsselt'}</p>
                {revealed[`newsletter-${item.id}`] && <p className="mt-2 rounded bg-q-sunken p-2">{revealed[`newsletter-${item.id}`].email}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" icon="eye" onClick={() => revealNewsletter(item.id)}>Anzeigen</Button>
                  <Button size="sm" icon="trash" onClick={async () => { if (await run(() => api(`/admin/pii-vault/newsletter-optins/${item.id}`, { method: 'DELETE' }), 'Newsletter-Eintrag gelöscht.')) setReload(reload + 1); }}>Löschen</Button>
                </div>
              </div>)}
              {!pii.newsletterOptins.length && <p className="text-q-muted">Keine gespeicherten Adressen.</p>}
            </div>
          </div>
        </div>
      </div>}
    </Panel>
    {data && <Panel title="Letzte Einträge im Protokoll">
      <table className="q-table">
        <tbody>
          {data.recentAudit.map((item) => <tr key={item.id}>
            <td><strong>{item.action}</strong></td>
            <td className="text-q-muted">{item.user_email || 'System'}</td>
            <td className="r text-q-muted">{new Date(item.created_at).toLocaleString('de-DE')}</td>
          </tr>)}
        </tbody>
      </table>
    </Panel>}
  </div>;
}

export function Operations() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/operations'), [reload]);
  const [message, setMessage] = useState('');

  async function runRetention() {
    try {
      await api('/admin/operations/run-retention', { method: 'POST', body: '{}' });
      setMessage('Der Aufbewahrungsjob ist eingeplant.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div className="grid gap-4">
    <Notice message={message} />
    <ErrorBox error={error} />
    {loading && <Loading />}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="E-Mail-Versand" value={data.smtp?.enabled ? 'an' : 'aus'} />
        <Figure label="Pretix-Verbindungen" value={data.pretix?.length || 0} />
        <Figure label="Offene Jobs" value={data.recentJobs?.filter((job) => job.status !== 'failed').length || 0} />
        <Figure label="Fehlgeschlagene Jobs" value={data.recentJobs?.filter((job) => job.status === 'failed').length || 0} tone={data.recentJobs?.some((job) => job.status === 'failed') ? 'bad' : ''} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Jobs nach Art" actions={<Button size="sm" icon="refresh" onClick={() => setReload(reload + 1)}>Aktualisieren</Button>}>
          <table className="q-table">
            <thead><tr><th>Art</th><th>Stand</th><th className="r">Anzahl</th></tr></thead>
            <tbody>{data.jobs.map((row) => <tr key={`${row.job_type}-${row.status}`}><td>{row.job_type}</td><td>{row.status}</td><td className="r">{row.count}</td></tr>)}</tbody>
          </table>
          <Button className="mt-3" onClick={runRetention}>Aufbewahrungsjob jetzt einplanen</Button>
        </Panel>
        <Panel title="Offene und fehlgeschlagene Jobs">
          <div className="grid gap-2">
            {data.recentJobs.map((job) => <div key={job.id} className="border-b border-q-line pb-2 last:border-0">
              <strong>{job.job_type}</strong> <span className="text-q-muted">{job.status}, Versuch {job.attempts}/{job.max_attempts}</span>
              <p className="text-q-muted">{job.last_error || `geplant: ${formatDate(job.run_after)}`}</p>
            </div>)}
            {!data.recentJobs.length && <p className="text-q-muted">Keine offenen oder fehlgeschlagenen Jobs.</p>}
          </div>
        </Panel>
        <Panel title="Pretix-Abgleich">
          {data.pretix.map((connection) => <div key={connection.id} className="border-b border-q-line pb-2 last:border-0">
            <strong>{connection.pretix_organizer_slug}</strong>
            <p className="text-q-muted">Automatisch {connection.sync_enabled ? 'an' : 'aus'}, zuletzt erfolgreich {connection.last_successful_sync_at ? formatDate(connection.last_successful_sync_at) : '–'}</p>
            {connection.last_sync_error && <p className="text-q-danger">{connection.last_sync_error}</p>}
          </div>)}
          {!data.pretix.length && <p className="text-q-muted">Keine Pretix-Verbindung.</p>}
        </Panel>
        <Panel title="Webhooks">
          {data.webhooks.map((hook) => <div key={hook.id} className="border-b border-q-line pb-2 last:border-0">
            <p>Zuletzt {hook.last_status || '–'}, {hook.last_called_at ? formatDate(hook.last_called_at) : 'noch nicht aufgerufen'}</p>
            {hook.last_error && <p className="text-q-danger">{hook.last_error}</p>}
          </div>)}
          {!data.webhooks.length && <p className="text-q-muted">Keine Webhooks.</p>}
        </Panel>
      </div>
    </>}
  </div>;
}
