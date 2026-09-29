import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { adminBase } from '../lib/paths.js';
import { takeSessionEnd } from './sessionEnd.js';
import { passwordHint, passwordProblem } from './passwordRules.js';
import { roleLabels } from './team.js';
import { Button, Field, Input, Notice, useAsync } from './ui.jsx';

// Sign-in, first setup, invitations and password resets. They appear before anyone is
// signed in, in the look the browser remembers or in the default look.

// What a password needs, as the server's settings say. While they are unknown the form still
// works and says so; the server checks the password when it is saved.
function usePasswordPolicy() {
  const { data, error } = useAsync(() => api('/admin/password-policy'), []);
  return { minLength: data?.minLength || null, maxBytes: data?.maxBytes || null, failed: Boolean(error) };
}

// A page of its own, named in the tab of the browser.
function AuthShell({ title, children }) {
  useEffect(() => {
    document.title = `${title} · qrating`;
  }, [title]);
  return <div className="flex min-h-screen items-center justify-center bg-q-bg p-4">
    <div className="q-panel w-full max-w-sm" style={{ padding: 24 }}>
      <p className="q-brand mb-3" style={{ padding: 0 }}>qrating</p>
      <h1 className="q-h1 mb-5" style={{ fontSize: 22 }}>{title}</h1>
      {children}
    </div>
  </div>;
}

// After a reset, an invitation or a setup somebody else finished, the way leads to the sign-in,
// where the new password already works.
const toSignIn = () => window.location.assign(adminBase);

// The reason a field was refused, next to that field.
const fieldProps = (problem, field, id) => ({
  'aria-invalid': problem?.field === field || undefined,
  'aria-describedby': problem?.field === field ? id : undefined
});
const FieldProblem = ({ problem, field, id }) => (problem?.field === field
  ? <p id={id} role="alert" className="q-notice q-notice-error">{problem.text}</p>
  : null);

