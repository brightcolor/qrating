import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { FeedbackFlow, GuestScreen, eventImage } from './guest/FeedbackFlow.jsx';
import { formatDateTime } from './guest/flow.js';

// The website has its own bundle; main.jsx usually loads it directly.
const SiteApp = React.lazy(() => import('./site/SiteApp.jsx'));

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
  const lang = language === 'en' ? 'en' : 'de';
  const suffix = language ? `?lang=${encodeURIComponent(language)}` : '';
  const path = mode === 'event' ? `/public/e/${identifier}${suffix}` : `/public/f/${identifier}${source ? `/${source}` : ''}${suffix}`;
  const { loading, data, error } = useAsync(() => api(path), [path]);

  if (loading) {
    return <GuestScreen lang={lang} loading>
      <p>{lang === 'en' ? 'Loading the feedback form …' : 'Feedbackformular wird geladen …'}</p>
    </GuestScreen>;
  }
  // Closed or unknown events answer with their status and texts; everything else is a loading problem.
  const closed = error?.body?.status ? error.body : data && data.status !== 'ok' ? data : null;
  if (error && !closed) {
    return <GuestScreen lang={lang}>
      <h1>{lang === 'en' ? 'The feedback form did not load.' : 'Die Bewertung ließ sich gerade nicht laden.'}</h1>
      <p>{error.message}</p>
      <button type="button" onClick={() => window.location.reload()} className="guest-primary">
        {lang === 'en' ? 'Reload page' : 'Seite neu laden'}
      </button>
    </GuestScreen>;
  }
  if (closed) {
    const notice = closedNotice(closed, lang);
    const organization = closed.event?.organization || closed.organization;
    return <GuestScreen lang={lang} brandColor={organization?.primaryColor} imageUrl={eventImage(closed.event)}>
      <h1>{notice.headline}</h1>
      <p>{notice.text}</p>
    </GuestScreen>;
  }
  return <FeedbackFlow event={data.event} texts={data.texts} sourceType={source || mode} lang={lang} />;
}

// Headline and text for guest pages without an open feedback round.
function closedNotice(closed, lang) {
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
      text: (texts.not_started_text || 'Sie startet am {datum}.')
        .replaceAll('{datum}', formatDateTime(opensAt, lang === 'en' ? 'en-GB' : 'de-DE'))
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

export default function PublicApp() {
  const path = window.location.pathname;
  if (path.startsWith('/e/')) return <PublicFeedback mode="event" identifier={path.split('/')[2]} source={new URLSearchParams(window.location.search).get('source')} />;
  if (path.startsWith('/f/')) {
    const parts = path.split('/').filter(Boolean);
    return <PublicFeedback mode="dynamic" identifier={parts[1]} source={parts[2] || new URLSearchParams(window.location.search).get('source')} />;
  }
  return <React.Suspense fallback={null}><SiteApp /></React.Suspense>;
}
