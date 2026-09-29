import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { shortenedPeriods, shortenedSentence } from '../retention.js';
import { hasRole } from '../roles.js';
import { can, whoCan } from '../permissions.js';
import { accessLabel, activeOwners, invitationToRenew, roleLabels, teamLock } from '../team.js';
import { eventLabel, formatDate } from '../eventLabel.js';
import { settingsSections } from '../navigation.js';
import { shellListsSections, themeFor, themes } from '../themes.js';
import { Button, Check, ErrorBox, Field, Icon, Input, Loading, Notice, Page, Panel, Select, Tabs, TextArea, errorNotice, useAsync } from '../ui.jsx';
import { SecurityCenter, Operations } from './security.jsx';

// Chips with the sections of an area, for looks whose menu does not list them.
export function SectionTabs({ items, active, onSelect }) {
  return <nav className="q-sectiontabs" aria-label="Bereiche">
    {items.map((item) => <button key={item.id} type="button" className="q-chip" aria-pressed={item.id === active} onClick={() => onSelect(item.id)}>
      {item.icon && <Icon name={item.icon} size={14} />}{item.label}
    </button>)}
  </nav>;
}

export function SettingsPage({ section, part }) {
  const { theme, go } = useAdmin();
  const Section = sections[section] || Organization;
  return <div>
    {!shellListsSections(theme) && <SectionTabs items={settingsSections} active={section} onSelect={(id) => go({ page: 'settings', section: id })} />}
    <Section part={part} />
  </div>;
}

// ------------------------------------------------------------------ Organisation