export function AuthGate({ onLogin }) {
  const { data, loading, error } = useAsync(async () => {
    let setup = null;
    try {
      setup = await api('/admin/setup/status');
    } catch (err) {
      // Once the first account exists the setup answers 404, and the sign-in follows.
      if (err?.status !== 404) throw err;
    }
    if (setup?.setupRequired) return { setup };
    try {
      return { me: await api('/admin/me') };
    } catch (err) {
      // Without a session the sign-in follows; any other failure is shown with its reason.
      if (err?.status === 401) return {};
      throw err;
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
    setupCode: '',
    organizationName: setup?.organization?.name || '',
    organizationSlug: setup?.organization?.slug || '',
    name: '',
    email: '',
    password: ''
  });
  // Which field a refusal belongs to: the code, the password, or the form as a whole.
  const [problem, setProblem] = useState(null);
  const [closed, setClosed] = useState('');
  const policy = { minLength: setup?.passwordMinLength || null, maxBytes: setup?.passwordMaxBytes || null };

  async function submit(e) {
    e.preventDefault();
    setProblem(null);
    const passwordText = passwordProblem(form.password, policy);
    if (passwordText) {
      setProblem({ field: 'password', text: passwordText });
      return;
    }
    try {
      const data = await api('/admin/setup/first-admin', { method: 'POST', body: JSON.stringify(form) });
      onLogin(data.user);
    } catch (err) {
      // Somebody finished the setup meanwhile: the way on is the sign-in.
      if (err.status === 404) {
        setClosed(err.message);
        return;
      }
      setProblem({ field: err.status === 403 ? 'code' : 'form', text: err.message });
    }
  }

  if (closed) return <AuthShell title="qrating einrichten">
    <p role="alert" className="q-notice q-notice-info">{closed}</p>
    <Button className="mt-4" variant="primary" onClick={toSignIn}>Zur Anmeldung</Button>
  </AuthShell>;

  return <AuthShell title="qrating einrichten">
    <p className="mb-4 text-q-muted">Diese Installation hat noch keinen Admin. Das erste Konto wird Owner, führt die Plattform und lädt danach weitere Personen ein.</p>
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Einrichtungscode" hint={`Er steht im Log des Backends. Einen neuen Code zeigt: ${setup?.setupCodeCommand || ''}`}>
        <Input value={form.setupCode} onChange={(e) => setForm({ ...form, setupCode: e.target.value })} autoComplete="off" autoFocus required {...fieldProps(problem, 'code', 'setup-code-problem')} />
      </Field>
      <FieldProblem problem={problem} field="code" id="setup-code-problem" />
      <Field label="Organisation"><Input value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required /></Field>
      <Field label="Organisations-Slug"><Input value={form.organizationSlug} onChange={(e) => setForm({ ...form, organizationSlug: e.target.value })} required /></Field>
      <Field label="Dein Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
      <Field label="E-Mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
      <Field label="Passwort" hint={passwordHint(policy)}>
        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={policy.minLength || undefined} autoComplete="new-password" required {...fieldProps(problem, 'password', 'setup-password-problem')} />
      </Field>
      <FieldProblem problem={problem} field="password" id="setup-password-problem" />
      <FieldProblem problem={problem} field="form" id="setup-problem" />
      <Button type="submit" variant="primary">Ersten Admin anlegen</Button>
    </form>
  </AuthShell>;
}

// The second step for an account with a second factor. It follows the password wherever the
// password was typed in: at the sign-in, after a reset and with an invitation.
function TwoFactorStep({ challenge, intro, onLogin, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/admin/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken: challenge.challengeToken, code })
      });
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return <AuthShell title="2FA bestätigen">
    <form onSubmit={submit} className="grid gap-3">
      <p className="text-q-muted">{intro || 'Gib den Code aus deiner Authenticator-App oder einen Recovery-Code ein.'}</p>
      <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus inputMode="numeric" autoComplete="one-time-code" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Anmelden</Button>
      {onBack && <Button variant="ghost" onClick={onBack}>Zurück zur Anmeldung</Button>}
    </form>
  </AuthShell>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // A session that ended in the middle of work says why, once. The reason arrives after the page
  // is drawn, in a live region that is there already, so screen readers announce it.
  const [ended, setEnded] = useState('');
  useEffect(() => {
    const reason = takeSessionEnd();
    if (reason) setEnded(`Du wurdest abgemeldet. ${reason}`);
  }, []);

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
        return;
      }
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
      await api('/admin/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage('Wenn ein Konto mit dieser E-Mail-Adresse besteht, ist jetzt ein Link zum Zurücksetzen unterwegs. Kommt keine Mail an, wende dich an die Person, die eure qrating-Installation betreibt.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (twoFactor) return <TwoFactorStep challenge={twoFactor} onLogin={onLogin} onBack={() => setTwoFactor(null)} />;

  return <AuthShell title="Anmelden">
    <div role="status">{ended && <p className="q-notice q-notice-info mb-4">{ended}</p>}</div>
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
  const [twoFactor, setTwoFactor] = useState(null);
  const policy = usePasswordPolicy();
  // Where the invitation leads and the name the owner gave, before anyone types a password.
  const { data: invitation, error: invitationError, loading } = useAsync(
    () => (token ? api('/admin/accept-invite/preview', { method: 'POST', body: JSON.stringify({ token }) }) : Promise.resolve(null)),
    [token]
  );
  useEffect(() => {
    if (invitation?.name) setName((current) => current || invitation.name);
  }, [invitation?.name]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const passwordText = passwordProblem(password, policy);
    if (passwordText) {
      setError(passwordText);
      return;
    }
    try {
      const data = await api('/admin/accept-invite', { method: 'POST', body: JSON.stringify({ token, name, password }) });
      if (data.twoFactorRequired) {
        setTwoFactor(data);
        return;
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  if (twoFactor) return <TwoFactorStep challenge={twoFactor} intro="Dein Passwort ist gespeichert. Bestätige die Anmeldung mit dem Code aus deiner Authenticator-App oder einem Recovery-Code. Du kannst dich auch später mit dem neuen Passwort anmelden." onLogin={onLogin} onBack={toSignIn} />;
  if (!token) return <AuthShell title="Einladung abschließen">
    <p role="alert" className="q-notice q-notice-error">Der Einladungslink ist unvollständig. Öffne ihn direkt aus der Einladungs-E-Mail.</p>
  </AuthShell>;
  if (loading) return <AuthShell title="Einladung abschließen"><p className="text-q-muted">Einladung wird geprüft …</p></AuthShell>;
  // A link that cannot be used any more leads to the sign-in; any other failure to another try.
  if (invitationError) return <AuthShell title="Einladung abschließen">
    <p role="alert" className="q-notice q-notice-error">{invitationError.message}</p>
    {invitationError.status === 400
      ? <Button className="mt-4" onClick={toSignIn}>Zur Anmeldung</Button>
      : <Button className="mt-4" onClick={() => window.location.reload()}>Seite neu laden</Button>}
  </AuthShell>;
  return <AuthShell title="Einladung abschließen">
    {invitation && <p className="mb-4 text-q-muted">Einladung zu {invitation.organization} als {roleLabels[invitation.role] || invitation.role}, für {invitation.email}.</p>}
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Dein Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Neues Passwort" hint={passwordHint(policy)}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Konto aktivieren</Button>
    </form>
  </AuthShell>;
}

export function ResetPassword({ token, onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [twoFactor, setTwoFactor] = useState(null);
  const policy = usePasswordPolicy();
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Der Link zum Zurücksetzen ist unvollständig. Öffne ihn direkt aus der E-Mail.');
      return;
    }
    const passwordText = passwordProblem(password, policy);
    if (passwordText) {
      setError(passwordText);
      return;
    }
    try {
      const data = await api('/admin/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) });
      if (data.twoFactorRequired) {
        setTwoFactor(data);
        return;
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    }
  }
  if (twoFactor) return <TwoFactorStep challenge={twoFactor} intro="Dein neues Passwort ist gespeichert. Bestätige die Anmeldung mit dem Code aus deiner Authenticator-App oder einem Recovery-Code. Du kannst dich auch später mit dem neuen Passwort anmelden." onLogin={onLogin} onBack={toSignIn} />;
  return <AuthShell title="Passwort neu setzen">
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Neues Passwort" hint={passwordHint(policy)}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      {error && <p role="alert" className="q-notice q-notice-error">{error}</p>}
      <Button type="submit" variant="primary">Passwort speichern</Button>
    </form>
  </AuthShell>;
}
