import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { platformSections } from '../navigation.js';
import { shellListsSections } from '../themes.js';
import { Button, ButtonLink, Check, ErrorBox, Field, Input, Loading, Notice, Page, Panel, Select, TextArea, errorNotice, useAsync } from '../ui.jsx';
import { SectionTabs } from './settings.jsx';

// The pages of the platform role: all tenants, the product website, the plans.
export function PlatformPage({ section }) {
  const { theme, go, me } = useAdmin();
  // The role is known once the account has loaded; until then the page shows nothing of it.
  if (!me) return <Loading />;
  if (!me.platformAdmin) {
    return <Page title="Plattform"><p className="text-q-muted">Diese Seiten gehören der Plattform-Rolle. Frag einen Plattform-Admin, wenn du hier etwas ändern möchtest.</p></Page>;
  }
  const Section = { mandanten: Tenants, website: Website, tarife: Plans }[section] || Tenants;
  return <div>
    {!shellListsSections(theme) && <SectionTabs items={platformSections} active={section} onSelect={(id) => go({ page: 'platform', section: id })} />}
    <Section />
  </div>;
}

// ------------------------------------------------------------------ Mandanten

function Tenants() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/platform/organizations'), [reload]);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState({ name: '', slug: '' });

  async function createTenant(e) {
    e.preventDefault();
    setMessage('');
    try {
      const created = await api('/admin/platform/organizations', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ name: '', slug: '' });
      setMessage(`Mandant „${created.name}“ angelegt. Kurzname: ${created.slug}`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  async function enter(organization) {
    setMessage('');
    try {
      await api(`/admin/platform/organizations/${organization.id}/enter`, { method: 'POST', body: '{}' });
      // Every page holds data of the previous tenant, so the admin area starts fresh.
      window.location.assign('/admin');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const organizations = data?.organizations || [];
  return <Page title="Mandanten" subtitle="Jeder Mandant hat eigene Events, Fragen, Texte und Gäste. Betritt einen Mandanten, um darin zu arbeiten." actions={<Button icon="refresh" onClick={() => setReload(reload + 1)}>Neu laden</Button>}>
    <Notice message={message} />
    <ErrorBox error={error} />
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-3">
        {loading && <Loading />}
        {organizations.map((organization) => {
          const here = organization.id === data.currentOrganizationId;
          const home = organization.id === data.homeOrganizationId;
          return <Panel key={organization.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong style={{ fontSize: 16 }}>{organization.name}</strong>
                  <span className="text-q-muted">{organization.slug}</span>
                  {here && <span className="q-pill q-pill-live">Hier bist du</span>}
                  {home && <span className="q-pill q-pill-soon">Dein Konto</span>}
                </div>
                <p className="mt-1 text-q-muted">Tarif {organization.plan}{organization.planSource === 'override' ? ' (freigeschaltet)' : ''}, {organization.events} aktive Events, {organization.feedbacks} Bewertungen, {organization.users} Personen, {organization.pretixConnections} Pretix-Verbindungen</p>
              </div>
              {here ? <span className="text-q-muted">Aktueller Mandant</span> : <Button variant="primary" icon="login" onClick={() => enter(organization)}>Betreten</Button>}
            </div>
          </Panel>;
        })}
        {!loading && organizations.length === 0 && <Panel><p className="text-q-muted">Noch kein Mandant angelegt.</p></Panel>}
      </div>
      <Panel title="Neuer Mandant">
        <form onSubmit={createTenant} className="grid gap-3">
          <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Stadthalle Wismar" required /></Field>
          <Field label="Kurzname, optional" hint="Steht im QR-Code des Mandanten und lässt sich später nicht mehr ändern. Leer lassen bildet ihn aus dem Namen.">
            <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="stadthalle-wismar" />
          </Field>
          <Button type="submit" variant="primary" icon="plus">Mandant anlegen</Button>
        </form>
      </Panel>
    </div>
  </Page>;
}

// ------------------------------------------------------------------ Website

const emptyItems = {
  features: { title: '', text: '' },
  steps: { title: '', text: '' },
  faq: { question: '', answer: '' }
};

function EditableList({ title, items, fields, onChange, onAdd, onRemove }) {
  return <Panel title={title} actions={<Button size="sm" icon="plus" onClick={onAdd}>Eintrag</Button>}>
    <div className="grid gap-3">
      {items.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-q-line p-3 md:grid-cols-2">
        {fields.map(([key, label]) => {
          const long = key === 'text' || key === 'answer';
          return <Field key={key} label={label} className={long ? 'md:col-span-2' : ''}>
            {long ? <TextArea value={item[key] || ''} onChange={(e) => onChange(index, key, e.target.value)} style={{ minHeight: 64 }} /> : <Input value={item[key] || ''} onChange={(e) => onChange(index, key, e.target.value)} />}
          </Field>;
        })}
        <div className="md:col-span-2"><Button size="sm" icon="trash" onClick={() => onRemove(index)}>Entfernen</Button></div>
      </div>)}
      {!items.length && <p className="text-q-muted">Noch keine Einträge.</p>}
    </div>
  </Panel>;
}

function Website() {
  const { data, loading, error } = useAsync(() => api('/admin/site-content'), []);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data?.content) setForm(data.content);
  }, [data]);

  const updateList = (listName, index, key, value) => {
    const next = [...(form[listName] || [])];
    next[index] = { ...next[index], [key]: value };
    setForm({ ...form, [listName]: next });
  };
  const addListItem = (listName) => setForm({ ...form, [listName]: [...(form[listName] || []), { ...emptyItems[listName] }] });
  const removeListItem = (listName, index) => setForm({ ...form, [listName]: (form[listName] || []).filter((_, itemIndex) => itemIndex !== index) });
  const text = (key, props = {}) => <Input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />;

  async function save(e) {
    e.preventDefault();
    setMessage('');
    try {
      const result = await api('/admin/site-content', { method: 'PATCH', body: JSON.stringify({ content: form }) });
      setForm(result.content);
      setMessage('Website gespeichert.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <Page title="Website" subtitle="Die Produktseite qrating.de. Die Tarife dort kommen aus Plattform → Tarife." actions={<ButtonLink href="/" target="_blank" rel="noreferrer" icon="external">Ansehen</ButtonLink>}>
    {loading && <Loading />}
    <ErrorBox error={error} />
    {form && <form onSubmit={save} className="grid gap-4">
      <Panel title="Kopfbereich">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Marke">{text('brand')}</Field>
          <Field label="Zeile über der Überschrift">{text('eyebrow')}</Field>
          <Field label="Überschrift" className="md:col-span-2">{text('headline')}</Field>
          <Field label="Untertitel" className="md:col-span-2"><TextArea value={form.subheadline || ''} onChange={(e) => setForm({ ...form, subheadline: e.target.value })} /></Field>
          <Field label="Eventfoto im Kopfbereich, optional" className="md:col-span-2">{text('heroImageUrl', { placeholder: 'https://… oder /storage/…' })}</Field>
          <Field label="Hauptknopf: Text">{text('primaryCtaLabel')}</Field>
          <Field label="Hauptknopf: Link">{text('primaryCtaUrl', { placeholder: '#zugang' })}</Field>
          <Field label="Zweiter Knopf: Text">{text('secondaryCtaLabel')}</Field>
          <Field label="Zweiter Knopf: Link, auch im QR-Code">{text('secondaryCtaUrl', { placeholder: '/f/veranstalter' })}</Field>
          <Field label="Zeile unter den Knöpfen" className="md:col-span-2">{text('trustText')}</Field>
          <Field label="Kontakt-E-Mail">{text('contactEmail')}</Field>
          <Field label="Text in der Fußzeile">{text('footerText')}</Field>
        </div>
      </Panel>
      <Panel title="Abschnitte" note="Eine leere Überschrift zeigt den Standardtext.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Überschrift Ablauf">{text('stepsHeadline')}</Field>
          <Field label="Überschrift Funktionen">{text('featuresHeadline')}</Field>
          <Field label="Überschrift Preise">{text('pricingHeadline')}</Field>
          <Field label="Hinweis neben den Preisen">{text('pricingNote', { placeholder: 'z. B. Hinweis zur Umsatzsteuer' })}</Field>
          <Field label="Überschrift Fragen">{text('faqHeadline')}</Field>
          <Field label="Abschluss: Überschrift">{text('ctaHeadline')}</Field>
          <Field label="Abschluss: Text" className="md:col-span-2">{text('ctaText')}</Field>
        </div>
      </Panel>
      <EditableList title="Funktionen" items={form.features || []} fields={[['title', 'Titel'], ['text', 'Text']]} onChange={(i, k, v) => updateList('features', i, k, v)} onAdd={() => addListItem('features')} onRemove={(i) => removeListItem('features', i)} />
      <EditableList title="Ablauf" items={form.steps || []} fields={[['title', 'Titel'], ['text', 'Text']]} onChange={(i, k, v) => updateList('steps', i, k, v)} onAdd={() => addListItem('steps')} onRemove={(i) => removeListItem('steps', i)} />
      <EditableList title="Häufige Fragen" items={form.faq || []} fields={[['question', 'Frage'], ['answer', 'Antwort']]} onChange={(i, k, v) => updateList('faq', i, k, v)} onAdd={() => addListItem('faq')} onRemove={(i) => removeListItem('faq', i)} />
      <Panel title="Rechtliche Seiten">
        <div className="grid gap-3 lg:grid-cols-2">
          <Check label="Im Fuß der Website auf bright color hinweisen" checked={form.showProductCredit !== false} onChange={(e) => setForm({ ...form, showProductCredit: e.target.checked })} className="lg:col-span-2" />
          <Field label="Impressum"><TextArea value={form.imprint || ''} onChange={(e) => setForm({ ...form, imprint: e.target.value })} style={{ minHeight: 260 }} /></Field>
          <Field label="Datenschutz"><TextArea value={form.privacy || ''} onChange={(e) => setForm({ ...form, privacy: e.target.value })} style={{ minHeight: 260 }} /></Field>
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" icon="globe">Website speichern</Button>
        <Notice message={message} />
      </div>
    </form>}
  </Page>;
}

// ------------------------------------------------------------------ Tarife

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

function Plans() {
  const [reload, setReload] = useState(0);
  const { data, loading, error } = useAsync(() => api('/admin/billing'), [reload]);
  const [message, setMessage] = useState('');
  const [override, setOverride] = useState({ plan: 'pro', expiresAt: '', reason: '' });
  const [drafts, setDrafts] = useState([]);

  useEffect(() => {
    if (data?.plans) setDrafts(data.plans.map(planToDraft));
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
      const result = await api('/admin/billing/plans', { method: 'PATCH', body: JSON.stringify({ plans: drafts.map(draftToPlan) }) });
      setMessage('Tarife, Leistungen und Limits gespeichert. Die Website zeigt sie ab sofort.');
      setDrafts(result.plans.map(planToDraft));
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const updateDraft = (index, patch) => setDrafts(drafts.map((plan, planIndex) => (planIndex === index ? { ...plan, ...patch } : plan)));

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const billing = data.billing;
  return <Page title="Tarife" subtitle="Preise, Leistungen und Limits gelten für alle Mandanten und stehen so auf der Website.">
    <Notice message={message} />
    {billing.canOverride && <Panel title="Tarif für diesen Mandanten freischalten" note={`gerade: ${billing.effectivePlan}`}>
      <form onSubmit={saveOverride} className="grid gap-3 md:grid-cols-[160px_220px_1fr_auto] md:items-end">
        <Field label="Tarif"><Select value={override.plan} onChange={(e) => setOverride({ ...override, plan: e.target.value })}><option value="free">Free</option><option value="pro">Pro</option><option value="business">Business</option></Select></Field>
        <Field label="Gültig bis, optional"><Input type="datetime-local" value={override.expiresAt} onChange={(e) => setOverride({ ...override, expiresAt: e.target.value })} /></Field>
        <Field label="Grund"><Input value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="Demo, Partner, Kulanz …" /></Field>
        <Button type="submit" variant="primary" icon="shield">Freischalten</Button>
      </form>
    </Panel>}
    {billing.canManagePlans ? <form onSubmit={savePlans} className="grid gap-4">
      {drafts.map((plan, index) => <Panel key={plan.id} title={plan.name || plan.id} actions={<div className="flex flex-wrap gap-3">
        <Check label="öffentlich" checked={plan.publicVisible} onChange={(e) => updateDraft(index, { publicVisible: e.target.checked })} />
        <Check label="hervorheben" checked={plan.highlight} onChange={(e) => updateDraft(index, { highlight: e.target.checked })} />
        <Check label="aktiv" checked={plan.active} onChange={(e) => updateDraft(index, { active: e.target.checked })} />
      </div>}>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Name"><Input value={plan.name} onChange={(e) => updateDraft(index, { name: e.target.value })} /></Field>
          <Field label="Preis"><Input value={plan.price} onChange={(e) => updateDraft(index, { price: e.target.value })} /></Field>
          <Field label="Knopf"><Input value={plan.ctaLabel} onChange={(e) => updateDraft(index, { ctaLabel: e.target.value })} /></Field>
          <Field label="Reihenfolge"><Input type="number" value={plan.sortOrder} onChange={(e) => updateDraft(index, { sortOrder: e.target.value })} /></Field>
          <Field label="Beschreibung" className="md:col-span-2"><TextArea value={plan.summary} onChange={(e) => updateDraft(index, { summary: e.target.value })} style={{ minHeight: 64 }} /></Field>
          <Field label="Leistungen, eine Zeile je Eintrag" className="md:col-span-2"><TextArea value={plan.featuresText} onChange={(e) => updateDraft(index, { featuresText: e.target.value })} style={{ minHeight: 64 }} /></Field>
          <Field label="Aktive Events" hint="Leer heißt unbegrenzt."><Input type="number" min="0" value={plan.activeEvents} onChange={(e) => updateDraft(index, { activeEvents: e.target.value })} /></Field>
          <Field label="Fragensätze" hint="Leer heißt unbegrenzt."><Input type="number" min="0" value={plan.templates} onChange={(e) => updateDraft(index, { templates: e.target.value })} /></Field>
          <Field label="Personen" hint="Leer heißt unbegrenzt."><Input type="number" min="0" value={plan.users} onChange={(e) => updateDraft(index, { users: e.target.value })} /></Field>
          <div className="grid content-end gap-1.5">
            {[['pretix', 'Pretix'], ['reports', 'Berichte'], ['webhooks', 'Webhooks'], ['teams', 'Teams'], ['customDomain', 'Eigene Domain']].map(([key, label]) => <Check key={key} label={label} checked={plan[key]} onChange={(e) => updateDraft(index, { [key]: e.target.checked })} />)}
          </div>
        </div>
      </Panel>)}
      <div><Button type="submit" variant="primary" icon="card">Tarife speichern</Button></div>
    </form> : <p className="text-q-muted">Die Tarife sind für die ganze Installation gleich. Ändern dürfen sie nur Plattform-Admins.</p>}
  </Page>;
}