function Organization() {
  const { me, reloadMe } = useAdmin();
  const { data, loading, error } = useAsync(() => api('/admin/branding'), []);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  // What the server holds now; a save updates it, so the next save compares with the saved state.
  const [stored, setStored] = useState(null);
  const [shorter, setShorter] = useState(null);
  const keepRef = useRef(null);
  const saveRef = useRef(null);
  // The server keeps these rules as well; the page offers only what the role may change.
  const canEdit = hasRole(me?.role, 'event_manager');
  const canPrivacy = hasRole(me?.role, 'admin');

  useEffect(() => {
    if (data) setStored(data);
  }, [data]);

  // The confirmation takes the focus on its safe choice; closing it gives the focus back once the
  // save button is usable again, after the next paint.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (shorter) {
      keepRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      saveRef.current?.focus();
    }
  }, [shorter]);

  useEffect(() => {
    if (data) setForm({
      name: data.name || '',
      legalName: data.legal_name || '',
      legalAddress: data.legal_address || '',
      legalEmail: data.legal_email || '',
      privacyText: data.privacy_text || '',
      ticketshopUrl: data.ticketshop_url || '',
      websiteUrl: data.website_url || '',
      instagramUrl: data.instagram_url || '',
      facebookUrl: data.facebook_url || '',
      retentionLowRatingPhoneDays: data.retention_low_rating_phone_days ?? data.retention_limits?.phoneDefaultDays ?? '',
      retentionFeedbackDays: data.retention_feedback_days ?? '',
      retentionNewsletterDays: data.retention_newsletter_days ?? '',
      minSeconds: data.anti_spam_settings?.min_seconds ?? data.anti_spam_limits?.defaultSeconds ?? '',
      honeypotEnabled: data.anti_spam_settings?.honeypot_enabled !== false
    });
  }, [data]);

  function save(e) {
    e.preventDefault();
    setMessage('');
    const found = canPrivacy ? shortenedPeriods(form, stored) : [];
    if (found.length) {
      setShorter(found);
      return;
    }
    persist();
  }

  function keepPeriods() {
    returnFocus.current = true;
    setShorter(null);
  }

  async function persist() {
    setShorter(null);
    setMessage('');
    const { minSeconds, honeypotEnabled, ...branding } = form;
    try {
      setStored(await api('/admin/branding', { method: 'PATCH', body: JSON.stringify(branding) }));
    } catch (err) {
      setMessage(errorNotice(err));
      return;
    }
    try {
      await api('/admin/anti-spam-settings', { method: 'PATCH', body: JSON.stringify({ minSeconds, honeypotEnabled }) });
    } catch (err) {
      setMessage(errorNotice({ message: `Organisation gespeichert, der Spam-Schutz aber nicht: ${err.message}` }));
      return;
    }
    setMessage('Organisation gespeichert.');
    reloadMe?.();
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // The bounds come from the settings of the installation, so the form offers what the server takes.
  const limits = data?.retention_limits || {};
  const daysRange = limits.minDays && limits.maxDays ? `Erlaubt sind ${limits.minDays} bis ${limits.maxDays} Tage.` : '';
  const spamLimits = data?.anti_spam_limits || {};
  const spamHint = spamLimits.maxSeconds ? `Erlaubt sind 0 bis ${spamLimits.maxSeconds} Sekunden; leer gilt die Vorgabe von ${spamLimits.defaultSeconds}.` : null;

  return <Page title="Organisation" subtitle="Wer hinter der Gästeseite steht: Name, Anschrift, Datenschutz und wie lange Daten bleiben.">
    {loading && <Loading />}
    <ErrorBox error={error} />
    {form && data && <form onSubmit={save} className="grid gap-4">
      {!canEdit && <p className="q-notice q-notice-info">Diese Angaben ändert ein Event-Manager, Admin oder Owner deiner Organisation.</p>}
      <Panel title="Mandant">
        <fieldset disabled={!canEdit} className="m-0 grid min-w-0 gap-3 border-0 p-0 md:grid-cols-2">
          <Field label="Name" hint="Erscheint auf der Gästeseite und in Berichten."><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Kurzname im QR-Code" hint="Steht im QR-Code und bleibt deshalb fest."><Input value={data.slug} readOnly /></Field>
          <p className="md:col-span-2 text-q-muted">Gästeseite: <a className="font-semibold text-q-accent-text underline" href={`${data.feedbackAppUrl}/f/${data.slug}`} target="_blank" rel="noreferrer">{data.feedbackAppUrl}/f/{data.slug}</a></p>
        </fieldset>
      </Panel>
      <Panel title="Rechtliches und Datenschutz">
        <fieldset disabled={!canPrivacy} className="m-0 grid min-w-0 gap-3 border-0 p-0 md:grid-cols-2">
          <Field label="Verantwortlich laut Datenschutz"><Input value={form.legalName} onChange={set('legalName')} placeholder="Name der Firma oder Person" /></Field>
          <Field label="E-Mail für Datenschutzanfragen"><Input type="email" value={form.legalEmail} onChange={set('legalEmail')} placeholder="datenschutz@example.de" /></Field>
          <Field label="Anschrift" className="md:col-span-2"><TextArea value={form.legalAddress} onChange={set('legalAddress')} placeholder="Straße 1, 12345 Ort" style={{ minHeight: 64 }} /></Field>
          <Field label="Datenschutzhinweis" className="md:col-span-2"><TextArea value={form.privacyText} onChange={set('privacyText')} /></Field>
          <p className="q-hint md:col-span-2">Diese Angaben stehen auf der Datenschutzseite deiner Gästeseite unter <code>/datenschutz/{data.slug}</code>. Solange eine davon fehlt, trägt die Seite einen sichtbaren Hinweis, dass sie unvollständig ist.{canPrivacy ? '' : ' Ändern kann sie ein Admin oder Owner deiner Organisation.'}</p>
        </fieldset>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Links">
          <fieldset disabled={!canEdit} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
            <Field label="Website"><Input value={form.websiteUrl} onChange={set('websiteUrl')} /></Field>
            <Field label="Ticketshop"><Input value={form.ticketshopUrl} onChange={set('ticketshopUrl')} /></Field>
            <Field label="Instagram"><Input value={form.instagramUrl} onChange={set('instagramUrl')} /></Field>
            <Field label="Facebook"><Input value={form.facebookUrl} onChange={set('facebookUrl')} /></Field>
          </fieldset>
        </Panel>
        <Panel title="Aufbewahrung und Spam-Schutz">
          <div className="grid gap-3">
            <fieldset disabled={!canPrivacy} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
              <Field label="Rückrufnummern löschen nach Tagen" hint={`Pflichtfeld. ${daysRange} Eine kürzere Frist gilt auch für gespeicherte Nummern, eine längere für neue.`.trim()}><Input type="number" min={limits.minDays} max={limits.maxDays} value={form.retentionLowRatingPhoneDays} onChange={set('retentionLowRatingPhoneDays')} required /></Field>
              <Field label="Feedback löschen nach Tagen" hint={`Leer heißt behalten. ${daysRange}`.trim()}><Input type="number" min={limits.minDays} max={limits.maxDays} value={form.retentionFeedbackDays} onChange={set('retentionFeedbackDays')} /></Field>
              <Field label="Newsletter-Anmeldungen löschen nach Tagen" hint={`Leer heißt behalten. ${daysRange}`.trim()}><Input type="number" min={limits.minDays} max={limits.maxDays} value={form.retentionNewsletterDays} onChange={set('retentionNewsletterDays')} /></Field>
              {!canPrivacy && <p className="q-hint sm:col-span-2">Löschfristen ändert ein Admin oder Owner deiner Organisation.</p>}
            </fieldset>
            <fieldset disabled={!canEdit} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2">
              <Field label="Mindestzeit bis Absenden (Sek.)" hint={spamHint}><Input type="number" min="0" max={spamLimits.maxSeconds} value={form.minSeconds} onChange={set('minSeconds')} /></Field>
              <Check label="Unsichtbares Fangfeld gegen Bots (Honeypot)" checked={form.honeypotEnabled} onChange={set('honeypotEnabled')} className="sm:col-span-2" />
            </fieldset>
          </div>
        </Panel>
      </div>
      {shorter && <div role="group" aria-labelledby="shorter-title" className="grid gap-2 rounded-lg bg-q-danger-soft p-3" onKeyDown={(e) => { if (e.key === 'Escape') keepPeriods(); }}>
        <p id="shorter-title" className="font-semibold">Kürzere Löschfrist speichern?</p>
        <ul className="grid gap-1">{shorter.map((item) => <li key={item.subject}>{shortenedSentence(item)}</li>)}</ul>
        <p>Gelöschtes lässt sich nicht zurückholen.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" icon="trash" onClick={persist}>Kürzere Frist speichern</Button>
          <Button ref={keepRef} variant="ghost" onClick={keepPeriods}>Abbrechen</Button>
        </div>
      </div>}
      {canEdit && <div className="flex flex-wrap items-center gap-3">
        <Button ref={saveRef} type="submit" variant="primary" icon="check" disabled={Boolean(shorter)}>Organisation speichern</Button>
        <Notice message={message} />
      </div>}
    </form>}
  </Page>;
}

// ------------------------------------------------------------------ Team

