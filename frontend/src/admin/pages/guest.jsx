import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAdmin } from '../context.js';
import { guestSections } from '../navigation.js';
import { groupTextKeys, textLabels } from '../textCatalog.js';
import { shellListsSections } from '../themes.js';
import { Button, Check, ErrorBox, Field, Input, Loading, Notice, Page, Panel, Select, TextArea, errorNotice, useAsync } from '../ui.jsx';
import { SectionTabs } from './settings.jsx';

// What guests read and how their page looks.
export function GuestPage({ section }) {
  const { theme, go } = useAdmin();
  return <div>
    {!shellListsSections(theme) && <SectionTabs items={guestSections} active={section} onSelect={(id) => go({ page: 'guest', section: id })} />}
    {section === 'aussehen' ? <Appearance /> : <Texts />}
  </div>;
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
      setMessage(`„${textLabels[key]?.[0] || key}“ gespeichert.`);
      setReload(reload + 1);
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  return <Page title="Texte" subtitle="Was Gäste auf ihrer Seite lesen. Ein leeres Feld zeigt den Standardtext." actions={<Field label="Sprache"><Select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="de">Deutsch</option><option value="en">English</option></Select></Field>}>
    <Notice message={message} />
    {loading && <Loading />}
    <ErrorBox error={error} />
    {data && groupTextKeys(Object.keys(data.defaults)).map(([group, keys]) => <Panel key={group} title={group}>
      <div className="grid gap-4 xl:grid-cols-2">
        {keys.map((key) => {
          const [label, hint] = textLabels[key] || [key];
          return <div key={key} className="grid gap-1.5">
            <Field label={label} hint={hint}>
              <TextArea value={drafts[key] || ''} onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })} style={{ minHeight: 64 }} />
            </Field>
            <div><Button size="sm" onClick={() => save(key)}>Speichern</Button></div>
          </div>;
        })}
      </div>
    </Panel>)}
  </Page>;
}

function Appearance() {
  const { data, loading, error } = useAsync(() => api('/admin/branding'), []);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data) setForm({
      primaryColor: data.primary_color || '#2563eb',
      logoUrl: data.logo_url || '',
      footerText: data.footer_text || '',
      defaultLanguage: data.default_language || 'de',
      qrMarkEnabled: data.qr_mark_enabled !== false,
      productCreditEnabled: data.product_credit_enabled !== false
    });
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/admin/branding', { method: 'PATCH', body: JSON.stringify(form) });
      setMessage('Aussehen der Gästeseite gespeichert.');
    } catch (err) {
      setMessage(errorNotice(err));
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return <Page title="Aussehen" subtitle="Farbe, Logo und die kleinen Zeichen auf der Gästeseite und den Aushängen.">
    {loading && <Loading />}
    <ErrorBox error={error} />
    {form && <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Marke">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Field label="Farbe"><Input type="color" value={form.primaryColor} onChange={set('primaryColor')} style={{ height: 44, padding: 4 }} /></Field>
            <Field label="Logo-Adresse" hint="Ein Bild unter /storage/… oder eine https-Adresse."><Input value={form.logoUrl} onChange={set('logoUrl')} placeholder="/storage/logo.png" /></Field>
            <Field label="Text in der Fußzeile" className="sm:col-span-2"><Input value={form.footerText} onChange={set('footerText')} /></Field>
            <Field label="Sprache der Gästeseite"><Select value={form.defaultLanguage} onChange={set('defaultLanguage')}><option value="de">Deutsch</option><option value="en">English</option></Select></Field>
          </div>
        </Panel>
        <Panel title="Zeichen">
          <div className="grid gap-3">
            <Check label="qrating-Zeichen in der Mitte jedes QR-Codes" checked={form.qrMarkEnabled} onChange={set('qrMarkEnabled')} />
            <Check label="Hinweis auf qrating auf den öffentlichen Seiten" checked={form.productCreditEnabled} onChange={set('productCreditEnabled')} />
            <div className="flex items-center gap-3 rounded-lg bg-q-sunken p-3">
              <span className="h-10 w-10 flex-none rounded-lg" style={{ background: form.primaryColor }} aria-hidden="true" />
              <span className="text-q-muted">Die Gästeseite rechnet die Farbe so um, dass Text darauf lesbar bleibt, hell wie dunkel.</span>
            </div>
          </div>
        </Panel>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" icon="check">Aussehen speichern</Button>
        <Notice message={message} />
      </div>
    </form>}
  </Page>;
}
