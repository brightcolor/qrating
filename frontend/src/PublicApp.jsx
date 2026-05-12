import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, HelpCircle, Share2, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { api, assetUrl } from './lib/api.js';

const positiveTags = ['Tolle Stimmung', 'Gute Musik', 'Schoene Location', 'Nettes Team', 'Guter Sound', 'Gerne wieder'];
const improvementTags = ['Einlass', 'Wartezeiten', 'Sound', 'Getraenke', 'Preise', 'Toiletten', 'Zu voll'];

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

function PublicFeedback({ mode, identifier, source }) {
  const language = new URLSearchParams(window.location.search).get('lang');
  const suffix = language ? `?lang=${encodeURIComponent(language)}` : '';
  const path = mode === 'event' ? `/public/e/${identifier}${suffix}` : `/public/f/${identifier}${source ? `/${source}` : ''}${suffix}`;
  const { loading, data, error } = useAsync(() => api(path), [path]);
  const [rating, setRating] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ newsletterOptin: false, answers: {}, positiveTags: [], improvementTags: [] });
  const [submitError, setSubmitError] = useState('');
  const [startedAt] = useState(() => new Date().toISOString());

  if (loading) return <PublicShell><p className="p-8 text-center">Lade Feedbackformular ...</p></PublicShell>;
  if (error || data?.status !== 'ok') {
    const texts = data?.texts || {};
    return <PublicShell>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-2xl font-semibold">{texts.no_event_headline || texts.expired_headline || 'Gerade ist kein Event zur Bewertung geoeffnet.'}</h1>
        <p className="mt-3 text-neutral-600">{texts.no_event_text || texts.expired_text || 'Schau gerne spaeter nochmal vorbei.'}</p>
      </div>
    </PublicShell>;
  }

  const event = data.event;
  const texts = data.texts;
  const color = event.organization.primaryColor || '#2563eb';

  async function submit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!rating) {
      setSubmitError('Bitte waehle noch eine Bewertung aus.');
      return;
    }
    try {
      const answers = { ...form.answers, positive_tags: form.positiveTags, improvement_tags: form.improvementTags };
      await api(`/public/events/${event.token}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          commentPositive: form.commentPositive || '',
          commentImprovement: form.commentImprovement || '',
          generalComment: form.generalComment || '',
          newsletterOptin: form.newsletterOptin,
          newsletterEmail: form.newsletterEmail || '',
          contactRequested: Boolean(form.contactPhone),
          contactPhone: form.contactPhone || '',
          contactNote: form.contactNote || '',
          testimonialAllowed: form.testimonialAllowed || false,
          sourceType: source || mode,
          honeypot: form.website || '',
          startedAt,
          answers
        })
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err.message);
    }
  }

  if (done) {
    return <PublicShell>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12 text-center">
        <h1 className="text-3xl font-semibold">{texts.thank_headline}</h1>
        <p className="mt-3 text-lg text-neutral-700">{texts.thank_text}</p>
        {event.organization.logoUrl && <img className="mx-auto mt-8 h-12 object-contain" src={assetUrl(event.organization.logoUrl)} alt={event.organization.name} />}
      </div>
    </PublicShell>;
  }

  return <PublicShell>
    <main className="mx-auto min-h-dvh max-w-2xl bg-white shadow-sm sm:my-6 sm:min-h-0 sm:rounded-lg">
      <header className="relative min-h-[32dvh] max-h-[380px] overflow-hidden bg-neutral-900 sm:min-h-56 sm:rounded-t-lg">
        {event.imageUrl && <img className="absolute inset-0 h-full w-full object-cover" src={assetUrl(event.imageUrl)} alt={event.imageAlt} fetchPriority="high" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
        <div className="relative flex min-h-[32dvh] flex-col justify-end p-4 text-white sm:min-h-56 sm:p-5">
          <p className="text-sm opacity-90">{formatDate(event.dateFrom)}{event.location ? ` - ${event.location}` : ''}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{texts.headline}</h1>
          <p className="mt-2 max-w-lg text-sm text-white/90 sm:text-base">{texts.subtitle}</p>
        </div>
      </header>
      <form onSubmit={submit} className="space-y-6 p-4 pb-28 sm:space-y-7 sm:p-5">
        <input className="hidden" tabIndex="-1" autoComplete="off" name="website" value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        <section>
          <label className="block text-base font-semibold">{texts.rating_label}</label>
          <div className="mt-3 grid grid-cols-5 gap-1" role="radiogroup" aria-label={texts.rating_label}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" aria-label={`${value} Sterne`} onClick={() => setRating(value)}
                className="focus-ring flex min-h-14 items-center justify-center rounded-md p-2 transition hover:bg-neutral-50"
                style={{ color: value <= rating ? color : '#d4d4d4' }}>
                <Star size={38} fill={value <= rating ? color : 'transparent'} strokeWidth={2.4} />
              </button>
            ))}
          </div>
        </section>
        <TagPicker title="Was hat fuer dich gepasst?" tags={positiveTags} value={form.positiveTags} onChange={(next) => setForm({ ...form, positiveTags: next })} />
        <Textarea label={texts.positive_label} placeholder={texts.positive_placeholder} value={form.commentPositive || ''} onChange={(value) => setForm({ ...form, commentPositive: value })} />
        <TagPicker title="Wo duerfen wir besser werden?" tags={improvementTags} value={form.improvementTags} onChange={(next) => setForm({ ...form, improvementTags: next })} />
        <Textarea label={texts.improvement_label} placeholder={texts.improvement_placeholder} value={form.commentImprovement || ''} onChange={(value) => setForm({ ...form, commentImprovement: value })} />
        {rating > 0 && rating <= 2 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-base font-semibold text-amber-950">{texts.low_rating_contact_headline || 'Das tut uns leid.'}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">{texts.low_rating_contact_text || 'Wenn du magst, hinterlass uns deine Handynummer. Wir melden uns sehr zeitnah und klaeren persoenlich, was passiert ist.'}</p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-amber-950">{texts.low_rating_phone_label || 'Handynummer fuer Rueckruf'}</span>
            <input className="focus-ring mt-2 w-full rounded-md border border-amber-300 px-4 py-3 text-base" inputMode="tel" autoComplete="tel" placeholder={texts.low_rating_phone_placeholder || '+49 ...'} value={form.contactPhone || ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-medium text-amber-950">{texts.low_rating_note_label || 'Worum ging es kurz?'}</span>
            <textarea className="focus-ring mt-2 min-h-20 w-full rounded-md border border-amber-300 px-4 py-3 text-base" placeholder={texts.low_rating_note_placeholder || 'Ein Satz reicht. Wir melden uns dann mit mehr Ruhe bei dir.'} value={form.contactNote || ''} onChange={(e) => setForm({ ...form, contactNote: e.target.value })} />
          </label>
        </section>}
        {event.questions?.filter((q) => !['positive_tags', 'improvement_tags'].includes(q.internal_name)).map((question) => (
          <Question key={question.id} question={question} value={form.answers[question.internal_name]} onChange={(value) => setForm({ ...form, answers: { ...form.answers, [question.internal_name]: value } })} />
        ))}
        <label className="flex gap-3 rounded-md bg-neutral-50 p-4">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={form.newsletterOptin} onChange={(e) => setForm({ ...form, newsletterOptin: e.target.checked })} />
          <span><span className="font-medium">{texts.newsletter_label}</span><span className="mt-1 block text-sm text-neutral-600">{texts.newsletter_help}</span></span>
        </label>
        {form.newsletterOptin && <input className="focus-ring w-full rounded-md border border-neutral-300 px-4 py-3 text-base" type="email" placeholder="deine@email.de" value={form.newsletterEmail || ''} onChange={(e) => setForm({ ...form, newsletterEmail: e.target.value })} />}
        <p className="text-sm text-neutral-500">{event.organization.privacyText || texts.privacy_short}</p>
        {event.organization.footerText && <p className="text-sm text-neutral-500">{event.organization.footerText}</p>}
        {submitError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <button className="focus-ring w-full rounded-md px-5 py-4 text-lg font-semibold text-white" style={{ backgroundColor: color }}>{texts.submit}</button>
        </div>
      </form>
    </main>
  </PublicShell>;
}

function PublicShell({ children }) {
  return <div className="min-h-screen bg-[#f7f7f4]">{children}</div>;
}

function TagPicker({ title, tags, value, onChange }) {
  const selected = new Set(value || []);
  return <section>
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button key={tag} type="button" onClick={() => {
          const next = new Set(selected);
          next.has(tag) ? next.delete(tag) : next.add(tag);
          onChange([...next]);
        }} className={`focus-ring min-h-11 rounded-md border px-3 py-2 text-sm ${selected.has(tag) ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}>
          {tag}
        </button>
      ))}
    </div>
  </section>;
}