function Team() {
  const { events, me } = useAdmin();
  // The server keeps these rules as well; the page offers only what the role may change.
  const canTeam = can(me, 'team');
  const canAssign = can(me, 'assignments');
  const [reload, setReload] = useState(0);
  const { data: users, loading, error } = useAsync(() => api('/admin/users'), [reload]);
  // An owner learns before filling in the form whether the plan takes more people.
  const { data: billing } = useAsync(() => (canTeam ? api('/admin/billing') : Promise.resolve(null)), [canTeam]);
  const teamsInPlan = billing ? Boolean(billing.currentPlan?.limits?.teams) : true;
  const [selectedEvent, setSelectedEvent] = useState('');
  // The ticks belong to one event. After a switch, the list and the save button wait for the
  // answer about the new event, so the ticks of one event never land on another.
  const [loadedAssignments, setLoadedAssignments] = useState({ eventId: null, rows: [] });
  const assignments = loadedAssignments.eventId === selectedEvent ? loadedAssignments.rows : [];
  const setAssignments = (rows) => setLoadedAssignments({ eventId: selectedEvent, rows });
  // The role of a new person is chosen on purpose, so the form starts without one.
  const [invite, setInvite] = useState({ name: '', email: '', role: '' });
  const [message, setMessage] = useState('');
  const owners = activeOwners(users || []);

  useEffect(() => {
    if (!selectedEvent && events?.[0]) setSelectedEvent(events[0].id);
  }, [events, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent || !canAssign) return undefined;
    let active = true;
    api(`/admin/events/${selectedEvent}/assignments`)
      .then((rows) => active && setLoadedAssignments({ eventId: selectedEvent, rows }))
      .catch((err) => active && setMessage(errorNotice(err)));
    return () => {
      active = false;
    };
  }, [selectedEvent, reload, canAssign]);

  async function sendInvite(person) {
    setMessage('');
    try {
      const result = await api('/admin/users/invite', { method: 'POST', body: JSON.stringify(person) });
      const mail = result.mail || {};
      // How long the link holds comes with the invitation; the setting lives on the server.
      const validity = result.user?.invite_expires_at ? ` Der Link gilt bis ${formatDate(result.user.invite_expires_at)}.` : '';
      if (mail.error) setMessage(errorNotice({ message: `Einladung erstellt, die E-Mail ließ sich aber nicht senden. ${mail.error} Schicke der Person diesen Link: ${result.inviteUrl}${validity}` }));
      else if (mail.skipped) setMessage(`Einladung erstellt. Diese Installation verschickt keine Einladungsmails, schicke der Person diesen Link: ${result.inviteUrl}${validity}`);
      else setMessage(`Einladung an ${person.email} verschickt.${validity}`);
      setReload((value) => value + 1);
      return true;
    } catch (err) {
      setMessage(errorNotice(err));
      return false;
    }
  }

  async function inviteUser(e) {
    e.preventDefault();
    if (await sendInvite(invite)) setInvite({ name: '', email: '', role: '' });
  }

  async function update(user, patch, text) {
    setMessage('');
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setMessage(text);
      setReload((value) => value + 1);
      return true;
    } catch (err) {
      setMessage(errorNotice(err));
      return false;
    }
  }

  async function saveAssignments() {
    setMessage('');
    try {
      await api(`/admin/events/${selectedEvent}/assignments`, {
        method: 'PUT',
        body: JSON.stringify({ assignments: assignments.map((item) => ({ userId: item.user_id, assigned: item.assigned, notifyLowRating: item.notify_low_rating })) })
      });
      setMessage('Zuständigkeiten gespeichert.');
      setReload((value) => value + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const toggle = (index, key) => (e) => setAssignments(assignments.map((item, i) => (i === index ? { ...item, [key]: e.target.checked } : item)));

  return <Page title="Team" subtitle="Wer mitarbeitet, mit welcher Rolle, und wer für welches Event zuständig ist.">
    {loading && <Loading />}
    <ErrorBox error={error} />
    <Notice message={message} />
    {!canTeam && <p className="q-notice q-notice-info">Rollen, Zugang und Einladungen verwaltet {whoCan('team')}.</p>}
    {(canTeam || canAssign) && <div className="grid gap-4 xl:grid-cols-2">
      {canTeam && <Panel title="Person einladen">
        {teamsInPlan ? <form onSubmit={inviteUser} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="Leer nennt qrating die Person nach dem Anfang ihrer Adresse, bis sie ihren Namen einträgt."><Input value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} /></Field>
          <Field label="E-Mail"><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></Field>
          <Field label="Rolle"><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} required>
            <option value="" disabled>Rolle wählen …</option>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></Field>
          <div className="flex items-end"><Button type="submit" variant="primary" icon="send">Einladung senden</Button></div>
          <p className="q-hint sm:col-span-2">Die Einladung geht per E-Mail raus, sobald die Installation Einladungsmails verschickt. Sonst steht der Link hier und du schickst ihn selbst.</p>
        </form> : <p className="text-q-muted">Weitere Personen einladen gehört zum Tarif Business. Ein Plattform-Admin schaltet ihn unter Plattform → Tarife frei.</p>}
      </Panel>}
      {canAssign && <Panel title="Zuständigkeit je Event" note="Wer zuständig ist, sieht das Event und bekommt auf Wunsch die Rückruf-Meldungen.">
        <Select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)} aria-label="Event">
          {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
        </Select>
        <div className="mt-3 grid gap-2">
          {assignments.map((assignment, index) => <div key={assignment.user_id} className="grid items-center gap-2 rounded-lg bg-q-sunken p-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="min-w-0"><strong className="block truncate">{assignment.name}</strong><span className="block truncate text-q-muted">{assignment.email}</span></div>
            <Check label="zuständig" checked={assignment.assigned} onChange={toggle(index, 'assigned')} />
            <Check label="Rückruf-Meldungen" checked={assignment.notify_low_rating} onChange={toggle(index, 'notify_low_rating')} />
          </div>)}
        </div>
        <Button variant="primary" className="mt-3" onClick={saveAssignments} disabled={loadedAssignments.eventId !== selectedEvent}>Zuständigkeiten speichern</Button>
      </Panel>}
    </div>}
    <Panel title="Rollen und Zugang" note={canTeam ? 'Die eigene Rolle und den eigenen Zugang ändert ein anderer Owner.' : null}>
      <div className="grid gap-2">
        {users?.map((user) => <TeamRow key={user.id} user={user} me={me} owners={owners} canTeam={canTeam} update={update} sendInvite={sendInvite} />)}
      </div>
    </Panel>
  </Page>;
}

