import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api, assetUrl } from './lib/api.js';

// The website has its own bundle; main.jsx usually loads it directly.
const SiteApp = React.lazy(() => import('./site/SiteApp.jsx'));

const positiveTags = ['Tolle Stimmung', 'Gute Musik', 'Schöne Location', 'Nettes Team', 'Guter Sound', 'Gerne wieder'];
const improvementTags = ['Einlass', 'Wartezeiten', 'Sound', 'Getränke', 'Preise', 'Toiletten', 'Zu voll'];

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
  // Closed or unknown events answer with their status and texts; everything else is a loading problem.
  const closed = error?.body?.status ? error.body : data && data.status !== 'ok' ? data : null;
  if (error && !closed) {
    return <PublicShell>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-2xl font-semibold">Die Bewertung ließ sich gerade nicht laden.</h1>
        <p className="mt-3 text-neutral-600">{error.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="focus-ring mx-auto mt-6 rounded-md bg-neutral-950 px-5 py-3 font-semibold text-white">Seite neu laden</button>
      </div>
    </PublicShell>;
  }
  if (closed) {
    const notice = closedNotice(closed);
    return <PublicShell>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
        <h1 className="text-2xl font-semibold">{notice.headline}</h1>
        <p className="mt-3 text-neutral-600">{notice.text}</p>
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
      setSubmitError('Bitte wähle noch eine Bewertung aus, bevor du das Feedback sendest.');
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
                className="focus-ring flex min-h-16 items-center justify-center rounded-md p-2 transition hover:bg-neutral-50 sm:min-h-14"
                style={{ color: value <= rating ? color : '#d4d4d4' }}>
                <Star size={38} fill={value <= rating ? color : 'transparent'} strokeWidth={2.4} />
              </button>
            ))}
          </div>
        </section>
        <TagPicker title="Was hat für dich gepasst?" tags={positiveTags} value={form.positiveTags} onChange={(next) => setForm({ ...form, positiveTags: next })} />
        <Textarea label={texts.positive_label} placeholder={texts.positive_placeholder} value={form.commentPositive || ''} onChange={(value) => setForm({ ...form, commentPositive: value })} />
        <TagPicker title="Wo dürfen wir besser werden?" tags={improvementTags} value={form.improvementTags} onChange={(next) => setForm({ ...form, improvementTags: next })} />
        <Textarea label={texts.improvement_label} placeholder={texts.improvement_placeholder} value={form.commentImprovement || ''} onChange={(value) => setForm({ ...form, commentImprovement: value })} />
        {rating > 0 && rating <= 2 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-base font-semibold text-amber-950">{texts.low_rating_contact_headline || 'Das tut uns leid.'}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">{texts.low_rating_contact_text || 'Wenn du magst, hinterlass uns deine Handynummer. Wir melden uns sehr zeitnah und klären persönlich, was passiert ist.'}</p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-amber-950">{texts.low_rating_phone_label || 'Handynummer für Rückruf'}</span>
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
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <button className="focus-ring w-full rounded-md px-5 py-4 text-lg font-semibold text-white" style={{ backgroundColor: color }}>{texts.submit}</button>
        </div>
      </form>
    </main>
  </PublicShell>;
}

// Headline and text for guest pages without an open feedback round.
function closedNotice(closed) {
  const texts = closed.texts || {};
  if (closed.status === 'organization_not_found' || closed.status === 'event_not_found') {
    return {
      headline: texts.not_found_headline || 'Diese Bewertungsseite gibt es nicht.',
      text: texts.not_found_text || 'Prüfe den QR-Code oder den Link.'
    };
  }
  const opensAt = closed.feedback?.opensAt ? new Date(closed.feedback.opensAt) : null;
  if (closed.status === 'closed' && opensAt && opensAt > new Date()) {
    return {
      headline: texts.not_started_headline || 'Die Bewertung ist noch nicht geöffnet.',
      text: (texts.not_started_text || 'Sie startet am {datum}.').replaceAll('{datum}', formatDate(opensAt))
    };
  }
  if (closed.status === 'closed') {
    return {
      headline: texts.expired_headline || 'Die Feedbackrunde ist beendet.',
      text: texts.expired_text || 'Für dieses Event ist die Bewertungszeit abgelaufen.'
    };
  }
  return {
    headline: texts.no_event_headline || 'Gerade ist kein Event zur Bewertung geöffnet.',
    text: texts.no_event_text || 'Schau gerne später noch einmal vorbei.'
  };
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
    return <label className="block"><span className="font-medium">{question.label}</span><select className="mt-2 w-full rounded-md border px-4 py-3" value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">Bitte wählen</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  }
  if (question.question_type === 'yes_no') {
    return <TagPicker title={question.label} tags={['Ja', 'Nein']} value={value ? [value] : []} onChange={(next) => onChange(next.at(-1) || '')} />;
  }
  return <Textarea label={question.label} placeholder={question.placeholder || ''} value={value || ''} onChange={onChange} />;
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
  return <React.Suspense fallback={null}><SiteApp /></React.Suspense>;
}
