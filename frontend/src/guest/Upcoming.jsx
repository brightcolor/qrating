import React from 'react';
import { Star } from 'lucide-react';
import { formatDay } from './flow.js';

// Day and month as a small calendar tile, next to name and place.
function dayParts(value, locale) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: '–', month: '' };
  return {
    day: new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).replace('.', '')
  };
}

function timeAndPlace(item, locale) {
  const date = item.dateFrom ? new Date(item.dateFrom) : null;
  const time = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
    : null;
  return [time, item.location].filter(Boolean).join(' · ');
}

// The stars of a round that has not started: they show what will be asked here.
export function QuietStars({ label }) {
  return <div className="guest-quiet-stars" role="img" aria-label={label}>
    {[1, 2, 3, 4, 5].map((value) => <Star key={value} aria-hidden="true" />)}
  </div>;
}

export function UpcomingList({ items = [], locale = 'de-DE', headline, shopLabel = 'Tickets' }) {
  if (!items.length) return null;
  return <section className="guest-upcoming" aria-label={headline || undefined}>
    {headline && <h2 className="guest-upcoming-title">{headline}</h2>}
    <ul className="guest-upcoming-list">
      {items.map((item) => {
        const parts = dayParts(item.dateFrom, locale);
        return <li key={item.id} className="guest-upcoming-row">
          <span className="guest-upcoming-date" aria-hidden="true"><b>{parts.day}</b><span>{parts.month}</span></span>
          <span className="guest-upcoming-text">
            <strong>{item.name}</strong>
            <span>{timeAndPlace(item, locale)}</span>
          </span>
          {item.shopUrl && <a className="guest-upcoming-link" href={item.shopUrl} target="_blank" rel="noreferrer">{shopLabel}</a>}
        </li>;
      })}
    </ul>
  </section>;
}

// The card of the event that comes next: name, date, quiet stars and the moment it opens.
function LeadEvent({ name, dateFrom, location, opensText, locale, texts }) {
  return <div className="guest-waiting-lead">
    <h2 className="guest-waiting-name">{name}</h2>
    <p className="guest-help">{[formatDay(dateFrom, locale, { withTime: true }), location].filter(Boolean).join(' · ')}</p>
    <QuietStars label={texts.rating_label || 'Bewertung'} />
    <p className="guest-waiting-hint">{opensText}</p>
  </div>;
}

// The page before a round starts: what will be rated here, and what comes after it.
export function WaitingScreen({ organization, event, texts = {}, upcoming = [], opensAt, lang = 'de', credit = null }) {
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const lead = event || upcoming[0] || null;
  const rest = event ? upcoming : upcoming.slice(1);
  const leadOpens = event ? opensAt : lead?.dateFrom;
  const opens = leadOpens ? new Date(leadOpens) : null;
  const opensText = opens && !Number.isNaN(opens.getTime())
    ? (texts.not_started_text || 'Sie startet am {datum}.').replaceAll('{datum}', formatDay(opens, locale, { withTime: true }))
    : texts.no_event_text || 'Schau gerne später noch einmal vorbei.';

  return <section className="guest-step guest-waiting">
    {organization?.name && <p className="guest-waiting-kicker">{organization.name}</p>}
    <h1 className="guest-question">{event ? event.name : (texts.upcoming_headline || 'Als Nächstes')}</h1>
    {event
      ? <>
        <p className="guest-help">{[formatDay(event.dateFrom, locale, { withTime: true }), event.location].filter(Boolean).join(' · ')}</p>
        <QuietStars label={texts.rating_label || 'Bewertung'} />
        <p className="guest-waiting-hint">{opensText}</p>
      </>
      : lead
        ? <LeadEvent
          name={lead.name}
          dateFrom={lead.dateFrom}
          location={lead.location}
          opensText={opensText}
          locale={locale}
          texts={texts}
        />
        : <p className="guest-help">{texts.upcoming_text || 'Sobald ein Event läuft, öffnet sich hier die Bewertung.'}</p>}
    <UpcomingList
      items={rest}
      locale={locale}
      headline={lead && !event ? (texts.upcoming_more_headline || 'Danach') : (texts.upcoming_headline || 'Als Nächstes')}
      shopLabel={texts.upcoming_shop_label || 'Tickets'}
    />
    {credit && <p className="guest-fine">{credit}</p>}
  </section>;
}