// One person of the team. The role changes only with its own save button, and taking access away
// asks first: an arrow key on a list must never sign a colleague out.
function TeamRow({ user, me, owners, canTeam, update, sendInvite }) {
  const [role, setRole] = useState(user.role);
  const [asking, setAsking] = useState(null);
  const cancelRef = useRef(null);
  const triggerRef = useRef(null);
  const returnFocus = useRef(false);
  useEffect(() => setRole(user.role), [user.role]);
  useEffect(() => {
    if (asking) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  // The server keeps these rules as well; the row offers only what it would accept.
  const lockNote = teamLock(user, me, owners);
  const editable = canTeam && !lockNote;
  const renew = invitationToRenew(user);
  const withdrawn = user.status === 'disabled' && renew;
  const expired = user.status === 'invited' && renew;
  const noteId = `team-note-${user.id}`;
  const name = user.name || user.email;

  const close = () => {
    returnFocus.current = true;
    setAsking(null);
  };

  async function saveRole() {
    if (await update(user, { role }, `${name} ist jetzt ${roleLabels[role]}.`)) setAsking(null);
  }

  async function confirmAccess() {
    const withdraw = asking === 'withdraw';
    await update(user, { status: 'disabled' }, withdraw ? `Einladung an ${user.email} zurückgezogen.` : `${name} ist deaktiviert und abgemeldet.`);
    setAsking(null);
  }

  return <div className="grid gap-2 border-b border-q-line pb-2 last:border-0">
    <div className="grid items-start gap-2 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <strong>{name}</strong>
        <p className="truncate text-q-muted">{user.email}, letzter Login: {user.last_login_at ? formatDate(user.last_login_at) : 'noch nie'}</p>
        <p className="text-q-muted">{roleLabels[user.role] || user.role}, {accessLabel(user)}</p>
        {canTeam && lockNote && <p id={noteId} className="q-hint">{lockNote}</p>}
      </div>
      {editable && !asking && <div className="flex flex-wrap items-end gap-2">
        <Field label="Rolle">
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-describedby={lockNote ? noteId : undefined}>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        {role !== user.role && <>
          <Button size="sm" variant="primary" icon="check" onClick={saveRole}>Rolle speichern</Button>
          <Button size="sm" variant="ghost" onClick={() => setRole(user.role)}>Verwerfen</Button>
        </>}
        {role === user.role && user.status === 'active' && <Button ref={triggerRef} size="sm" variant="danger-soft" onClick={() => setAsking('disable')}>Deaktivieren …</Button>}
        {role === user.role && user.status === 'disabled' && !withdrawn && <Button size="sm" onClick={() => update(user, { status: 'active' }, `${name} ist wieder aktiv und meldet sich neu an.`)}>Aktivieren</Button>}
        {role === user.role && user.status === 'invited' && !expired && <Button ref={triggerRef} size="sm" variant="danger-soft" onClick={() => setAsking('withdraw')}>Einladung zurückziehen …</Button>}
        {role === user.role && renew && <Button size="sm" icon="send" onClick={() => sendInvite({ name: user.name, email: user.email, role: user.role })}>Neu einladen</Button>}
      </div>}
    </div>
    {asking && <div role="group" aria-labelledby={`${noteId}-ask`} className="grid gap-2 rounded-lg bg-q-danger-soft p-3" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <p id={`${noteId}-ask`}>{asking === 'withdraw'
        ? `Einladung an ${user.email} zurückziehen? Der Link in der Einladung gilt dann nicht mehr; eine neue Einladung ist jederzeit möglich.`
        : `${name} deaktivieren? Die Person wird sofort abgemeldet. Aktiviert ein Owner das Konto später wieder, meldet sie sich neu an.`}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" onClick={confirmAccess}>{asking === 'withdraw' ? 'Einladung zurückziehen' : 'Deaktivieren'}</Button>
        <Button ref={cancelRef} size="sm" variant="ghost" onClick={close}>Abbrechen</Button>
      </div>
    </div>}
  </div>;
}

// ------------------------------------------------------------------ Meldungen

const notificationTypes = ['email', 'discord', 'slack', 'mattermost', 'teams', 'telegram', 'pushover', 'ntfy', 'gotify', 'webhook'];

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
    email: 'Config: {"to":"person@example.com"}. Gehört der Kanal einer Person, reicht auch leer, dann geht die Meldung an deren E-Mail-Adresse.',
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

function Alerts() {
  const { me } = useAdmin();
  // The server keeps this rule as well: below event manager a channel belongs to its maker.
  const forEveryone = can(me, 'channels');
  const [reload, setReload] = useState(0);
  const { data: users } = useAsync(() => api('/admin/users'), []);
  const { data: channels, loading, error } = useAsync(() => api('/admin/notification-channels'), [reload]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ userId: '', channelType: 'email', label: 'E-Mail', minRating: 2, secret: '', configText: '{}' });

  useEffect(() => {
    if (!forEveryone && me?.id) setForm((old) => ({ ...old, userId: me.id }));
  }, [forEveryone, me?.id]);

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
        body: JSON.stringify({ userId: form.userId, channelType: form.channelType, label: form.label, minRating: form.minRating, secret: form.secret, config })
      });
      setMessage('Kanal gespeichert. Mit „Test“ prüfst du die Zustellung.');
      setForm({ ...form, secret: '' });
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function run(action, text) {
    setMessage('');
    try {
      await action();
      setMessage(text);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <Page title="Meldungen" subtitle="Wer erfährt, wenn ein Gast schlecht bewertet. Ein Kanal der Organisation meldet jedes Event, ein Kanal einer Person die Events, für die sie unter Team zuständig ist.">
    <Notice message={message} />
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <Panel title="Kanal anlegen">
        <form onSubmit={createChannel} className="grid gap-3 sm:grid-cols-2">
          <Field label="Kanal gehört" hint={forEveryone ? null : `Kanäle für die ganze Organisation legt ${whoCan('channels')} an.`}><Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} disabled={!forEveryone}>
            {forEveryone && <option value="">Ganze Organisation</option>}
            {(forEveryone ? users : users?.filter((user) => user.id === me?.id))?.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
          </Select></Field>
          <Field label="Art"><Select value={form.channelType} onChange={(e) => setForm({ ...form, channelType: e.target.value, label: e.target.value })}>
            {notificationTypes.map((type) => <option key={type}>{type}</option>)}
          </Select></Field>
          <Field label="Name"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <Field label="Melden bis Sterne"><Input type="number" min="1" max="5" value={form.minRating} onChange={(e) => setForm({ ...form, minRating: Number(e.target.value) })} /></Field>
          <Field label="Secret, Token oder Webhook-URL" className="sm:col-span-2"><Input type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={channelSecretPlaceholder(form.channelType)} autoComplete="off" /></Field>
          <Field label="Config JSON" hint={channelHelp(form.channelType)} className="sm:col-span-2"><TextArea value={form.configText} onChange={(e) => setForm({ ...form, configText: e.target.value })} style={{ minHeight: 64 }} /></Field>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" icon="bell">Kanal speichern</Button></div>
        </form>
      </Panel>
      <Panel title="Aktive Kanäle">
        {loading && <Loading />}
        <ErrorBox error={error} />
        <div className="grid gap-2">
          {channels?.map((channel) => <div key={channel.id} className="grid items-center gap-2 border-b border-q-line pb-2 last:border-0 sm:grid-cols-[1fr_auto_auto]">
            <div className="min-w-0">
              <strong>{channel.label}</strong>
              <p className="text-q-muted">{channel.channel_type}, {channel.user_name || 'ganze Organisation'}, Secret {channel.has_secret ? 'hinterlegt' : 'fehlt'}, zuletzt {channel.last_status || 'noch nicht benutzt'}</p>
              {channel.last_error && <p className="text-q-danger">{channel.last_error}</p>}
            </div>
            <Button size="sm" icon="send" onClick={() => run(() => api(`/admin/notification-channels/${channel.id}/test`, { method: 'POST', body: '{}' }), 'Testnachricht verschickt.')}>Test</Button>
            <Button size="sm" icon="trash" onClick={() => run(() => api(`/admin/notification-channels/${channel.id}`, { method: 'DELETE' }), `Kanal „${channel.label}“ entfernt.`)}>Entfernen</Button>
          </div>)}
          {channels?.length === 0 && <p className="text-q-muted">Noch kein Kanal. Ohne Kanal erfährt niemand von einer schlechten Bewertung.</p>}
        </div>
      </Panel>
    </div>
  </Page>;
}

// ------------------------------------------------------------------ Verbindungen

// `needs` names the part of permissions.js each connection belongs to.
const connectionTabs = [
  { id: 'pretix', label: 'Pretix', icon: 'events', needs: 'pretix' },
  { id: 'newsletter', label: 'Newsletter', icon: 'send', needs: 'newsletter' },
  { id: 'email', label: 'E-Mail-Versand', icon: 'mail', needs: 'mailServer' },
  { id: 'webhooks', label: 'Webhooks', icon: 'plug', needs: 'webhooks' }
];

function Connections({ part }) {
  const { go, me } = useAdmin();
  // Each role sees the connections it may set up; the server keeps the same rule.
  const tabs = connectionTabs.filter((item) => can(me, item.needs));
  const active = tabs.some((item) => item.id === part) ? part : tabs[0]?.id;
  if (!tabs.length) {
    return <Page title="Verbindungen" subtitle="Woher die Events kommen und wohin Anmeldungen, E-Mails und Ereignisse gehen.">
      <p className="q-notice q-notice-info">Verbindungen zu Pretix, Newsletter, Mailserver und Webhooks richtet {whoCan('pretix')} ein.</p>
    </Page>;
  }
  return <Page title="Verbindungen" subtitle="Woher die Events kommen und wohin Anmeldungen, E-Mails und Ereignisse gehen.">
    <Tabs items={tabs} active={active} onSelect={(id) => go({ page: 'settings', section: 'verbindungen', part: id }, { replace: true })} />
    {tabs.length < connectionTabs.length && <p className="q-hint mt-2">Newsletter, Mailserver und Webhooks richtet {whoCan('mailServer')} ein.</p>}
    {active === 'pretix' && <Pretix />}
    {active === 'newsletter' && <Newsletter />}
    {active === 'email' && <Smtp />}
    {active === 'webhooks' && <Webhooks />}
  </Page>;
}

function Pretix() {
  const { reloadEvents } = useAdmin();
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
      setMessage(connection.sync_enabled ? 'Automatischer Abgleich pausiert.' : 'Automatischer Abgleich läuft wieder.');
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function action(id, endpoint) {
    setMessage(endpoint === 'sync' ? 'Gleiche mit Pretix ab …' : 'Prüfe die Verbindung …');
    try {
      const result = await api(`/admin/pretix-connections/${id}/${endpoint}`, { method: 'POST', body: '{}' });
      setMessage(endpoint === 'sync' ? `${result.imported} Events und ${result.images} Bilder abgeglichen.` : `Verbindung funktioniert, ${result.eventsFound} Events gefunden.`);
      setReload(reload + 1);
      if (endpoint === 'sync') reloadEvents();
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <div className="grid gap-4">
    <Notice message={message} />
    {loading && <Loading />}
    <ErrorBox error={error} />
    {data?.map((connection) => <Panel key={connection.id} title={`${connection.base_url} / ${connection.pretix_organizer_slug}`}>
      <p className="text-q-muted">Letzter Abgleich: {connection.last_sync_status || 'noch keiner'}. Nächster: {connection.next_sync_at ? formatDate(connection.next_sync_at) : '–'}. Alle {connection.sync_interval_minutes} Minuten, automatisch {connection.sync_enabled ? 'an' : 'aus'}, Bilder {connection.cache_event_images ? 'lokal gespeichert' : 'direkt aus Pretix'}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => action(connection.id, 'test')}>Testen</Button>
        <Button variant="primary" icon="refresh" onClick={() => action(connection.id, 'sync')}>Jetzt abgleichen</Button>
        <Button onClick={() => toggleSync(connection)}>{connection.sync_enabled ? 'Automatik pausieren' : 'Automatik einschalten'}</Button>
      </div>
    </Panel>)}
    <Panel title="Verbindung einrichten">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <Field label="Pretix-Adresse"><Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://tickets.example.de" required /></Field>
        <Field label="Veranstalter-Kurzname"><Input value={form.organizerSlug} onChange={(e) => setForm({ ...form, organizerSlug: e.target.value })} required /></Field>
        <Field label="API-Token" className="md:col-span-2"><Input type="password" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} required autoComplete="off" /></Field>
        <Check label="Eventbilder aus Pretix übernehmen" checked={form.importEventImages} onChange={(e) => setForm({ ...form, importEventImages: e.target.checked })} />
        <Check label="Eventbilder lokal speichern" checked={form.cacheEventImages} onChange={(e) => setForm({ ...form, cacheEventImages: e.target.checked })} />
        <div className="md:col-span-2"><Button type="submit" variant="primary">Verbindung speichern</Button></div>
      </form>
    </Panel>
  </div>;
}

const emptyNewsletter = { apiUrl: '', apiKey: '', listUid: '', eventFieldTag: 'VERANSTALTUNG', sourceFieldTag: 'QUELLE', sourceFieldValue: 'qrating', sourceFieldUseQr: true, enabled: true };

function Newsletter() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/newsletter'), [reload]);
  const [form, setForm] = useState(emptyNewsletter);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const connection = data?.connection;

  useEffect(() => {
    if (connection) setForm({
      apiUrl: connection.api_url || '',
      apiKey: '',
      listUid: connection.list_uid || '',
      eventFieldTag: connection.event_field_tag || 'VERANSTALTUNG',
      sourceFieldTag: connection.source_field_tag || 'QUELLE',
      sourceFieldValue: connection.source_field_value ?? 'qrating',
      sourceFieldUseQr: connection.source_field_use_qr !== false,
      enabled: Boolean(connection.enabled)
    });
  }, [data]);

  async function run(pending, action, success) {
    setMessage(pending);
    try {
      const result = await action();
      setMessage(typeof success === 'function' ? success(result) : success);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  function save(e) {
    e.preventDefault();
    run('Speichere Verbindung …', async () => {
      await api('/admin/newsletter', { method: 'PUT', body: JSON.stringify(form) });
      setForm({ ...form, apiKey: '' });
    }, 'Verbindung gespeichert. Jede neue Anmeldung geht ab sofort an MailWizz.');
  }

  function remove() {
    setConfirmDelete(false);
    run('Lösche Verbindung …', async () => {
      await api('/admin/newsletter', { method: 'DELETE' });
      setForm(emptyNewsletter);
    }, 'Verbindung gelöscht. Neue Anmeldungen bleiben in qrating stehen.');
  }

  return <div className="grid gap-4">
    <Notice message={message} />
    {loading && <Loading />}
    <ErrorBox error={error} />
    {data && <div className="grid gap-3 md:grid-cols-3">
      <Panel title="Anmeldungen"><p className="q-num" style={{ fontSize: 22 }}>{data.optins.total}</p><p className="text-q-muted">{data.optins.open} offen, {data.optins.failed} mit Fehler</p></Panel>
      <Panel title="Letzter Test"><p>{connection?.last_test_at ? `${formatDate(connection.last_test_at)}, ${connection.last_test_status || '–'}` : 'noch nicht getestet'}</p>{connection?.last_test_error && <p className="text-q-danger">{connection.last_test_error}</p>}</Panel>
      <Panel title="Letzte Übergabe"><p>{connection?.last_sync_at ? `${formatDate(connection.last_sync_at)}, ${connection.last_sync_status || '–'}` : 'noch keine Übergabe'}</p>{connection?.last_sync_error && <p className="text-q-danger">{connection.last_sync_error}</p>}</Panel>
    </div>}
    <Panel title="MailWizz verbinden">
      <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
        <Field label="API-Adresse"><Input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://news.example.com/api" required /></Field>
        <Field label="API-Schlüssel"><Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={connection?.has_api_key ? 'Bleibt unverändert, wenn leer' : 'Aus MailWizz unter „API keys“'} autoComplete="off" /></Field>
        <Field label="Listen-UID"><Input value={form.listUid} onChange={(e) => setForm({ ...form, listUid: e.target.value })} placeholder="ab1cd2ef3gh4i" required /></Field>
        <Field label="Feldkürzel für die Veranstaltung"><Input value={form.eventFieldTag} onChange={(e) => setForm({ ...form, eventFieldTag: e.target.value.toUpperCase() })} required /></Field>
        <Field label="Feldkürzel für den Weg"><Input value={form.sourceFieldTag} onChange={(e) => setForm({ ...form, sourceFieldTag: e.target.value.toUpperCase() })} required /></Field>
        <Field label="Wert für den Weg ohne QR-Quelle"><Input value={form.sourceFieldValue} onChange={(e) => setForm({ ...form, sourceFieldValue: e.target.value })} placeholder="qrating" /></Field>
        <Check label="Name der QR-Quelle eintragen, wenn die Anmeldung über eine kam" checked={form.sourceFieldUseQr} onChange={(e) => setForm({ ...form, sourceFieldUseQr: e.target.checked })} className="md:col-span-2" />
        <Check label="Anmeldungen an MailWizz übergeben" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="md:col-span-2" />
        <p className="q-hint md:col-span-2">Beide Feldkürzel müssen in MailWizz als Custom Fields dieser Liste angelegt sein. In das erste trägt qrating den Namen der Veranstaltung laut Pretix ein, in das zweite den Weg, über den die Anmeldung kam, etwa „Bändchen“ oder „Bar“. Die Übergabe an MailWizz steht auf der Datenschutzseite deiner Gästeseite.</p>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" variant="primary" icon="send">Speichern</Button>
          <Button icon="refresh" onClick={() => run('Frage die Liste bei MailWizz ab …', () => api('/admin/newsletter/test', { method: 'POST' }), (result) => (result.list ? `Verbindung steht. MailWizz meldet die Liste „${result.list}“.` : 'Verbindung steht. MailWizz hat die Liste bestätigt.'))}>Verbindung testen</Button>
          <Button icon="send" onClick={() => run('Übergebe offene Anmeldungen …', () => api('/admin/newsletter/sync-pending', { method: 'POST' }), (result) => (result.queued ? `${result.queued} Anmeldungen stehen zur Übergabe bereit. Sie laufen im Hintergrund durch.` : 'Es gibt keine offenen Anmeldungen.'))}>Offene Anmeldungen übergeben</Button>
          {connection && !confirmDelete && <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Verbindung löschen</Button>}
          {confirmDelete && <span className="flex flex-wrap items-center gap-2">
            <span>Neue Anmeldungen bleiben dann in qrating stehen.</span>
            <Button variant="danger" icon="trash" onClick={remove}>Ja, löschen</Button>
            <Button onClick={() => setConfirmDelete(false)}>Abbrechen</Button>
          </span>}
        </div>
      </form>
    </Panel>
  </div>;
}

function Smtp() {
  const { data, loading, error } = useAsync(() => api('/admin/smtp-settings'), []);
  const [form, setForm] = useState({ host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: 'qrating', replyTo: '', notificationEmail: '', lowRatingAlertsEnabled: false, enabled: false });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data) setForm({
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
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setMessage('Speichere den E-Mail-Versand …');
    try {
      const saved = await api('/admin/smtp-settings', { method: 'PUT', body: JSON.stringify(form) });
      setForm({ ...form, password: '' });
      setMessage(`E-Mail-Versand gespeichert. Passwort hinterlegt: ${saved.has_password ? 'ja' : 'nein'}.`);
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

  const set = (key, cast = (value) => value) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : cast(e.target.value) });

  return <Panel title="Mailserver">
    {loading && <Loading />}
    <ErrorBox error={error} />
    <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
      <Field label="SMTP-Host"><Input value={form.host} onChange={set('host')} placeholder="smtp.example.com" required /></Field>
      <Field label="Port"><Input type="number" value={form.port} onChange={set('port', Number)} required /></Field>
      <Field label="Benutzername"><Input value={form.username} onChange={set('username')} autoComplete="off" /></Field>
      <Field label="Passwort"><Input type="password" value={form.password} onChange={set('password')} placeholder={data?.has_password ? 'Bleibt unverändert, wenn leer' : ''} autoComplete="new-password" /></Field>
      <Field label="Absender-E-Mail"><Input type="email" value={form.fromEmail} onChange={set('fromEmail')} required /></Field>
      <Field label="Absendername"><Input value={form.fromName} onChange={set('fromName')} /></Field>
      <Field label="Antwort an"><Input type="email" value={form.replyTo} onChange={set('replyTo')} /></Field>
      <Field label="Testmails und Hinweise an"><Input type="email" value={form.notificationEmail} onChange={set('notificationEmail')} placeholder="team@example.com" /></Field>
      <Check label="SSL/TLS direkt verwenden" checked={form.secure} onChange={set('secure')} />
      <Check label="E-Mail-Versand einschalten" checked={form.enabled} onChange={set('enabled')} />
      <p className="q-hint md:col-span-2">Wer bei schlechten Bewertungen eine Mail bekommt, legst du unter Meldungen fest. Hier steht nur der Mailserver, über den qrating verschickt.</p>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" variant="primary" icon="mail">Speichern</Button>
        <Button icon="send" onClick={test}>Testmail senden</Button>
      </div>
    </form>
    <Notice message={message} className="mt-3" />
    {data?.last_test_at && <p className="mt-2 q-hint">Letzter Test: {formatDate(data.last_test_at)}, {data.last_test_status || '–'}</p>}
    {data?.last_test_error && <p className="mt-1 text-q-danger">{data.last_test_error}</p>}
  </Panel>;
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

  return <div className="grid gap-4">
    <Notice message={message} />
    <Panel title="Webhook anlegen">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <Field label="Adresse"><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhook" required /></Field>
        <Field label="Secret" hint="Optional, zum Prüfen der Signatur."><Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} autoComplete="off" /></Field>
        <Field label="Ereignisse, durch Komma getrennt" className="md:col-span-2"><Input value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} /></Field>
        <div className="md:col-span-2"><Button type="submit" variant="primary">Webhook speichern</Button></div>
      </form>
    </Panel>
    {loading && <Loading />}
    <ErrorBox error={error} />
    {data?.map((hook) => <Panel key={hook.id} title={hook.url} note={`zuletzt ${hook.last_status || 'noch nicht aufgerufen'}`}>
      <p className="text-q-muted">{hook.events?.join?.(', ') || JSON.stringify(hook.events)}</p>
      {hook.last_error && <p className="mt-1 text-q-danger">{hook.last_error}</p>}
    </Panel>)}
  </div>;
}

