import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CreditCard,
  Download,
  Activity,
  ExternalLink,
  FileText,
  Globe2,
  Image,
  Languages,
  LogOut,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Settings,
  Star,
  Trash2,
  Webhook
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles/index.css';
import { API_BASE, api, assetUrl } from './lib/api.js';
import { FormBuilder } from './admin/FormBuilder.jsx';
import { groupTextKeys, textLabels } from './admin/textCatalog.js';
import { eventLabel, formatDate } from './admin/eventLabel.js';

const SecurityCenter = React.lazy(() => import('./admin/SecurityCenter.jsx').then((module) => ({ default: module.SecurityCenter })));

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

function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).has('plan') || new URLSearchParams(window.location.search).has('billing') ? 'billing' : 'dashboard');
  const path = window.location.pathname;
  const query = new URLSearchParams(window.location.search);
  if (!authenticated && path.includes('/accept-invite')) return <AcceptInvite token={query.get('token')} onLogin={() => setAuthenticated(true)} />;
  if (!authenticated && path.includes('/reset-password')) return <ResetPassword token={query.get('token')} onLogin={() => setAuthenticated(true)} />;
  if (!authenticated) return <AuthGate onLogin={() => setAuthenticated(true)} />;
  const nav = [
    ['dashboard', 'Dashboard', BarChart3],
    ['security', 'Sicherheit', ShieldCheck],
    ['events', 'Events', CalendarDays],
    ['forms', 'Formulare', FileText],
    ['analytics', 'Auswertung', BarChart3],
    ['low-ratings', 'Low-Rating', Bell],
    ['texts', 'Texte', Languages],
    ['website', 'Website', Globe2],
    ['billing', 'Plan & Billing', CreditCard],
    ['branding', 'Branding', Image],
    ['qr', 'QR & Wallboard', QrCode],
    ['pretix', 'Pretix', Settings],
    ['notifications', 'Benachrichtigungen', Bell],
    ['operations', 'Betrieb', Activity],
    ['smtp', 'SMTP', Mail],
    ['webhooks', 'Webhooks', Webhook]
  ];
  return <div className="min-h-screen bg-neutral-100">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-neutral-200 bg-white p-5 lg:block">
      <div className="text-xl font-semibold">qrating</div>
      <TenantBadge />
      <nav className="mt-6 space-y-1">
        {nav.map(([id, label, Icon]) => <NavButton key={id} icon={Icon} label={label} active={page === id} onClick={() => setPage(id)} />)}
      </nav>
      <button className="absolute bottom-5 flex items-center gap-2 text-sm text-neutral-600" onClick={async () => { await api('/admin/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => null); setAuthenticated(false); }}><LogOut size={16} /> Abmelden</button>
    </aside>
    <main className="lg:pl-64">
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="mb-5 flex flex-wrap gap-2 lg:hidden">
          {nav.map(([id, label]) => <button key={id} onClick={() => setPage(id)} className="rounded-md bg-white px-3 py-2 text-sm">{label}</button>)}
        </div>
        {page === 'dashboard' && <Dashboard />}
        {page === 'security' && <React.Suspense fallback={<p>Lade Security Center ...</p>}><SecurityCenter /></React.Suspense>}
        {page === 'events' && <Events />}
        {page === 'forms' && <FormBuilder />}
        {page === 'analytics' && <Analytics />}
        {page === 'low-ratings' && <LowRatingWorkflow />}
        {page === 'texts' && <Texts />}
        {page === 'website' && <WebsiteContent />}
        {page === 'billing' && <Billing />}
        {page === 'branding' && <BrandingSettings />}
        {page === 'qr' && <QrAndWallboard />}
        {page === 'pretix' && <Pretix />}
        {page === 'notifications' && <Notifications />}
        {page === 'operations' && <Operations />}
        {page === 'smtp' && <SmtpSettings />}
        {page === 'webhooks' && <Webhooks />}
      </div>
    </main>
  </div>;
}

// Shows which tenant this login belongs to; the slug is the one in the QR codes.
function TenantBadge() {
  const { data } = useAsync(() => api('/admin/me'), []);
  if (!data?.organization_name) return null;
  return <div className="mt-4 rounded-md bg-neutral-100 px-3 py-2">
    <p className="text-sm font-semibold leading-tight">{data.organization_name}</p>
    <p className="mt-0.5 font-mono text-xs text-neutral-500">{data.organization_slug}</p>
  </div>;
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${active ? 'bg-neutral-950 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}><Icon size={18} /> {label}</button>;
}

function AuthGate({ onLogin }) {
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
  if (loading) return <AuthShell title="qrating Admin"><p className="text-sm text-neutral-600">Prüfe Installation …</p></AuthShell>;
  if (error) return <AuthShell title="qrating Admin">
    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
    {(!error.status || error.status >= 502) && <p className="mt-4 text-sm leading-6 text-neutral-600">Für den Betrieb: Prüfe, ob die Container laufen (<code>docker compose ps</code>) und <code>/api/health</code> antwortet.</p>}
    <button type="button" className="button-secondary mt-4" onClick={() => window.location.reload()}>Seite neu laden</button>
  </AuthShell>;
  if (data?.me) return <AuthShell title="qrating Admin"><p className="text-sm text-neutral-600">Sitzung wird geöffnet …</p></AuthShell>;
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
    <p className="mb-5 text-sm leading-6 text-neutral-600">Diese Installation hat noch keinen Admin. Der erste Account wird Owner und kann danach weitere Benutzer einladen.</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">Organisation<input className="input mt-2" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required /></label>
      <label className="block text-sm font-medium">Organisations-Slug<input className="input mt-2" value={form.organizationSlug} onChange={(e) => setForm({ ...form, organizationSlug: e.target.value })} required /></label>
      <label className="block text-sm font-medium">Dein Name<input className="input mt-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <label className="block text-sm font-medium">E-Mail<input className="input mt-2" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      <label className="block text-sm font-medium">Passwort<input className="input mt-2" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required /></label>
      <p className="text-xs leading-5 text-neutral-500">Bitte nutze ein eigenes Passwort mit mindestens 10 Zeichen. qrating legt keinen Default-Admin mehr an.</p>
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="button-primary w-full">Ersten Admin anlegen</button>
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
  if (twoFactor) return <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
    <form onSubmit={submitTwoFactor} className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">2FA bestätigen</h1>
      <p className="mt-3 text-sm text-neutral-600">Gib den Code aus deiner Authenticator-App oder einen Recovery-Code ein.</p>
      <label className="mt-6 block text-sm font-medium">Code<input className="mt-2 w-full rounded-md border px-3 py-2" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} autoFocus /></label>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Notice message={message} />
      <button className="mt-6 w-full rounded-md bg-neutral-950 px-4 py-3 font-semibold text-white">Einloggen</button>
      <button type="button" onClick={() => setTwoFactor(null)} className="mt-3 w-full text-sm text-neutral-600 hover:text-neutral-950">Zurück zur Anmeldung</button>
    </form>
  </div>;
  return <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
    <form onSubmit={submit} className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">qrating Admin</h1>
      <label className="mt-6 block text-sm font-medium">E-Mail<input className="mt-2 w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="mt-4 block text-sm font-medium">Passwort<input type="password" className="mt-2 w-full rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Notice message={message} />
      <button className="mt-6 w-full rounded-md bg-neutral-950 px-4 py-3 font-semibold text-white">Einloggen</button>
      <button type="button" onClick={requestReset} className="mt-3 w-full text-sm text-neutral-600 hover:text-neutral-950">Passwort zurücksetzen</button>
    </form>
  </div>;
}

function AcceptInvite({ token, onLogin }) {
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
    <form onSubmit={submit} className="space-y-4">
      <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" type="password" placeholder="Neues Passwort (mind. 10 Zeichen)" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="button-primary w-full">Account aktivieren</button>
    </form>
  </AuthShell>;
}

function ResetPassword({ token, onLogin }) {
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
    <form onSubmit={submit} className="space-y-4">
      <input className="input" type="password" placeholder="Neues Passwort (mind. 10 Zeichen)" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="button-primary w-full">Passwort speichern</button>
    </form>
  </AuthShell>;
}

function AuthShell({ title, children }) {
  return <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
    <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  </div>;
}

function Dashboard() {
  const { data, loading, error } = useAsync(() => api('/admin/dashboard'), []);
  if (loading) return <p>Lade Dashboard ...</p>;
  if (error) return <ErrorBox error={error} />;
  const chartData = [
    { name: 'Feedbacks', value: data.stats.feedback_count },
    { name: 'Newsletter', value: data.stats.newsletter_count }
  ];
  return <div>
    <h1 className="text-3xl font-semibold">Dashboard</h1>
    <div className="mt-6 grid gap-4 md:grid-cols-4">
      <Stat title="Aktuell bewertbar" value={data.currentEvent?.name || 'Kein Event'} />
      <Stat title="Feedbacks" value={data.stats.feedback_count || 0} />
      <Stat title="Durchschnitt" value={data.stats.average_rating || '-'} />
      <Stat title="Newsletter" value={data.stats.newsletter_count || 0} />
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <Panel title="Live-Kennzahlen"><div className="h-64"><ResponsiveContainer><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Dynamischer QR-Code">
        <p className="text-sm text-neutral-600">Zeigt automatisch auf das aktuell bewertbare Event.</p>
        <a className="mt-4 inline-flex items-center gap-2 rounded-md bg-neutral-950 px-4 py-2 text-white" href={`${API_BASE}/admin/organizations/${data.organization.id}/qr`} target="_blank"><QrCode size={16} /> QR anzeigen</a>
        <p className="mt-4 break-all text-sm text-neutral-500">{data.feedbackAppUrl}/f/{data.organization.slug}</p>
      </Panel>
    </div>
  </div>;
}

function Events() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/events'), [reload]);
  return <div>
    <Header title="Events" action={<button onClick={() => setReload(reload + 1)} className="button-secondary"><RefreshCw size={16} /> Aktualisieren</button>} />
    <EventCreate onCreated={() => setReload(reload + 1)} />
    {loading && <p>Lade Events ...</p>}
    {error && <ErrorBox error={error} />}
    <div className="mt-5 grid gap-4">{data?.map((event) => <EventCard key={event.id} event={event} />)}</div>
  </div>;
}

function EventCreate({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', dateFrom: new Date().toISOString().slice(0, 16), location: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/events', { method: 'POST', body: JSON.stringify({ ...form, dateFrom: new Date(form.dateFrom).toISOString() }) });
    } catch (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    setForm({ name: '', dateFrom: new Date().toISOString().slice(0, 16), location: '' });
    onCreated();
  }
  return <Panel>
    <button onClick={() => setOpen(!open)} className="button-primary"><Plus size={16} /> Neues Event</button>
    {open && <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
      <input className="input" placeholder="Eventname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input className="input" type="datetime-local" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} required />
      <input className="input" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 md:col-span-3">{error}</p>}
      <button className="button-blue md:col-span-3">Speichern</button>
    </form>}
  </Panel>;
}