function Textarea({ label, placeholder, value, onChange }) {
  return <label className="block">
    <span className="font-medium">{label}</span>
    <textarea className="focus-ring mt-2 min-h-24 w-full rounded-md border border-neutral-300 px-4 py-3 text-base" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  </label>;
}

function Question({ question, value, onChange }) {
  const options = question.options || [];
  if (question.question_type === 'checkboxes') return <TagPicker title={question.label} tags={options} value={value || []} onChange={onChange} />;
  if (question.question_type === 'multiple_choice') {
    return <label className="block"><span className="font-medium">{question.label}</span><select className="mt-2 w-full rounded-md border px-4 py-3" value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">Bitte waehlen</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  if (question.question_type === 'yes_no') {
    return <TagPicker title={question.label} tags={['Ja', 'Nein']} value={value ? [value] : []} onChange={(next) => onChange(next.at(-1) || '')} />;
  }
  return <Textarea label={question.label} placeholder={question.placeholder || ''} value={value || ''} onChange={onChange} />;
}

function MarketingPage({ page }) {
  const { loading, data, error } = useAsync(() => api('/public/site'), []);
  if (loading) return <PublicShell><div className="mx-auto max-w-5xl p-6">Lade qrating ...</div></PublicShell>;
  if (error) return <PublicShell><div className="mx-auto max-w-5xl p-6 text-red-700">{error.message}</div></PublicShell>;
  const content = data.content || {};
  if (page === 'impressum') return <LegalPage title="Impressum" content={content.imprint} site={content} />;
  if (page === 'datenschutz') return <LegalPage title="Datenschutz" content={content.privacy} site={content} />;
  if (page === 'faq') return <FaqPage site={content} />;
  return <Landing site={content} />;
}

function landingImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('/storage')) return assetUrl(url);
  return url;
}

function SiteNav({ site }) {
  return <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
      <a href="/" className="flex items-center gap-2 font-semibold text-neutral-950"><Star size={20} className="text-blue-600" fill="#2563eb" /> {site.brand || 'qrating'}</a>
      <nav className="hidden items-center gap-5 text-sm text-neutral-600 sm:flex">
        <a href="/#features" className="hover:text-neutral-950">Features</a>
        <a href="/faq" className="hover:text-neutral-950">FAQ</a>
        <a href="/datenschutz" className="hover:text-neutral-950">Datenschutz</a>
      </nav>
      <a href={site.primaryCtaUrl || '/admin'} className="rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white">Admin</a>
    </div>
  </header>;
}

function Landing({ site }) {
  const heroImage = landingImageUrl(site.heroImageUrl);
  const [shareMessage, setShareMessage] = useState('');
  return <div className="min-h-screen bg-[#f7f7f4] text-neutral-950">
    <SiteNav site={site} />
    <section className="relative min-h-[76vh] overflow-hidden bg-neutral-950">
      {heroImage && <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" />
      <div className="relative mx-auto flex min-h-[76vh] max-w-6xl flex-col justify-center px-5 py-16 text-white">
        <p className="inline-flex w-fit items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm text-white/90 ring-1 ring-white/20"><Sparkles size={16} /> {site.eyebrow}</p>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">{site.headline}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-white/90">{site.subheadline}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={site.primaryCtaUrl || '/admin'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-5 py-3 font-semibold text-neutral-950">{site.primaryCtaLabel || 'Admin oeffnen'} <ArrowRight size={18} /></a>
          <a href={site.secondaryCtaUrl || '/f/demo-events'} className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10">{site.secondaryCtaLabel || 'Feedback-Beispiel'}</a>
        </div>
        {site.trustText && <p className="mt-6 max-w-xl text-sm leading-6 text-white/70">{site.trustText}</p>}
      </div>
    </section>

    <section id="features" className="mx-auto max-w-6xl px-5 py-14">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-blue-700">Produkt</p>
        <h2 className="mt-2 text-3xl font-semibold">Feedback sammeln, auswerten und schnell reagieren.</h2>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {(site.features || []).map((feature, index) => <article key={`${feature.title}-${index}`} className="rounded-lg border border-neutral-200 bg-white p-5">
          <CheckCircle2 className="text-emerald-600" />
          <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
          <p className="mt-2 leading-7 text-neutral-600">{feature.text}</p>
        </article>)}
      </div>
    </section>

    <section className="bg-white py-14">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Ablauf</p>
          <h2 className="mt-2 text-3xl font-semibold">Vom Scan zur Entscheidung.</h2>
          <p className="mt-3 leading-7 text-neutral-600">qrating bleibt fuer Besucher leicht und gibt Veranstaltern genug Struktur fuer klare naechste Schritte.</p>
        </div>
        <div className="grid gap-3">
          {(site.steps || []).map((step, index) => <div key={`${step.title}-${index}`} className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm font-semibold text-neutral-500">0{index + 1}</p>
            <h3 className="mt-1 font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{step.text}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section id="pricing" className="mx-auto max-w-6xl px-5 py-14">
      {shareMessage && <p className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{shareMessage}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        {(site.pricing || []).map((item) => <article key={item.name} className={`rounded-lg border bg-white p-5 ${item.highlight ? 'border-blue-500 ring-2 ring-blue-100' : 'border-neutral-200'}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">{item.name}</h3>
            <button type="button" className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100" title={`${item.name} teilen`} onClick={async () => setShareMessage(await sharePlan(item))}><Share2 size={16} /></button>
          </div>
          <p className="mt-3 text-2xl font-semibold">{item.price}</p>
          <p className="mt-3 text-sm leading-6 text-neutral-600">{item.text}</p>
          <ul className="mt-4 space-y-2 text-sm text-neutral-700">
            {(item.features || []).map((feature) => <li key={feature} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 text-emerald-600" /> <span>{feature}</span></li>)}
          </ul>
          <a href={planContactUrl(site, item)} className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-neutral-950 px-4 py-3 text-sm font-semibold text-white">{item.ctaLabel || 'Plan anfragen'}</a>
        </article>)}
      </div>
    </section>

    <section className="bg-neutral-950 py-14 text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <HelpCircle className="text-amber-300" />
          <h2 className="mt-4 text-3xl font-semibold">Haeufige Fragen</h2>
          <a href="/faq" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-200">Alle Fragen ansehen <ArrowRight size={16} /></a>
        </div>
        <div className="grid gap-3">
          {(site.faq || []).slice(0, 3).map((item) => <details key={item.question} className="rounded-lg bg-white/10 p-4">
            <summary className="cursor-pointer font-semibold">{item.question}</summary>
            <p className="mt-3 text-sm leading-6 text-white/75">{item.answer}</p>
          </details>)}
        </div>
      </div>
    </section>

    <SiteFooter site={site} />
  </div>;
}

function LegalPage({ title, content, site }) {
  return <div className="min-h-screen bg-[#f7f7f4]">
    <SiteNav site={site} />
    <main className="mx-auto max-w-3xl px-5 py-12">
      <ShieldCheck className="text-blue-700" />
      <h1 className="mt-4 text-4xl font-semibold">{title}</h1>
      <div className="mt-8 whitespace-pre-wrap rounded-lg bg-white p-6 leading-7 text-neutral-700 shadow-sm">{content}</div>
    </main>
    <SiteFooter site={site} />
  </div>;
}

function FaqPage({ site }) {
  return <div className="min-h-screen bg-[#f7f7f4]">
    <SiteNav site={site} />
    <main className="mx-auto max-w-4xl px-5 py-12">
      <HelpCircle className="text-amber-600" />
      <h1 className="mt-4 text-4xl font-semibold">FAQ</h1>
      <div className="mt-8 grid gap-3">
        {(site.faq || []).map((item) => <details key={item.question} className="rounded-lg bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold">{item.question}</summary>
          <p className="mt-3 leading-7 text-neutral-600">{item.answer}</p>
        </details>)}
      </div>
    </main>
    <SiteFooter site={site} />
  </div>;
}

function SiteFooter({ site }) {
  return <footer className="border-t border-neutral-200 bg-white">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 text-sm text-neutral-600 md:flex-row md:items-center md:justify-between">
      <p>{site.footerText || `${site.brand || 'qrating'} - QR-Feedback fuer Events`}</p>
      <div className="flex flex-wrap gap-4">
        {site.contactEmail && <a href={`mailto:${site.contactEmail}`} className="hover:text-neutral-950">Kontakt</a>}
        <a href="/impressum" className="hover:text-neutral-950">Impressum</a>
        <a href="/datenschutz" className="hover:text-neutral-950">Datenschutz</a>
        <a href="/admin" className="hover:text-neutral-950">Admin</a>
      </div>
    </div>
  </footer>;
}

async function sharePlan(item) {
  const url = `${window.location.origin}/#pricing`;
  const text = `${item.name}: ${item.text}`;
  if (navigator.share) {
    await navigator.share({ title: item.name, text, url }).catch(() => {});
    return 'Teilen-Dialog geoeffnet.';
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'Link zum Tarif wurde kopiert.';
  } catch {
    window.location.href = `mailto:?subject=${encodeURIComponent(`qrating ${item.name}`)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
    return 'E-Mail zum Teilen wurde vorbereitet.';
  }
}

function planContactUrl(site, item) {
  const email = site.contactEmail || 'kontakt@qrating.app';
  const subject = `qrating ${item.name || 'Plan'}`;
  const body = `Hallo,\n\nich interessiere mich fuer den Plan ${item.name || ''}.\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function PublicApp() {
  const path = window.location.pathname;
  if (path.startsWith('/e/')) return <PublicFeedback mode="event" identifier={path.split('/')[2]} source={new URLSearchParams(window.location.search).get('source')} />;
  if (path.startsWith('/f/')) {
    const parts = path.split('/').filter(Boolean);
    return <PublicFeedback mode="dynamic" identifier={parts[1]} source={parts[2] || new URLSearchParams(window.location.search).get('source')} />;
  }
  if (path === '/impressum') return <MarketingPage page="impressum" />;
  if (path === '/datenschutz') return <MarketingPage page="datenschutz" />;
  if (path === '/faq') return <MarketingPage page="faq" />;
  return <MarketingPage page="landing" />;
}
