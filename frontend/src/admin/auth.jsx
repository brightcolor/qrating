import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, Input, Notice, useAsync } from './ui.jsx';

// Sign-in, first setup, invitations and password resets. They appear before anyone is
// signed in, in the look the browser remembers or in the default look.

function AuthShell({ title, children }) {
  return <div className="flex min-h-screen items-center justify-center bg-q-bg p-4">
    <div className="q-panel w-full max-w-sm" style={{ padding: 24 }}>
      <p className="q-brand mb-3" style={{ padding: 0 }}>qrating</p>
      <h1 className="q-h1 mb-5" style={{ fontSize: 22 }}>{title}</h1>
      {children}
    </div>
  </div>;
}

export function AuthGate({ onLogin }) {
  const { data, loading, error } = useAsync(async () => {
    const setup = await api('/admin/setup/status');
    if (setup?.setupRequired) return { setup };
    try {
      return { setup, me: await api('/admin/me') };
    } catch {
      return { setup };
    }
  }, []);
  useEffect(() => {
    if (data?.me) onLogin();
  }, [data?.me, onLogin]);
  if (loading) return <AuthShell title="Adminbereich"><p className="text-q-muted">Prüfe Installation …</p></AuthShell>;
  if (error) return <AuthShell title="Adminbereich">
    <p role="alert" className="q-notice q-notice-error">{error.message}</p>
    {(!error.status || error.status >= 502) && <p className="mt-4 text-q-muted">Für den Betrieb: Prüfe, ob die Container laufen (<code>docker compose ps</code>) und <code>/api/health</code> antwortet.</p>}
    <Button className="mt-4" onClick={() => window.location.reload()}>Seite neu laden</Button>
  </AuthShell>;
  if (data?.me) return <AuthShell title="Adminbereich"><p className="text-q-muted">Sitzung wird geöffnet …</p></AuthShell>;
  if (data?.setup?.setupRequired) return <FirstAdminSetup setup={data.setup} onLogin={onLogin} />;
  return <Login onLogin={onLogin} />;
}

function FirstAdminSetup({ setup, onLogin }) {
  const [form, setForm] = useState({
    organizationName: setup?.organization?.name || 'Demo Events',
    organizationSlug: setup?.organization?.slug || 'demo-events',
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/admin/setup/first-admin', { method: 'POST', body: JSON.stringify(form) });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return <AuthShell title="qrating einrichten">
    <p className="mb-4 text-q-muted">Diese Installation hat noch keinen Admin. Der erste Account wird Owner und kann danach weitere Benutzer einladen.</p>
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Organisation"><Input value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required /></Field>
      <Field label="Organisations-Slug"><Input value={form.organizationSlug} onChange={(e) => setForm({ ...form, organizationSlug: e.target.value })} required /></Field>
      <Field label="Dein Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      <Field label="E-Mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
      <Field label="Passwort" hint="Bitte nutze ein eigenes Passwort mit mindestens 10 Zeichen. qrating legt keinen Default-Admin an.">
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required />
      </Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Ersten Admin anlegen</Button>
    </form>
  </AuthShell>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Bitte gib deine E-Mail-Adresse und dein Passwort ein.');
      return;
    }
    try {
      const data = await api('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (data.twoFactorRequired) {
        setTwoFactor(data);
        setMessage('Bitte bestätige die Anmeldung mit dem Code aus deiner Authenticator-App.');
        return;
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitTwoFactor(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/admin/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken: twoFactor.challengeToken, code: twoFactorCode })
      });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function requestReset() {
    setMessage('');
    setError('');
    if (!email.trim()) {
      setError('Gib zuerst deine E-Mail-Adresse ein, dann schicken wir dir einen Link zum Zurücksetzen.');
      return;
    }
    try {
      const result = await api('/admin/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(result.resetUrl ? `Link zum Zurücksetzen: ${result.resetUrl}` : 'Wenn ein Konto mit dieser E-Mail-Adresse existiert, ist jetzt ein Link zum Zurücksetzen unterwegs.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (twoFactor) return <AuthShell title="2FA bestätigen">
    <form onSubmit={submitTwoFactor} className="grid gap-3">
      <p className="text-q-muted">Gib den Code aus deiner Authenticator-App oder einen Recovery-Code ein.</p>
      <Field label="Code"><Input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} autoFocus inputMode="numeric" autoComplete="one-time-code" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Notice message={message} />
      <Button type="submit" variant="primary">Anmelden</Button>
      <Button variant="ghost" onClick={() => setTwoFactor(null)}>Zurück zur Anmeldung</Button>
    </form>
  </AuthShell>;

  return <AuthShell title="Anmelden">
    <form onSubmit={submit} className="grid gap-3">
      <Field label="E-Mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
      <Field label="Passwort"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Notice message={message} />
      <Button type="submit" variant="primary">Anmelden</Button>
      <Button variant="ghost" onClick={requestReset}>Passwort zurücksetzen</Button>
    </form>
  </AuthShell>;
}

export function AcceptInvite({ token, onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Der Einladungslink ist unvollständig. Öffne ihn direkt aus der Einladungs-E-Mail.');
      return;
    }
    if (password.length < 10) {
      setError('Das Passwort muss mindestens 10 Zeichen lang sein.');
      return;
    }
    try {
      const data = await api('/admin/accept-invite', { method: 'POST', body: JSON.stringify({ token, name, password }) });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }
  return <AuthShell title="Einladung abschließen">
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Dein Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Neues Passwort" hint="Mindestens 10 Zeichen."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Account aktivieren</Button>
    </form>
  </AuthShell>;
}

export function ResetPassword({ token, onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Der Link zum Zurücksetzen ist unvollständig. Öffne ihn direkt aus der E-Mail.');
      return;
    }
    if (password.length < 10) {
      setError('Das Passwort muss mindestens 10 Zeichen lang sein.');
      return;
    }
    try {
      const data = await api('/admin/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }
  return <AuthShell title="Passwort neu setzen">
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Neues Passwort" hint="Mindestens 10 Zeichen."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Passwort speichern</Button>
    </form>
  </AuthShell>;
}