function EventCard({ event }) {
  const eventUrl = event.feedbackUrl || `/e/${event.event_feedback_token}`;
  const [message, setMessage] = useState('');
  async function syncImage() {
    try {
      await api(`/admin/events/${event.id}/sync-image`, { method: 'POST', body: '{}' });
      setMessage('Das Bild wurde neu geladen. Aktualisiere die Liste, um es zu sehen.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <article className="rounded-lg bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-neutral-100">
          {event.image_url ? <img className="h-full w-full object-cover" src={assetUrl(event.image_url)} alt="" /> : <Image className="text-neutral-400" />}
        </div>
        <div>
          <div className="flex items-center gap-2"><h2 className="font-semibold">{event.name}</h2><span className="rounded bg-neutral-100 px-2 py-1 text-xs">{event.source}</span></div>
          <p className="mt-1 text-sm text-neutral-600">{formatDate(event.date_from)} · {event.location || 'Keine Location'}</p>
          <p className="mt-1 text-sm text-neutral-500">Bildquelle: {event.image_source || 'Fallback'} {event.detected_image_settings_key ? `· Key: ${event.detected_image_settings_key}` : ''}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="button-secondary" href={`${API_BASE}/admin/events/${event.id}/export.csv`}><Download size={16} /> CSV</a>
        <a className="button-secondary" href={`${API_BASE}/admin/events/${event.id}/export.xlsx`}><Download size={16} /> XLSX</a>
        <a className="button-secondary" href={`${API_BASE}/admin/events/${event.id}/report.pdf`}><FileText size={16} /> PDF</a>
        {event.source === 'pretix' && <button onClick={syncImage} className="button-secondary"><Image size={16} /> Bild neu laden</button>}
        <a className="button-secondary" href={`${API_BASE}/admin/events/${event.id}/qr-print`} target="_blank"><QrCode size={16} /> Druck</a>
        <a className="button-blue" href={eventUrl} target="_blank"><ExternalLink size={16} /> Feedback</a>
      </div>
    </div>
    <Notice message={message} className="mt-3" />
  </article>;
}

function Analytics() {
  const { data: events, loading, error: eventsError } = useAsync(() => api('/admin/events'), []);
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!eventId && events?.[0]) setEventId(events[0].id);
  }, [events, eventId]);
  const { data, error } = useAsync(() => eventId ? api(`/admin/events/${eventId}/analytics`) : Promise.resolve(null), [eventId]);
  async function sendReport() {
    if (!eventId) return;
    try {
      await api(`/admin/events/${eventId}/report-email`, { method: 'POST', body: '{}' });
      setMessage('Der PDF-Report wird erstellt und an deine E-Mail-Adresse geschickt.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="Erweiterte Auswertung" />
    <Panel>
      <div className="flex flex-wrap gap-3">
        <select className="input max-w-md" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {loading && <option>Lade Events ...</option>}
          {events?.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
        </select>
        <button onClick={sendReport} className="button-secondary"><Mail size={16} /> Report per E-Mail</button>
      </div>
      <Notice message={message} className="mt-3" />
    </Panel>
    {eventsError && <ErrorBox error={eventsError} />}
    {error && <ErrorBox error={error} />}
    {data && <div className="mt-6 grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Feedbacks" value={data.summary.total || 0} />
        <Stat title="Durchschnitt" value={data.summary.average_rating || '-'} />
        <Stat title="Newsletter" value={data.summary.newsletter_optins || 0} />
        <Stat title="Kommentare" value={data.comments.length || 0} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Bewertungsverteilung"><div className="h-72"><ResponsiveContainer><BarChart data={fillRatings(data.distribution)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="rating" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
        <Panel title="Verlauf"><div className="h-72"><ResponsiveContainer><LineChart data={data.timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" tickFormatter={(v) => new Date(v).getHours()} /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Panel>
      </div>
      <Panel title="Eigene Fragen">{data.questionStats.length ? <div className="space-y-2">{data.questionStats.slice(0, 20).map((row, idx) => <div key={`${row.id}-${idx}`} className="flex justify-between rounded-md bg-neutral-50 p-3 text-sm"><span>{row.label}: {JSON.stringify(row.answer_value)}</span><strong>{row.count}</strong></div>)}</div> : <p className="text-sm text-neutral-500">Noch keine auswertbaren Antworten.</p>}</Panel>
      <Panel title="Kommentare">{data.comments.map((comment) => <div key={comment.id} className="border-b border-neutral-100 py-3 text-sm"><strong>{comment.rating} Sterne</strong><p>{comment.comment_positive || comment.comment_improvement || comment.general_comment || 'Kein Text'}</p></div>)}</Panel>
    </div>}
  </div>;
}

function LowRatingWorkflow() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/low-rating-cases'), [reload]);
  const { data: users } = useAsync(() => api('/admin/users'), [reload]);
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState({});

  async function updateCase(item, patch) {
    try {
      await api(`/admin/low-rating-cases/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setMessage('Fall aktualisiert.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function revealContact(item) {
    try {
      const result = await api(`/admin/pii-vault/low-rating-cases/${item.id}/reveal`, { method: 'POST', body: '{}' });
      setRevealed({ ...revealed, [item.id]: result });
      setMessage('Kontaktdaten wurden aus dem PII-Vault geladen und im Audit-Log erfasst.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div>
    <Header title="Low-Rating Workflow" />
    <p className="mt-2 max-w-3xl text-sm text-neutral-600">Niedrige Bewertungen werden hier als Klärungsfälle gesammelt. Telefonnummern werden verschlüsselt gespeichert und nur berechtigten Event-Verantwortlichen angezeigt.</p>
    <Notice message={message} />
    {error && <ErrorBox error={error} />}
    <div className="mt-6 grid gap-4">
      {loading && <Panel>Lade Low-Rating-Fälle ...</Panel>}
      {data?.length === 0 && <Panel><p className="text-sm text-neutral-500">Aktuell gibt es keine offenen niedrigen Bewertungen.</p></Panel>}
      {data?.map((item) => <Panel key={item.id}>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{item.rating} Sterne</span>
              <h2 className="text-lg font-semibold">{item.event_name}</h2>
              <span className="text-sm text-neutral-500">{formatDate(item.submitted_at)}</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <Info label="Rückrufnummer" value={revealed[item.id]?.contactPhone || (item.contactPhoneAvailable ? 'Im PII-Vault hinterlegt' : 'Nicht hinterlegt')} />
              <Info label="Status" value={caseStatusLabel(item.status)} />
              <Info label="Kontakt-Hinweis" value={revealed[item.id]?.contactNote || (item.contactNoteAvailable ? 'Im PII-Vault hinterlegt' : 'Kein Hinweis')} />
              <Info label="Zugewiesen" value={item.assigned_user_name || 'Noch niemand'} />
            </div>
            {(item.contactPhoneAvailable || item.contactNoteAvailable) && <button className="button-secondary mt-3" onClick={() => revealContact(item)}>Kontaktdaten anzeigen</button>}
            <div className="mt-4 rounded-md bg-neutral-50 p-3 text-sm">
              <strong>Feedback</strong>
              <p className="mt-1 whitespace-pre-wrap">{item.comment_improvement || item.general_comment || item.comment_positive || 'Kein Freitext hinterlegt.'}</p>
            </div>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Status</span>
              <select className="input mt-1" value={item.status} onChange={(e) => updateCase(item, { status: e.target.value })}>
                <option value="open">Offen</option>
                <option value="contact_planned">Rückruf geplant</option>
                <option value="contacted">Kontaktiert</option>
                <option value="resolved">Geklärt</option>
                <option value="archived">Archiviert</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Verantwortliche Person</span>
              <select className="input mt-1" value={item.assigned_user_id || ''} onChange={(e) => updateCase(item, { assignedUserId: e.target.value || null })}>
                <option value="">Nicht zugewiesen</option>
                {users?.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Interne Notiz</span>
              <textarea className="input mt-1 min-h-24" defaultValue={item.internal_note || ''} onBlur={(e) => updateCase(item, { internalNote: e.target.value })} />
            </label>
          </div>
        </div>
      </Panel>)}
    </div>
  </div>;
}

const emptyItems = {
  features: { title: '', text: '' },
  steps: { title: '', text: '' },
  pricing: { plan: '', name: '', price: '', text: '', ctaLabel: '', features: '' },
  faq: { question: '', answer: '' }
};

function WebsiteContent() {
  const { data, loading, error } = useAsync(() => api('/admin/site-content'), []);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data?.content) setForm(data.content);
  }, [data]);

  function updateList(listName, index, key, value) {
    const next = [...(form[listName] || [])];
    next[index] = { ...next[index], [key]: value };
    setForm({ ...form, [listName]: next });
  }

  function addListItem(listName) {
    setForm({ ...form, [listName]: [...(form[listName] || []), { ...emptyItems[listName] }] });
  }

  function removeListItem(listName, index) {
    setForm({ ...form, [listName]: (form[listName] || []).filter((_, itemIndex) => itemIndex !== index) });
  }

  async function save(e) {
    e.preventDefault();
    setMessage('');
    try {
      const result = await api('/admin/site-content', { method: 'PATCH', body: JSON.stringify({ content: form }) });
      setForm(result.content);
      setMessage('Website-Inhalte gespeichert.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div>
    <Header title="Website" action={<a className="button-secondary" href="/" target="_blank"><ExternalLink size={16} /> Vorschau</a>} />
    {loading && <p className="mt-4">Lade Website-Inhalte ...</p>}
    {error && <ErrorBox error={error} />}
    {form && <form onSubmit={save} className="mt-6 space-y-6">
      <Panel title="Landingpage">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="text-sm font-medium">Marke</span><input className="input mt-1" value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Zeile über der Überschrift</span><input className="input mt-1" value={form.eyebrow || ''} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Überschrift</span><input className="input mt-1" value={form.headline || ''} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Untertitel</span><textarea className="input mt-1 min-h-24" value={form.subheadline || ''} onChange={(e) => setForm({ ...form, subheadline: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Eventfoto im Kopfbereich (optional)</span><input className="input mt-1" value={form.heroImageUrl || ''} onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })} placeholder="https://... oder /storage/..." /></label>
          <label className="block"><span className="text-sm font-medium">Hauptknopf: Text</span><input className="input mt-1" value={form.primaryCtaLabel || ''} onChange={(e) => setForm({ ...form, primaryCtaLabel: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Hauptknopf: Link</span><input className="input mt-1" value={form.primaryCtaUrl || ''} onChange={(e) => setForm({ ...form, primaryCtaUrl: e.target.value })} placeholder="#zugang" /></label>
          <label className="block"><span className="text-sm font-medium">Zweiter Knopf: Text</span><input className="input mt-1" value={form.secondaryCtaLabel || ''} onChange={(e) => setForm({ ...form, secondaryCtaLabel: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Zweiter Knopf: Link (auch im QR-Code)</span><input className="input mt-1" value={form.secondaryCtaUrl || ''} onChange={(e) => setForm({ ...form, secondaryCtaUrl: e.target.value })} placeholder="/f/veranstalter" /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Zeile unter den Knöpfen</span><input className="input mt-1" value={form.trustText || ''} onChange={(e) => setForm({ ...form, trustText: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Kontakt-E-Mail</span><input className="input mt-1" value={form.contactEmail || ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Text in der Fußzeile</span><input className="input mt-1" value={form.footerText || ''} onChange={(e) => setForm({ ...form, footerText: e.target.value })} /></label>
        </div>
      </Panel>

      <Panel title="Abschnitte">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="text-sm font-medium">Überschrift Ablauf</span><input className="input mt-1" value={form.stepsHeadline || ''} onChange={(e) => setForm({ ...form, stepsHeadline: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Überschrift Funktionen</span><input className="input mt-1" value={form.featuresHeadline || ''} onChange={(e) => setForm({ ...form, featuresHeadline: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Überschrift Preise</span><input className="input mt-1" value={form.pricingHeadline || ''} onChange={(e) => setForm({ ...form, pricingHeadline: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Hinweis neben den Preisen</span><input className="input mt-1" value={form.pricingNote || ''} onChange={(e) => setForm({ ...form, pricingNote: e.target.value })} placeholder="z. B. Hinweis zur Umsatzsteuer" /></label>
          <label className="block"><span className="text-sm font-medium">Überschrift Fragen</span><input className="input mt-1" value={form.faqHeadline || ''} onChange={(e) => setForm({ ...form, faqHeadline: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Abschluss: Überschrift</span><input className="input mt-1" value={form.ctaHeadline || ''} onChange={(e) => setForm({ ...form, ctaHeadline: e.target.value })} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Abschluss: Text</span><input className="input mt-1" value={form.ctaText || ''} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} /></label>
        </div>
        <p className="mt-3 text-sm text-neutral-600">Eine leere Überschrift zeigt den Standardtext. Ein leerer Hinweis oder Abschlusstext wird ausgeblendet.</p>
      </Panel>

      <EditableList title="Features" items={form.features || []} fields={[['title', 'Titel'], ['text', 'Text']]} onChange={(index, key, value) => updateList('features', index, key, value)} onAdd={() => addListItem('features')} onRemove={(index) => removeListItem('features', index)} />
      <EditableList title="Ablauf" items={form.steps || []} fields={[['title', 'Titel'], ['text', 'Text']]} onChange={(index, key, value) => updateList('steps', index, key, value)} onAdd={() => addListItem('steps')} onRemove={(index) => removeListItem('steps', index)} />
      <Panel title="Angebote / Pricing">
        <p className="text-sm leading-6 text-neutral-600">Die öffentliche Tarifmatrix kommt aus <strong>Plan & Billing</strong>. Dort werden Namen, Preise, Features und Limits zentral gepflegt, damit Landingpage, Upgrade-Buttons und Backend-Limits dieselbe Quelle nutzen.</p>
      </Panel>
      <EditableList title="FAQ" items={form.faq || []} fields={[['question', 'Frage'], ['answer', 'Antwort']]} onChange={(index, key, value) => updateList('faq', index, key, value)} onAdd={() => addListItem('faq')} onRemove={(index) => removeListItem('faq', index)} />

      <Panel title="Rechtliche Seiten">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block"><span className="text-sm font-medium">Impressum</span><textarea className="input mt-1 min-h-72" value={form.imprint || ''} onChange={(e) => setForm({ ...form, imprint: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Datenschutz</span><textarea className="input mt-1 min-h-72" value={form.privacy || ''} onChange={(e) => setForm({ ...form, privacy: e.target.value })} /></label>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <button className="button-primary"><Globe2 size={16} /> Website speichern</button>
        <Notice message={message} className="" />
      </div>
    </form>}
  </div>;
}

function EditableList({ title, items, fields, onChange, onAdd, onRemove }) {
  return <Panel title={title}>
    <div className="space-y-3">
      {items.map((item, index) => <div key={index} className="rounded-md border border-neutral-200 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map(([key, label]) => <label key={key} className={key === 'text' || key === 'answer' || key === 'features' ? 'block md:col-span-2' : 'block'}>
            <span className="text-sm font-medium">{label}</span>
            {key === 'text' || key === 'answer' || key === 'features'
              ? <textarea className="input mt-1 min-h-20" value={Array.isArray(item[key]) ? item[key].join('\n') : item[key] || ''} onChange={(e) => onChange(index, key, e.target.value)} />
              : <input className="input mt-1" value={item[key] || ''} onChange={(e) => onChange(index, key, e.target.value)} />}
          </label>)}
        </div>
        <button type="button" className="button-secondary mt-3" onClick={() => onRemove(index)}><Trash2 size={16} /> Entfernen</button>
      </div>)}
      <button type="button" className="button-secondary" onClick={onAdd}><Plus size={16} /> Eintrag hinzufügen</button>
    </div>
  </Panel>;
}

function Billing() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/billing'), [reload]);
  const [message, setMessage] = useState('');
  const [override, setOverride] = useState({ plan: 'pro', expiresAt: '', reason: '' });
  const [planDrafts, setPlanDrafts] = useState([]);

  useEffect(() => {
    if (data?.plans) setPlanDrafts(data.plans.map(planToDraft));
  }, [data]);

  async function saveOverride(e) {
    e.preventDefault();
    setMessage('');
    try {
      const result = await api('/admin/billing/override', { method: 'PATCH', body: JSON.stringify(override) });
      setMessage(`Tarif ${result.billing.effectivePlan} freigeschaltet.`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function savePlans(e) {
    e.preventDefault();
    setMessage('');
    try {
      const plans = planDrafts.map(draftToPlan);
      const result = await api('/admin/billing/plans', { method: 'PATCH', body: JSON.stringify({ plans }) });
      setMessage('Tarife, Leistungen und Limits gespeichert. Die öffentliche Website zeigt sie ab sofort.');
      setPlanDrafts(result.plans.map(planToDraft));
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  if (loading) return <p>Lade Plan ...</p>;
  if (error) return <ErrorBox error={error} />;
  const billing = data.billing;
  return <div>
    <Header title="Plan & Billing" />
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <Stat title="Aktiver Plan" value={billing.effectivePlan} />
      <Stat title="Status" value={billing.status || 'free'} />
      <Stat title="Quelle" value={billing.effectiveSource || 'intern'} />
    </div>
    <Notice message={message} />
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      {data.plans.map((plan) => <PlanCard key={plan.id} plan={plan} billing={billing} />)}
    </div>
    {billing.canOverride && <Panel title="Kostenloser Plan-Override">
      <form onSubmit={saveOverride} className="grid gap-3 md:grid-cols-3">
        <label className="block"><span className="text-sm font-medium">Override-Plan</span><select className="input mt-1" value={override.plan} onChange={(e) => setOverride({ ...override, plan: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option></select></label>
        <label className="block"><span className="text-sm font-medium">Gültig bis optional</span><input className="input mt-1" type="datetime-local" value={override.expiresAt} onChange={(e) => setOverride({ ...override, expiresAt: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Grund</span><input className="input mt-1" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="Demo, Partner, Kulanz ..." /></label>
        <button className="button-primary md:col-span-3"><ShieldCheck size={16} /> Override speichern</button>
      </form>
      <p className="mt-3 text-sm text-neutral-500">Nur E-Mails aus `BILLING_ADMIN_EMAILS` dürfen Organisationen kostenlos auf Pro oder Business setzen.</p>
    </Panel>}
    <Panel title="Tarife, Features und Limits">
      {billing.canManagePlans
        ? <PlanEditor plans={planDrafts} setPlans={setPlanDrafts} onSubmit={savePlans} />
        : <p className="text-sm leading-6 text-neutral-600">Die Tarifmatrix ist global. Nur Plattform-Admins aus `BILLING_ADMIN_EMAILS` können Preise, Features und technische Limits bearbeiten.</p>}
    </Panel>
  </div>;
}

function planToDraft(plan) {
  return {
    id: plan.id,
    name: plan.name || '',
    price: plan.price || '',
    summary: plan.summary || '',
    ctaLabel: plan.ctaLabel || '',
    featuresText: (plan.features || []).join('\n'),
    highlight: Boolean(plan.highlight),
    active: plan.active !== false,
    publicVisible: plan.publicVisible !== false,
    sortOrder: plan.sortOrder || 0,
    activeEvents: limitToInput(plan.limits?.activeEvents),
    templates: limitToInput(plan.limits?.templates),
    users: limitToInput(plan.limits?.users),
    customDomain: Boolean(plan.limits?.customDomain),
    teams: Boolean(plan.limits?.teams),
    pretix: Boolean(plan.limits?.pretix),
    webhooks: Boolean(plan.limits?.webhooks),
    reports: Boolean(plan.limits?.reports)
  };
}

function draftToPlan(draft) {
  return {
    id: draft.id,
    name: draft.name,
    price: draft.price,
    summary: draft.summary,
    ctaLabel: draft.ctaLabel,
    features: draft.featuresText.split('\n').map((line) => line.trim()).filter(Boolean),
    highlight: draft.highlight,
    active: draft.active,
    publicVisible: draft.publicVisible,
    sortOrder: Number(draft.sortOrder) || 0,
    limits: {
      activeEvents: inputToLimit(draft.activeEvents),
      templates: inputToLimit(draft.templates),
      users: inputToLimit(draft.users),
      customDomain: draft.customDomain,
      teams: draft.teams,
      pretix: draft.pretix,
      webhooks: draft.webhooks,
      reports: draft.reports
    }
  };
}

function limitToInput(value) {
  return value === null || value === undefined ? '' : String(value);
}

function inputToLimit(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function PlanEditor({ plans, setPlans, onSubmit }) {
  function updatePlan(index, patch) {
    setPlans(plans.map((plan, planIndex) => planIndex === index ? { ...plan, ...patch } : plan));
  }
  return <form onSubmit={onSubmit} className="space-y-4">
    {plans.map((plan, index) => <div key={plan.id} className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{plan.id}</p>
          <h3 className="text-lg font-semibold">{plan.name || 'Tarif'}</h3>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={plan.publicVisible} onChange={(e) => updatePlan(index, { publicVisible: e.target.checked })} /> öffentlich</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={plan.highlight} onChange={(e) => updatePlan(index, { highlight: e.target.checked })} /> hervorheben</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={plan.active} onChange={(e) => updatePlan(index, { active: e.target.checked })} /> aktiv</label>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Name</span><input className="input mt-1" value={plan.name} onChange={(e) => updatePlan(index, { name: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Preislabel</span><input className="input mt-1" value={plan.price} onChange={(e) => updatePlan(index, { price: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">CTA-Button</span><input className="input mt-1" value={plan.ctaLabel} onChange={(e) => updatePlan(index, { ctaLabel: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Sortierung</span><input className="input mt-1" type="number" value={plan.sortOrder} onChange={(e) => updatePlan(index, { sortOrder: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Beschreibung</span><textarea className="input mt-1 min-h-20" value={plan.summary} onChange={(e) => updatePlan(index, { summary: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Features, eine Zeile je Eintrag</span><textarea className="input mt-1 min-h-28" value={plan.featuresText} onChange={(e) => updatePlan(index, { featuresText: e.target.value })} /></label>
      </div>
      <div className="mt-4 grid gap-3 rounded-md bg-neutral-50 p-3 md:grid-cols-3">
        <label className="block"><span className="text-sm font-medium">Aktive Events</span><input className="input mt-1" type="number" min="0" placeholder="leer = unbegrenzt" value={plan.activeEvents} onChange={(e) => updatePlan(index, { activeEvents: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Formulare/Templates</span><input className="input mt-1" type="number" min="0" placeholder="leer = unbegrenzt" value={plan.templates} onChange={(e) => updatePlan(index, { templates: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">User</span><input className="input mt-1" type="number" min="0" placeholder="leer = unbegrenzt" value={plan.users} onChange={(e) => updatePlan(index, { users: e.target.value })} /></label>
        {[
          ['pretix', 'Pretix'],
          ['reports', 'Reports'],
          ['webhooks', 'Webhooks'],
          ['teams', 'Teams'],
          ['customDomain', 'Eigene Domain']
        ].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={plan[key]} onChange={(e) => updatePlan(index, { [key]: e.target.checked })} /> {label}</label>)}
      </div>
    </div>)}
    <button className="button-primary"><CreditCard size={16} /> Tarifmatrix speichern</button>
  </form>;
}

function PlanCard({ plan, billing }) {
  const current = billing.effectivePlan === plan.id;
  return <article className={`rounded-lg border bg-white p-5 shadow-sm ${current ? 'border-blue-500 ring-2 ring-blue-100' : 'border-neutral-200'}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{plan.name}</h2>
        <p className="mt-2 text-2xl font-semibold">{plan.price}</p>
      </div>
      {current && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">aktiv</span>}
    </div>
    <p className="mt-3 text-sm leading-6 text-neutral-600">{plan.summary}</p>
    <ul className="mt-4 space-y-2 text-sm text-neutral-700">
      {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Star size={15} className="mt-0.5 text-amber-500" fill="#f59e0b" /> <span>{feature}</span></li>)}
    </ul>
    <p className="mt-5 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">Pläne werden intern vergeben. Für Freischaltungen nutze den Override oder die Organisationsverwaltung.</p>
  </article>;
}

function BrandingSettings() {
  const { data, loading, error } = useAsync(() => api('/admin/branding'), []);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data) setForm({
      name: data.name || '',
      logoUrl: data.logo_url || '',
      primaryColor: data.primary_color || '#2563eb',
      footerText: data.footer_text || '',
      privacyText: data.privacy_text || '',
      ticketshopUrl: data.ticketshop_url || '',
      websiteUrl: data.website_url || '',
      instagramUrl: data.instagram_url || '',
      facebookUrl: data.facebook_url || '',
      defaultLanguage: data.default_language || 'de',
      minSeconds: data.anti_spam_settings?.min_seconds ?? 3,
      honeypotEnabled: data.anti_spam_settings?.honeypot_enabled !== false,
      retentionLowRatingPhoneDays: data.retention_low_rating_phone_days ?? 90,
      retentionFeedbackDays: data.retention_feedback_days ?? '',
      retentionNewsletterDays: data.retention_newsletter_days ?? '',
      wallboardDarkMode: data.wallboard_settings?.dark_mode !== false,
      wallboardRefreshSeconds: data.wallboard_settings?.refresh_seconds ?? 15
    });
  }, [data]);

  async function saveBranding(e) {
    e.preventDefault();
    setMessage('');
    let saved;
    try {
      saved = await api('/admin/branding', {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          wallboardSettings: { dark_mode: form.wallboardDarkMode, refresh_seconds: form.wallboardRefreshSeconds }
        })
      });
    } catch (err) {
      setMessage(errorNotice(err));
      return;
    }
    try {
      await api('/admin/anti-spam-settings', {
        method: 'PATCH',
        body: JSON.stringify({ minSeconds: form.minSeconds, honeypotEnabled: form.honeypotEnabled })
      });
    } catch (err) {
      setMessage(errorNotice({ message: `Branding gespeichert, die Einstellungen zum Spam-Schutz aber nicht: ${err.message}` }));
      return;
    }
    setMessage(`Branding für ${saved.name} gespeichert.`);
  }

  return <div>
    <Header title="Branding & Datenschutz" />
    {loading && <p className="mt-4">Lade Branding ...</p>}
    {error && <ErrorBox error={error} />}
    {form && data && <Panel title="Mandant">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className="text-sm font-medium">Name</span>
          <p className="mt-1 text-lg font-semibold">{data.name}</p>
        </div>
        <div>
          <span className="text-sm font-medium">Slug</span>
          <p className="mt-1 font-mono text-lg">{data.slug}</p>
        </div>
        <div className="md:col-span-2">
          <span className="text-sm font-medium">Gästeseite dieses Mandanten</span>
          <p className="mt-1 break-all"><a className="text-blue-700 underline" href={`${data.feedbackAppUrl}/f/${data.slug}`} target="_blank" rel="noreferrer">{data.feedbackAppUrl}/f/{data.slug}</a></p>
          <p className="mt-2 text-sm text-neutral-600">Der Slug steht im QR-Code und bleibt deshalb fest. Den Namen änderst du unten; er erscheint auf der Gästeseite und in Berichten.</p>
        </div>
      </div>
    </Panel>}
    {form && <Panel title="Organisation und öffentliche Besucheransicht">
      <form onSubmit={saveBranding} className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Organisationsname</span><input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Primärfarbe</span><input className="input mt-1 h-12" type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Logo-URL</span><input className="input mt-1" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="/storage/logo.png oder https://..." /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Footer-Text</span><input className="input mt-1" value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className="text-sm font-medium">Datenschutzhinweis</span><textarea className="input mt-1 min-h-24" value={form.privacyText} onChange={(e) => setForm({ ...form, privacyText: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Website</span><input className="input mt-1" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Ticketshop</span><input className="input mt-1" value={form.ticketshopUrl} onChange={(e) => setForm({ ...form, ticketshopUrl: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Instagram</span><input className="input mt-1" value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Facebook</span><input className="input mt-1" value={form.facebookUrl} onChange={(e) => setForm({ ...form, facebookUrl: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Standardsprache</span><select className="input mt-1" value={form.defaultLanguage} onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}><option value="de">Deutsch</option><option value="en">English</option></select></label>
        <label className="block"><span className="text-sm font-medium">Mindestzeit bis Absenden (Sek.)</span><input className="input mt-1" type="number" min="0" value={form.minSeconds} onChange={(e) => setForm({ ...form, minSeconds: Number(e.target.value) })} /></label>
        <label className="mt-6 flex items-center gap-2 rounded-md bg-neutral-50 p-3"><input type="checkbox" checked={form.honeypotEnabled} onChange={(e) => setForm({ ...form, honeypotEnabled: e.target.checked })} /> Honeypot aktivieren</label>
        <label className="block"><span className="text-sm font-medium">Low-Rating-Kontaktdaten löschen nach Tagen</span><input className="input mt-1" type="number" min="1" value={form.retentionLowRatingPhoneDays} onChange={(e) => setForm({ ...form, retentionLowRatingPhoneDays: Number(e.target.value) })} /></label>
        <label className="block"><span className="text-sm font-medium">Feedback löschen nach Tagen (leer = behalten)</span><input className="input mt-1" type="number" min="1" value={form.retentionFeedbackDays} onChange={(e) => setForm({ ...form, retentionFeedbackDays: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Newsletter-Opt-ins löschen nach Tagen (leer = behalten)</span><input className="input mt-1" type="number" min="1" value={form.retentionNewsletterDays} onChange={(e) => setForm({ ...form, retentionNewsletterDays: e.target.value })} /></label>
        <label className="flex items-center gap-2 rounded-md bg-neutral-50 p-3"><input type="checkbox" checked={form.wallboardDarkMode} onChange={(e) => setForm({ ...form, wallboardDarkMode: e.target.checked })} /> Wallboard Dark Mode</label>
        <label className="block"><span className="text-sm font-medium">Wallboard Refresh (Sek.)</span><input className="input mt-1" type="number" min="5" value={form.wallboardRefreshSeconds} onChange={(e) => setForm({ ...form, wallboardRefreshSeconds: Number(e.target.value) })} /></label>
        <button className="button-primary md:col-span-2">Branding speichern</button>
      </form>
      <Notice message={message} />
    </Panel>}
  </div>;
}

function Info({ label, value }) {
  return <div className="rounded-md bg-neutral-50 p-3"><p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function caseStatusLabel(status) {
  return {
    open: 'Offen',
    contact_planned: 'Rückruf geplant',
    contacted: 'Kontaktiert',
    resolved: 'Geklärt',
    archived: 'Archiviert'
  }[status] || status;
}

function Texts() {
  const [reload, setReload] = useState(0);
  const [language, setLanguage] = useState('de');
  const { data, loading, error } = useAsync(() => api(`/admin/text-templates?language=${language}`), [reload, language]);
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (data?.defaults) {
      const saved = Object.fromEntries((data.templates || []).filter((item) => !item.event_id).map((item) => [item.key, item.value]));
      setDrafts({ ...data.defaults, ...saved });
    }
  }, [data]);
  async function save(key) {
    setMessage('');
    try {
      await api('/admin/text-templates', { method: 'POST', body: JSON.stringify({ key, value: drafts[key], language, scope: 'public' }) });
      setMessage(`Text „${key}“ gespeichert.`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="Texte & Sprache" />
    <Panel>
      <label className="block max-w-xs"><span className="text-sm font-medium">Sprache</span><select className="input mt-1" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="de">Deutsch</option><option value="en">English</option></select></label>
    </Panel>
    <Notice message={message} />
    {loading && <p>Lade Texte ...</p>}
    {error && <ErrorBox error={error} />}
    {data && groupTextKeys(Object.keys(data.defaults)).map(([group, keys]) => <Panel key={group} title={group}>
      <div className="grid gap-4">
        {keys.map((key) => {
          const [label, hint] = textLabels[key] || [key];
          return <label key={key} className="block">
            <span className="text-sm font-medium">{label}</span>
            <span className="ml-2 font-mono text-xs text-neutral-500">{key}</span>
            {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
            <textarea className="input mt-1 min-h-20" value={drafts[key] || ''} onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })} />
            <button type="button" onClick={() => save(key)} className="button-secondary mt-2">Speichern</button>
          </label>;
        })}
      </div>
    </Panel>)}
  </div>;
}

function QrAndWallboard() {
  const { data: dashboard } = useAsync(() => api('/admin/dashboard'), []);
  const { data: events, error: eventsError } = useAsync(() => api('/admin/events'), []);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [source, setSource] = useState({ sourceSlug: 'ausgang', label: 'Ausgang', type: 'dynamic_organization' });
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!selectedEvent && events?.[0]) setSelectedEvent(events[0].id);
  }, [events, selectedEvent]);
  const { data: qrAnalytics } = useAsync(() => selectedEvent ? api(`/admin/events/${selectedEvent}/qr-analytics`) : Promise.resolve(null), [selectedEvent]);
  async function createSource(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/qr-sources', { method: 'POST', body: JSON.stringify(source) });
      setMessage(`QR-Quelle „${source.label}“ angelegt.`);
      setSource({ sourceSlug: '', label: '', type: 'dynamic_organization' });
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="QR & Wallboard" />
    {eventsError && <ErrorBox error={eventsError} />}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel title="QR-Quellen">
        <form onSubmit={createSource} className="grid gap-2 md:grid-cols-3">
          <input className="input" placeholder="source-slug" value={source.sourceSlug} onChange={(e) => setSource({ ...source, sourceSlug: e.target.value })} required />
          <input className="input" placeholder="Label" value={source.label} onChange={(e) => setSource({ ...source, label: e.target.value })} required />
          <button className="button-primary">Anlegen</button>
        </form>
        <Notice message={message} className="mt-3" />
        {dashboard?.organization && <p className="mt-4 break-all text-sm text-neutral-600">Beispiel: {dashboard.feedbackAppUrl}/f/{dashboard.organization.slug}/bar</p>}
      </Panel>
      <Panel title="Druckvorlagen">
        <div className="space-y-2">{events?.map((event) => <a key={event.id} className="button-secondary w-full justify-between" href={`${API_BASE}/admin/events/${event.id}/qr-print`} target="_blank"><span>{eventLabel(event)}</span><QrCode size={16} /></a>)}</div>
      </Panel>
    </div>
    <Panel title="QR-Quellen-Auswertung">
      <select className="input max-w-md" value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>{events?.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {qrAnalytics?.bySource?.map((row) => <div key={row.source_slug} className="rounded-md border border-neutral-200 p-3 text-sm"><strong>{row.label}</strong><p>Scans: {row.scans_count || 0} · Feedbacks: {row.feedback_count || 0}</p><p>Ø {row.average_rating || '-'} · Newsletter {row.newsletter_optins || 0} · Low {row.low_ratings || 0}</p></div>)}
        {qrAnalytics?.bySource?.length === 0 && <p className="text-sm text-neutral-500">Noch keine QR-Quellen-Daten für dieses Event.</p>}
      </div>
    </Panel>
    <Wallboard events={events || []} />
  </div>;
}

function Wallboard({ events }) {
  const [eventId, setEventId] = useState('');
  const [reload, setReload] = useState(0);
  const { data: dashboard } = useAsync(() => api('/admin/dashboard'), [reload]);
  useEffect(() => {
    if (!eventId && events[0]) setEventId(events[0].id);
  }, [events, eventId]);
  const refreshSeconds = dashboard?.organization?.wallboard_settings?.refresh_seconds || 15;
  const dark = dashboard?.organization?.wallboard_settings?.dark_mode !== false;
  useEffect(() => {
    const timer = setInterval(() => setReload((value) => value + 1), refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [refreshSeconds]);
  const { data, error } = useAsync(() => eventId ? api(`/admin/events/${eventId}/analytics`) : Promise.resolve(null), [eventId, reload]);
  return <Panel title="Wallboard-Modus">
    <select className="input max-w-md" value={eventId} onChange={(e) => setEventId(e.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select>
    {error && <ErrorBox error={error} />}
    {data && <div className={`mt-6 rounded-lg p-5 ${dark ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-950'}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{events.find((event) => event.id === eventId)?.name || 'Wallboard'}</h2>
        <span className="rounded-md bg-white/10 px-3 py-1 text-sm">Refresh {refreshSeconds}s</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <WallStat dark={dark} title="Feedbacks" value={data.summary.total || 0} />
        <WallStat dark={dark} title="Durchschnitt" value={data.summary.average_rating || '-'} />
        <WallStat dark={dark} title="Newsletter" value={data.summary.newsletter_optins || 0} />
        <WallStat dark={dark} title="Letzte Bewertung" value={data.comments?.[0]?.rating ? `${data.comments[0].rating} Sterne` : '-'} />
      </div>
      <div className="mt-6 h-64"><ResponsiveContainer><LineChart data={data.timeline}><CartesianGrid strokeDasharray="3 3" stroke={dark ? '#404040' : '#d4d4d4'} /><XAxis dataKey="bucket" tickFormatter={(v) => new Date(v).getHours()} stroke={dark ? '#d4d4d4' : '#525252'} /><YAxis allowDecimals={false} stroke={dark ? '#d4d4d4' : '#525252'} /><Tooltip /><Line type="monotone" dataKey="count" stroke="#60a5fa" strokeWidth={3} /></LineChart></ResponsiveContainer></div>
    </div>}
  </Panel>;
}

function WallStat({ title, value, dark }) {
  return <div className={`rounded-lg p-6 ${dark ? 'bg-white/10' : 'bg-white'}`}><p className={`text-sm ${dark ? 'text-white/70' : 'text-neutral-500'}`}>{title}</p><p className="mt-3 text-4xl font-semibold">{value}</p></div>;
}

function Pretix() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/pretix-connections'), [reload]);
  const [form, setForm] = useState({ baseUrl: '', organizerSlug: '', apiToken: '', importEventImages: true, cacheEventImages: true });
  const [message, setMessage] = useState('');
  async function create(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/pretix-connections', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Pretix-Verbindung gespeichert. Mit „Testen“ prüfst du den Zugang.');
      setForm({ baseUrl: '', organizerSlug: '', apiToken: '', importEventImages: true, cacheEventImages: true });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  async function toggleSync(connection) {
    setMessage('');
    try {
      await api(`/admin/pretix-connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ syncEnabled: !connection.sync_enabled }) });
      setMessage(connection.sync_enabled ? 'Auto-Sync pausiert.' : 'Auto-Sync aktiviert.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  async function action(id, endpoint) {
    setMessage(endpoint === 'sync' ? 'Synchronisiere mit Pretix …' : 'Prüfe die Verbindung …');
    try {
      const result = await api(`/admin/pretix-connections/${id}/${endpoint}`, { method: 'POST', body: '{}' });
      setMessage(endpoint === 'sync' ? `${result.imported} Events und ${result.images} Bilder synchronisiert.` : `Verbindung funktioniert, ${result.eventsFound} Events gefunden.`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="Pretix-Integration" />
    <Panel title="Verbindung einrichten">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="https://tickets.example.de" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
        <input className="input" placeholder="Organizer-Slug" value={form.organizerSlug} onChange={(e) => setForm({ ...form, organizerSlug: e.target.value })} required />
        <input className="input md:col-span-2" placeholder="API-Token" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} required />
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.importEventImages} onChange={(e) => setForm({ ...form, importEventImages: e.target.checked })} /> Eventbilder aus Settings importieren</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.cacheEventImages} onChange={(e) => setForm({ ...form, cacheEventImages: e.target.checked })} /> Eventbilder lokal cachen</label>
        <button className="button-primary md:col-span-2">Speichern</button>
      </form>
    </Panel>
    <Notice message={message} />
    <section className="mt-6 space-y-3">
      {loading && <p>Lade Verbindungen ...</p>}
      {error && <ErrorBox error={error} />}
      {data?.map((connection) => <div key={connection.id} className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="font-semibold">{connection.base_url} / {connection.pretix_organizer_slug}</h2>
        <p className="mt-1 text-sm text-neutral-600">Letzter Sync: {connection.last_sync_status || 'Noch nicht synchronisiert'} · Nächster Sync: {connection.next_sync_at ? formatDate(connection.next_sync_at) : '-'}</p>
        <p className="mt-1 text-sm text-neutral-500">Intervall: {connection.sync_interval_minutes} Min. · Auto-Sync: {connection.sync_enabled ? 'aktiv' : 'inaktiv'} · Cache: {connection.cache_event_images ? 'aktiv' : 'inaktiv'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => action(connection.id, 'test')} className="button-secondary">Testen</button>
          <button onClick={() => action(connection.id, 'sync')} className="button-blue">Jetzt synchronisieren</button>
          <button onClick={() => toggleSync(connection)} className="button-secondary">{connection.sync_enabled ? 'Auto-Sync pausieren' : 'Auto-Sync aktivieren'}</button>
        </div>
      </div>)}
    </section>
  </div>;
}

const notificationTypes = ['email', 'discord', 'slack', 'mattermost', 'teams', 'telegram', 'pushover', 'ntfy', 'gotify', 'webhook'];

function Notifications() {
  const [reload, setReload] = useState(0);
  const { data: users } = useAsync(() => api('/admin/users'), [reload]);
  const { data: events } = useAsync(() => api('/admin/events'), []);
  const { data: channels, loading, error: channelsError } = useAsync(() => api('/admin/notification-channels'), [reload]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState({ name: '', email: '', role: 'support' });
  const [form, setForm] = useState({
    userId: '',
    channelType: 'email',
    label: 'E-Mail',
    minRating: 2,
    secret: '',
    configText: '{}'
  });

  useEffect(() => {
    if (!form.userId && users?.[0]) setForm((old) => ({ ...old, userId: users[0].id }));
  }, [users, form.userId]);

  useEffect(() => {
    if (!selectedEvent && events?.[0]) setSelectedEvent(events[0].id);
  }, [events, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    api(`/admin/events/${selectedEvent}/assignments`)
      .then(setAssignments)
      .catch((error) => setMessage(errorNotice(error)));
  }, [selectedEvent, reload]);

  async function createChannel(e) {
    e.preventDefault();
    setMessage('');
    let config = {};
    try {
      config = form.configText ? JSON.parse(form.configText) : {};
    } catch {
      setMessage(errorNotice({ message: 'Das Feld „Config JSON“ enthält kein gültiges JSON. Beispiel: {"chatId":"123456"}' }));
      return;
    }
    try {
      await api('/admin/notification-channels', {
        method: 'POST',
        body: JSON.stringify({
          userId: form.userId,
          channelType: form.channelType,
          label: form.label,
          minRating: form.minRating,
          secret: form.secret,
          config
        })
      });
      setMessage('Kanal gespeichert. Mit „Test“ prüfst du die Zustellung.');
      setForm({ ...form, secret: '' });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function saveAssignments() {
    setMessage('');
    try {
      await api(`/admin/events/${selectedEvent}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({
          assignments: assignments.map((assignment) => ({
            userId: assignment.user_id,
            assigned: assignment.assigned,
            notifyLowRating: assignment.notify_low_rating
          }))
        })
      });
      setMessage('Event-Zuweisungen gespeichert.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function deleteChannel(channel) {
    setMessage('');
    try {
      await api(`/admin/notification-channels/${channel.id}`, { method: 'DELETE' });
      setMessage(`Kanal „${channel.label}“ entfernt.`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function testChannel(id) {
    try {
      await api(`/admin/notification-channels/${id}/test`, { method: 'POST', body: '{}' });
      setMessage('Testbenachrichtigung gesendet.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function changeRole(user, role) {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setMessage('Rolle aktualisiert.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function changeStatus(user, status) {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setMessage('Benutzerstatus aktualisiert.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function inviteUser(e) {
    e.preventDefault();
    try {
      const result = await api('/admin/users/invite', { method: 'POST', body: JSON.stringify(invite) });
      const mail = result.mail || {};
      if (mail.error) {
        setMessage(errorNotice({ message: `Einladung erstellt, die E-Mail ließ sich aber nicht senden. ${mail.error} Schicke der Person diesen Link: ${result.inviteUrl}` }));
      } else if (mail.skipped) {
        setMessage(`Einladung erstellt. Der E-Mail-Versand ist ausgeschaltet, schicke der Person diesen Link: ${result.inviteUrl}`);
      } else {
        setMessage(`Einladung an ${invite.email} verschickt. Der Link gilt 7 Tage: ${result.inviteUrl}`);
      }
      setInvite({ name: '', email: '', role: 'support' });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div>
    <Header title="Benachrichtigungen" />
    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel title="User einladen">
        <form onSubmit={inviteUser} className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <input className="input" type="email" placeholder="E-Mail" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
          <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="support">Support</option>
            <option value="analyst">Analyst</option>
            <option value="event_manager">Event Manager</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button className="button-primary">Einladung senden</button>
        </form>
      </Panel>
      <Panel title="Persönlichen Kanal anlegen">
        <form onSubmit={createChannel} className="grid gap-3 md:grid-cols-2">
          <label className="block"><span className="text-sm font-medium">User</span><select className="input mt-1" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>{users?.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select></label>
          <label className="block"><span className="text-sm font-medium">Kanal</span><select className="input mt-1" value={form.channelType} onChange={(e) => setForm({ ...form, channelType: e.target.value, label: e.target.value })}>{notificationTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="block"><span className="text-sm font-medium">Label</span><input className="input mt-1" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium">Auslösen bis Bewertung</span><input className="input mt-1" type="number" min="1" max="5" value={form.minRating} onChange={(e) => setForm({ ...form, minRating: Number(e.target.value) })} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Secret / Token / Webhook-URL</span><input className="input mt-1" type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={channelSecretPlaceholder(form.channelType)} /></label>
          <label className="block md:col-span-2"><span className="text-sm font-medium">Config JSON</span><textarea className="input mt-1 min-h-24" value={form.configText} onChange={(e) => setForm({ ...form, configText: e.target.value })} /></label>
          <p className="text-sm text-neutral-500 md:col-span-2">{channelHelp(form.channelType)}</p>
          <button className="button-primary md:col-span-2"><Bell size={16} /> Kanal speichern</button>
        </form>
      </Panel>
      <Panel title="Event-Zuweisungen">
        <select className="input" value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
          {events?.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
        </select>
        <div className="mt-4 space-y-2">
          {assignments.map((assignment, index) => <div key={assignment.user_id} className="grid gap-2 rounded-md bg-neutral-50 p-3 md:grid-cols-[1fr_auto_auto]">
            <div><strong>{assignment.name}</strong><p className="text-sm text-neutral-500">{assignment.email}</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignment.assigned} onChange={(e) => setAssignments(assignments.map((item, i) => i === index ? { ...item, assigned: e.target.checked } : item))} /> zuweisen</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignment.notify_low_rating} onChange={(e) => setAssignments(assignments.map((item, i) => i === index ? { ...item, notify_low_rating: e.target.checked } : item))} /> Low-Rating</label>
          </div>)}
        </div>
        <button onClick={saveAssignments} className="button-primary mt-4">Zuweisungen speichern</button>
      </Panel>
    </div>
    <Notice message={message} />
    <Panel title="Rollen & Rechte">
      <div className="grid gap-3">
        {users?.map((user) => <div key={user.id} className="grid gap-2 rounded-md border border-neutral-200 p-3 md:grid-cols-[1fr_180px_180px]">
          <div><strong>{user.name}</strong><p className="text-sm text-neutral-500">{user.email} · {user.status || 'active'} · letzter Login: {user.last_login_at ? formatDate(user.last_login_at) : '-'}</p></div>
          <select className="input" value={user.role} onChange={(e) => changeRole(user, e.target.value)}>
            <option value="support">Support</option>
            <option value="analyst">Analyst</option>
            <option value="event_manager">Event Manager</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <select className="input" value={user.status || 'active'} onChange={(e) => changeStatus(user, e.target.value)}>
            <option value="invited">Eingeladen</option>
            <option value="active">Aktiv</option>
            <option value="disabled">Deaktiviert</option>
          </select>
        </div>)}
      </div>
    </Panel>
    <Panel title="Aktive Kanäle">
      {loading && <p>Lade Kanäle ...</p>}
      {channelsError && <ErrorBox error={channelsError} />}
      <div className="grid gap-3">
        {channels?.map((channel) => <div key={channel.id} className="grid gap-2 rounded-md border border-neutral-200 p-3 md:grid-cols-[1fr_auto_auto]">
          <div><strong>{channel.label}</strong><p className="text-sm text-neutral-500">{channel.channel_type} · {channel.user_name} · Secret: {channel.has_secret ? 'ja' : 'nein'} · Status: {channel.last_status || '-'}</p>{channel.last_error && <p className="text-sm text-red-700">{channel.last_error}</p>}</div>
          <button onClick={() => testChannel(channel.id)} className="button-secondary"><Send size={16} /> Test</button>
          <button onClick={() => deleteChannel(channel)} className="button-secondary"><Trash2 size={16} /> Entfernen</button>
        </div>)}
      </div>
    </Panel>
  </div>;
}

function channelSecretPlaceholder(type) {
  if (['discord', 'slack', 'mattermost', 'teams', 'webhook'].includes(type)) return 'Webhook-URL';
  if (type === 'telegram') return 'Bot Token';
  if (type === 'pushover') return 'Application Token';
  if (type === 'ntfy') return 'Bearer Token optional';
  if (type === 'gotify') return 'App Token';
  return 'optional';
}

function channelHelp(type) {
  const examples = {
    email: 'Config: {"to":"person@example.com"} oder leer, dann wird die User-E-Mail genutzt.',
    discord: 'Secret ist die Discord Webhook-URL. Config kann leer bleiben.',
    slack: 'Secret ist die Slack Incoming Webhook-URL. Funktioniert auch für Mattermost-kompatible Webhooks.',
    mattermost: 'Secret ist die Mattermost Incoming Webhook-URL.',
    teams: 'Secret ist die Microsoft Teams Incoming Webhook-URL.',
    telegram: 'Secret ist der Bot Token. Config: {"chatId":"123456"}',
    pushover: 'Secret ist der App Token. Config: {"userKey":"...", "priority":1}',
    ntfy: 'Config: {"topicUrl":"https://ntfy.sh/mein-topic", "priority":"high"}. Secret optional für Bearer Auth.',
    gotify: 'Secret ist der App Token. Config: {"url":"https://gotify.example.com", "priority":5}',
    webhook: 'Secret ist die Ziel-URL. qrating sendet JSON mit title, text, event und feedback.'
  };
  return examples[type] || '';
}

function Operations() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/operations'), [reload]);
  const [message, setMessage] = useState('');
  async function runRetention() {
    try {
      await api('/admin/operations/run-retention', { method: 'POST', body: '{}' });
      setMessage('Aufbewahrungsjob wurde eingeplant.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="Monitoring & Betrieb" action={<button onClick={() => setReload(reload + 1)} className="button-secondary"><RefreshCw size={16} /> Aktualisieren</button>} />
    <Notice message={message} />
    {error && <ErrorBox error={error} />}
    {loading && <p className="mt-4">Lade Betriebsstatus ...</p>}
    {data && <div className="mt-6 grid gap-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="SMTP" value={data.smtp?.enabled ? 'aktiv' : 'inaktiv'} />
        <Stat title="Pretix-Verbindungen" value={data.pretix?.length || 0} />
        <Stat title="Offene Jobs" value={data.recentJobs?.filter((job) => job.status !== 'failed').length || 0} />
        <Stat title="Fehlgeschlagene Jobs" value={data.recentJobs?.filter((job) => job.status === 'failed').length || 0} />
      </div>
      <Panel title="Jobs">
        <div className="grid gap-3 md:grid-cols-2">
          {data.jobs.map((row) => <div key={`${row.job_type}-${row.status}`} className="rounded-md bg-neutral-50 p-3 text-sm"><strong>{row.job_type}</strong><p>{row.status}: {row.count}</p></div>)}
        </div>
        <button onClick={runRetention} className="button-secondary mt-4">Aufbewahrungsjob jetzt einplanen</button>
      </Panel>
      <Panel title="Letzte relevante Jobs">
        <div className="space-y-2">
          {data.recentJobs.map((job) => <div key={job.id} className="rounded-md border border-neutral-200 p-3 text-sm"><strong>{job.job_type}</strong> · {job.status} · Versuch {job.attempts}/{job.max_attempts}<p className="text-neutral-500">{job.last_error || `geplant: ${formatDate(job.run_after)}`}</p></div>)}
          {!data.recentJobs.length && <p className="text-sm text-neutral-500">Keine offenen oder fehlgeschlagenen Jobs.</p>}
        </div>
      </Panel>
      <Panel title="Pretix Sync">
        <div className="space-y-2">
          {data.pretix.map((connection) => <div key={connection.id} className="rounded-md bg-neutral-50 p-3 text-sm"><strong>{connection.pretix_organizer_slug}</strong><p>Auto-Sync: {connection.sync_enabled ? 'aktiv' : 'inaktiv'} · letzter Erfolg: {connection.last_successful_sync_at ? formatDate(connection.last_successful_sync_at) : '-'}</p>{connection.last_sync_error && <p className="text-red-700">{connection.last_sync_error}</p>}</div>)}
        </div>
      </Panel>
      <Panel title="Webhooks">
        <div className="space-y-2">{data.webhooks.map((hook) => <div key={hook.id} className="rounded-md bg-neutral-50 p-3 text-sm"><strong>Webhook endpoint</strong><p>Status: {hook.last_status || '-'} · {hook.last_called_at ? formatDate(hook.last_called_at) : 'noch nicht aufgerufen'}</p>{hook.last_error && <p className="text-red-700">{hook.last_error}</p>}</div>)}</div>
      </Panel>
    </div>}
  </div>;
}

function SmtpSettings() {
  const { data, loading, error } = useAsync(() => api('/admin/smtp-settings'), []);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: 'qrating',
    replyTo: '',
    notificationEmail: '',
    lowRatingAlertsEnabled: false,
    enabled: false
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data) {
      setForm({
        host: data.host || '',
        port: data.port || 587,
        secure: Boolean(data.secure),
        username: data.username || '',
        password: '',
        fromEmail: data.from_email || '',
        fromName: data.from_name || 'qrating',
        replyTo: data.reply_to || '',
        notificationEmail: data.notification_email || '',
        lowRatingAlertsEnabled: Boolean(data.low_rating_alerts_enabled),
        enabled: Boolean(data.enabled)
      });
    }
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setMessage('Speichere SMTP-Einstellungen …');
    try {
      const saved = await api('/admin/smtp-settings', { method: 'PUT', body: JSON.stringify(form) });
      setForm({ ...form, password: '' });
      setMessage(`SMTP-Einstellungen gespeichert. Passwort hinterlegt: ${saved.has_password ? 'ja' : 'nein'}.`);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function test() {
    setMessage('Sende Testmail …');
    try {
      const result = await api('/admin/smtp-settings/test', { method: 'POST', body: JSON.stringify({ to: form.notificationEmail || form.fromEmail }) });
      setMessage(`Testmail gesendet an ${result.to}.`);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div>
    <Header title="SMTP-Einstellungen" />
    {loading && <p>Lade SMTP-Einstellungen ...</p>}
    {error && <ErrorBox error={error} />}
    <Panel title="Mailserver konfigurieren">
      <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">SMTP-Host</span><input className="input mt-1" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.example.com" required /></label>
        <label className="block"><span className="text-sm font-medium">Port</span><input className="input mt-1" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} required /></label>
        <label className="block"><span className="text-sm font-medium">Benutzername</span><input className="input mt-1" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Passwort</span><input className="input mt-1" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={data?.has_password ? 'Bleibt unverändert, wenn leer' : ''} /></label>
        <label className="block"><span className="text-sm font-medium">Absender-E-Mail</span><input className="input mt-1" type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} required /></label>
        <label className="block"><span className="text-sm font-medium">Absendername</span><input className="input mt-1" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Reply-To</span><input className="input mt-1" type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} /></label>
        <label className="block"><span className="text-sm font-medium">Admin-Benachrichtigung</span><input className="input mt-1" type="email" value={form.notificationEmail} onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })} placeholder="team@example.com" /></label>
        <label className="flex items-center gap-2 rounded-md bg-neutral-50 p-3"><input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> SSL/TLS direkt verwenden</label>
        <label className="flex items-center gap-2 rounded-md bg-neutral-50 p-3"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> SMTP aktivieren</label>
        <p className="text-sm text-neutral-500 md:col-span-2">Low-Rating-Benachrichtigungen werden pro User unter Benachrichtigungen konfiguriert. Diese SMTP-Seite legt nur den Mailserver für E-Mail-Kanäle fest.</p>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="button-primary"><Mail size={16} /> Speichern</button>
          <button type="button" onClick={test} className="button-secondary"><Send size={16} /> Testmail senden</button>
        </div>
      </form>
      <Notice message={message} />
      {data?.last_test_at && <p className="mt-3 text-sm text-neutral-500">Letzter Test: {formatDate(data.last_test_at)} · {data.last_test_status || '-'}</p>}
      {data?.last_test_error && <p className="mt-2 text-sm text-red-700">{data.last_test_error}</p>}
    </Panel>
  </div>;
}

function Webhooks() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/webhooks'), [reload]);
  const [form, setForm] = useState({ url: '', secret: '', events: 'feedback.created,feedback.low_rating,newsletter.optin' });
  const [message, setMessage] = useState('');
  async function create(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/webhooks', { method: 'POST', body: JSON.stringify({ ...form, events: form.events.split(',').map((item) => item.trim()).filter(Boolean) }) });
      setMessage('Webhook gespeichert. qrating ruft ihn beim nächsten passenden Ereignis auf.');
      setForm({ url: '', secret: '', events: 'feedback.created,feedback.low_rating,newsletter.optin' });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }
  return <div>
    <Header title="Webhooks" />
    <Panel title="Endpoint anlegen">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="https://example.com/webhook" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
        <input className="input" placeholder="Secret optional" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
        <input className="input md:col-span-2" value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} />
        <button className="button-primary md:col-span-2">Webhook speichern</button>
      </form>
      <Notice message={message} />
    </Panel>
    <div className="mt-6 space-y-3">
      {loading && <p>Lade Webhooks ...</p>}
      {error && <ErrorBox error={error} />}
      {data?.map((hook) => <Panel key={hook.id}><div className="flex flex-col justify-between gap-2 md:flex-row"><div><h2 className="font-semibold">{hook.url}</h2><p className="text-sm text-neutral-500">{hook.events?.join?.(', ') || JSON.stringify(hook.events)}</p></div><span className="text-sm text-neutral-500">Letzter Status: {hook.last_status || '-'}</span></div>{hook.last_error && <p className="mt-2 text-sm text-red-700">{hook.last_error}</p>}</Panel>)}
    </div>
  </div>;
}

function Header({ title, action }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold">{title}</h1>{action}</div>;
}

function Panel({ title, children }) {
  return <section className="rounded-lg bg-white p-5 shadow-sm">{title && <h2 className="mb-4 font-semibold">{title}</h2>}{children}</section>;
}

function Stat({ title, value }) {
  return <div className="rounded-lg bg-white p-5 shadow-sm"><p className="text-sm text-neutral-500">{title}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function ErrorBox({ error }) {
  return <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error?.message || String(error)}</p>;
}

// Messages are plain strings (information) or { tone: 'error', text } from errorNotice().
function errorNotice(error) {
  return { tone: 'error', text: error?.message || String(error) };
}

function Notice({ message, className = 'mt-4' }) {
  if (!message) return null;
  const isError = typeof message === 'object' && message.tone === 'error';
  const text = typeof message === 'object' ? message.text : message;
  return <p role={isError ? 'alert' : 'status'} className={`${className} rounded-md p-3 text-sm ${isError ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>{text}</p>;
}

function fillRatings(rows) {
  const byRating = new Map((rows || []).map((row) => [Number(row.rating), row.count]));
  return [1, 2, 3, 4, 5].map((rating) => ({ rating, count: byRating.get(rating) || 0 }));
}

export default AdminApp;