// ------------------------------------------------------------------ Sicherheit

const securityTabs = [
  { id: 'sicherheit', label: 'Sicherheit', icon: 'shield' },
  { id: 'betrieb', label: 'Betrieb', icon: 'activity', needs: 'operations' }
];

function Security({ part }) {
  const { go, me } = useAdmin();
  // The state of the background jobs belongs to event managers and above, as on the server.
  const tabs = securityTabs.filter((item) => !item.needs || can(me, item.needs));
  const active = tabs.some((item) => item.id === part) ? part : 'sicherheit';
  return <Page title="Sicherheit" subtitle="2FA, geschützte Kontaktdaten, das Protokoll der Zugriffe und der Stand der Hintergrundjobs.">
    {tabs.length > 1 && <Tabs items={tabs} active={active} onSelect={(id) => go({ page: 'settings', section: 'sicherheit', part: id }, { replace: true })} />}
    {active === 'sicherheit' ? <SecurityCenter /> : <Operations />}
  </Page>;
}

// ------------------------------------------------------------------ Tarif

function Plan() {
  const { me, go } = useAdmin();
  // The plan belongs to admins, owners and the platform role, as on the server.
  const mayRead = can(me, 'plan') || Boolean(me?.platformAdmin);
  const { data, loading, error } = useAsync(() => (mayRead ? api('/admin/billing') : Promise.resolve(null)), [mayRead]);
  if (!mayRead) {
    return <Page title="Tarif" subtitle="Welcher Plan für deine Organisation gilt und was er enthält.">
      <p className="q-notice q-notice-info">Den Tarif deiner Organisation sieht {whoCan('plan')}.</p>
    </Page>;
  }
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const billing = data.billing;
  return <Page title="Tarif" subtitle="Welcher Plan für deine Organisation gilt und was er enthält.">
    <div className="grid gap-3 sm:grid-cols-3">
      <Panel title="Aktiver Plan"><p className="q-num" style={{ fontSize: 24 }}>{billing.effectivePlan}</p></Panel>
      <Panel title="Status"><p className="q-num" style={{ fontSize: 24 }}>{billing.status || 'free'}</p></Panel>
      <Panel title="Quelle"><p className="q-num" style={{ fontSize: 24 }}>{billing.effectiveSource || 'intern'}</p></Panel>
    </div>
    <div className="grid gap-3 lg:grid-cols-3">
      {data.plans.map((plan) => <Panel key={plan.id} title={plan.name} note={billing.effectivePlan === plan.id ? 'aktiv' : null} className={billing.effectivePlan === plan.id ? 'ring-2 ring-q-accent' : ''}>
        <p className="q-num" style={{ fontSize: 22 }}>{plan.price}</p>
        <p className="mt-2 text-q-muted">{plan.summary}</p>
        <ul className="mt-3 grid gap-1.5">
          {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 text-q-ok" />{feature}</li>)}
        </ul>
      </Panel>)}
    </div>
    <p className="text-q-muted">Pläne werden intern vergeben.{me?.platformAdmin && <> Freischalten und Preise pflegen kannst du unter <button type="button" className="font-semibold text-q-accent-text underline" onClick={() => go({ page: 'platform', section: 'tarife' })}>Plattform → Tarife</button>.</>}</p>
  </Page>;
}

// ------------------------------------------------------------------ Darstellung

const thumbnails = import.meta.glob('../designs/*.webp', { eager: true, query: '?url', import: 'default' });
const thumbnailFor = (id) => thumbnails[`../designs/${id}.webp`] || null;

function Design() {
  const { theme, chooseTheme, flash: message, setFlash: setMessage } = useAdmin();

  // Only the newest click speaks; an earlier one that settles later says nothing about the look on screen.
  async function choose(id) {
    setMessage('');
    try {
      const result = await chooseTheme(id);
      if (result.newest) setMessage(`Design „${themeFor(result.saved).name}“ gespeichert. Es gilt für dein Konto, auf jedem Gerät.`);
    } catch (err) {
      if (err.newest === false) return;
      setMessage(errorNotice({ message: `Das Design wurde nicht gespeichert, es bleibt bei „${themeFor(err.keptTheme).name}“. ${err.message}` }));
    }
  }

  return <Page title="Darstellung" subtitle="Wähle, wie der Adminbereich für dich aussieht. Die Wahl gilt für dein Konto; alle anderen behalten ihr eigenes Design.">
    <Notice message={message} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {themes.map((item) => {
        const thumb = thumbnailFor(item.id);
        return <button key={item.id} type="button" className="q-design-card" aria-pressed={item.id === theme.id} onClick={() => choose(item.id)}>
          {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="block bg-q-sunken" style={{ aspectRatio: '16 / 10' }} />}
          <span className="body block">
            <span className="flex items-baseline gap-2">
              <strong className="q-num" style={{ fontSize: 18 }}>{item.number}</strong>
              <strong style={{ fontSize: 15 }}>{item.name}</strong>
              {item.id === theme.id && <span className="q-pill q-pill-live ml-auto">aktiv</span>}
            </span>
            <span className="mt-1 block text-q-muted" style={{ fontSize: 13 }}>{item.blurb}</span>
          </span>
        </button>;
      })}
    </div>
  </Page>;
}

const sections = {
  organisation: Organization,
  team: Team,
  meldungen: Alerts,
  verbindungen: Connections,
  sicherheit: Security,
  tarif: Plan,
  darstellung: Design
};
