import React, { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { FeedbackFlow, GuestScreen, GuestStage, eventImage } from './guest/FeedbackFlow.jsx';
import { assetUrl } from './lib/api.js';
import { WaitingScreen } from './guest/Upcoming.jsx';
import { PrivacyPage } from './guest/Privacy.jsx';
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
  const search = new URLSearchParams(window.location.search);
  const language = search.get('lang');
  const lang = language === 'en' ? 'en' : 'de';
  // A preview link from the admin area opens the page outside the feedback window.
  const parameters = new URLSearchParams();
  if (language) parameters.set('lang', language);
  if (search.get('preview')) parameters.set('preview', search.get('preview'));
  const suffix = parameters.toString() ? `?${parameters}` : '';
  const path = mode === 'event' ? `/public/e/${identifier}${suffix}` : `/public/f/${identifier}${source ? `/${source}` : ''}${suffix}`;
  const { loading, data, error } = useAsync(() => api(path), [path]);

  if (loading) {
    return <GuestScreen lang={lang} loading>
      <p>{lang === 'en' ? 'Loading the feedback form …' : 'Feedbackformular wird geladen …'}</p>
    </GuestScreen>;
  }
  // Before a round starts the page shows what it will ask about.
  if (data?.status === 'waiting') {
    const organization = data.event?.organization || data.organization;
    // Der Abend, auf den gewartet wird, stellt sein Plakat über die ganze Seite.
    const lead = data.event || (data.upcoming || [])[0] || null;
    const poster = eventImage(data.event, organization) || eventImage(lead, organization) || null;
    return <GuestStage brandColor={organization?.primaryColor} lang={lang}>
      <div className="guest-frame">
        <WaitingScreen
      organization={data.event?.organization || data.organization}
      event={data.event}
      poster={poster}
      texts={data.texts}
      upcoming={data.upcoming || []}
      opensAt={data.feedback?.opensAt}
      lang={lang}
      credit={data.event?.credit || data.organization?.credit || null}
      />
      </div>
    </GuestStage>;
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
  return <FeedbackFlow event={data.event} texts={data.texts} upcoming={data.upcoming || []} sourceType={source || mode} lang={lang} preview={Boolean(data.preview)} />;
}

// The page that says what happens with the data of a guest.
function PublicPrivacy({ slug }) {
  const { loading, data, error } = useAsync(() => api(`/public/privacy/${slug}`), [slug]);
  const lang = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'de';

  if (loading) {
    return <GuestScreen lang={lang} loading>
      <p>Datenschutzhinweise werden geladen …</p>
    </GuestScreen>;
  }
  if (error || data?.status !== 'ok') {
    const message = error?.body?.message || error?.message
      || 'Zu dieser Adresse gibt es keine Datenschutzseite. Prüfe den Link oder den QR-Code.';
    return <GuestScreen lang={lang}>
      <h1>Diese Seite gibt es nicht.</h1>
      <p>{message}</p>
    </GuestScreen>;
  }
  return <GuestStage brandColor={data.organization?.primaryColor} lang={lang}>
    <div className="guest-frame">
      <PrivacyPage page={data} credit={data.credit || null} />
    </div>
  </GuestStage>;
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
  if (path.startsWith('/datenschutz/')) return <PublicPrivacy slug={path.split('/')[2]} />;
  if (path.startsWith('/e/')) return <PublicFeedback mode="event" identifier={path.split('/')[2]} source={new URLSearchParams(window.location.search).get('source')} />;
  if (path.startsWith('/f/')) {
    const parts = path.split('/').filter(Boolean);
    return <PublicFeedback mode="dynamic" identifier={parts[1]} source={parts[2] || new URLSearchParams(window.location.search).get('source')} />;
  }
  return <React.Suspense fallback={null}><SiteApp /></React.Suspense>;
}
