import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Pencil, Plus, Send, Star } from 'lucide-react';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/paytone-one';
import './guest.css';
import { API_BASE, api, assetUrl } from '../lib/api.js';
import { guestPalette, paletteStyle } from './colors.js';
import { useGuestTheme } from './theme.js';
import { ThemeContext, ThemeSwitch } from './ThemeSwitch.jsx';
import { ProductCredit } from '../lib/credit.jsx';
import { UpcomingList } from './Upcoming.jsx';
import {
  answerText,
  buildPayload,
  buildSteps,
  progressPayload,
  sessionKeyFor,
  choiceTypes,
  clearDraft,
  emptyAnswers,
  fillText,
  firstProblem,
  formatDay,
  hasValue,
  isAnswered,
  isRequired,
  loadDraft,
  nextStepId,
  noValue,
  questionOptions,
  questionType,
  saveDraft,
  stepProblem,
  yesValue
} from './flow.js';

// Pauses after a tap, so guests see their answer before the next question appears.
const ratingPause = 900;
const choicePause = 420;

// Pages with their own top bar say so and place the switch in it themselves.
export function GuestStage({ brandColor, imageUrl = null, lang = 'de', ownSwitch = false, children }) {
  const { choice, theme, cycle } = useGuestTheme();
  const palette = useMemo(() => guestPalette(brandColor, theme), [brandColor, theme]);
  return <ThemeContext.Provider value={{ choice, cycle, lang }}>
    <div className="guest" data-theme={theme} lang={lang} style={paletteStyle(palette)}>
      <div className={`guest-backdrop${imageUrl ? ' has-image' : ''}`} aria-hidden="true">
        {imageUrl
          ? <img src={imageUrl} alt="" />
          : <><span className="guest-light guest-light--a" /><span className="guest-light guest-light--b" /></>}
      </div>
      {ownSwitch ? null : <ThemeSwitch />}
      {children}
    </div>
  </ThemeContext.Provider>;
}

export function GuestScreen({ brandColor, imageUrl, lang, loading = false, children }) {
  return <GuestStage brandColor={brandColor} imageUrl={imageUrl} lang={lang}>
    <main className="guest-screen" aria-busy={loading || undefined}>
      {loading && <div className="guest-loader" aria-hidden="true">{[0, 1, 2].map((item) => <Star key={item} />)}</div>}
      {children}
    </main>
  </GuestStage>;
}

// A preview opens the page outside the feedback round; nothing a visitor does here is stored.
function PreviewBanner({ preview, texts }) {
  if (!preview) return null;
  return <p className="guest-preview" role="status">{texts.preview_hint}</p>;
}

// The public payload falls back to the organizer logo when an event has no picture of its own.
export function eventImage(event, organization = null) {
  const url = event?.imageUrl;
  const logo = event?.organization?.logoUrl || organization?.logoUrl || null;
  if (!url || url === logo) return null;
  return assetUrl(url);
}

export function FeedbackFlow({ event, texts, sourceType, lang = 'de', preview = false, upcoming = [] }) {
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const questions = useMemo(() => event.questions || [], [event.questions]);
  const [draft] = useState(() => loadDraft(event.token));
  const [state, setState] = useState(() => draft?.state || emptyAnswers());
  const [stepId, setStepId] = useState(() => draft?.stepId || 'rating');
  const [direction, setDirection] = useState('forward');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState(null);
  const [locked, setLocked] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [startedAt] = useState(() => draft?.startedAt || new Date().toISOString());
  const [honeypot, setHoneypot] = useState('');
  const [sessionKey] = useState(() => (preview ? null : sessionKeyFor(event.token)));
  const reported = useRef('');
  const timer = useRef(null);
  const depth = useRef(0);
  const heading = useRef(null);
  const firstRender = useRef(true);
  const advanceRef = useRef(null);
  const position = useRef({ steps: [], index: 0 });

  const steps = useMemo(() => buildSteps(questions, state.rating), [questions, state.rating]);
  const found = steps.findIndex((item) => item.id === stepId);
  const index = found === -1 ? 0 : found;
  const step = steps[index];
  position.current = { steps, index, state };

  const brandColor = event.organization?.primaryColor;
  const image = eventImage(event);
  const logo = event.organization?.logoUrl ? assetUrl(event.organization.logoUrl) : null;
  const privacyText = event.organization?.privacyText || texts.privacy_short;
  // The page that explains what happens with the data of a guest.
  const privacyUrl = event.organization?.slug ? `/datenschutz/${event.organization.slug}` : null;
  const footerText = event.organization?.footerText;

  useEffect(() => {
    document.title = `${event.name} · Feedback`;
  }, [event.name]);

  // Every step is a history entry, so the back gesture of the phone returns to the previous question.
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), qratingStep: stepId, qratingDepth: 0 }, '');
    function onPopState(popEvent) {
      const target = popEvent.state?.qratingStep;
      if (typeof target !== 'string') return;
      depth.current = Number(popEvent.state?.qratingDepth) || 0;
      const { steps: currentSteps, index: currentIndex } = position.current;
      const targetIndex = currentSteps.findIndex((item) => item.id === target);
      clearTimeout(timer.current);
      setLocked(false);
      setProblem(null);
      setDirection(targetIndex !== -1 && targetIndex < currentIndex ? 'back' : 'forward');
      setStepId(target);
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (step.kind === 'summary') setEditing(false);
  }, [step.kind]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [step.id, done]);

  useEffect(() => {
    if (!done) saveDraft(event.token, { state, stepId: step.id, startedAt });
  }, [event.token, state, step.id, startedAt, done]);

  // Every step travels to the server once, so the admin area sees how far guests get
  // and what they had already answered by then.
  useEffect(() => {
    if (preview || !sessionKey || done) return;
    const payload = progressPayload({ steps, index, sessionKey, sourceType, texts, state, questions });
    const mark = `${payload.step}:${payload.stepIndex}`;
    if (reported.current === mark) return;
    reported.current = mark;
    api(`/public/events/${event.token}/progress`, { method: 'POST', body: JSON.stringify(payload) }).catch(() => {
      // A visit that nobody counts still gets its feedback through.
    });
    // `state` stays out of the dependencies on purpose: one report per step, and the
    // answer of the step a guest stops on travels with the farewell below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.token, index, steps, sessionKey, sourceType, texts, preview, done]);

  // Wer weggeht, hat den Schritt, auf dem Schluss ist, meist schon ausgefüllt.
  // Beim Verlassen geht der Stand deshalb noch einmal raus, sonst fehlt genau die
  // Antwort, an der die Bewertung abgebrochen wurde.
  useEffect(() => {
    if (preview || !sessionKey || done) return undefined;
    function farewell() {
      const { steps: currentSteps, index: currentIndex, state: given } = position.current;
      const payload = progressPayload({
        steps: currentSteps, index: currentIndex, sessionKey, sourceType, texts, state: given, questions
      });
      if (!payload.draft) return;
      const address = `${API_BASE}/public/events/${event.token}/progress`;
      const body = JSON.stringify(payload);
      // sendBeacon übersteht das Schliessen der Seite; keepalive ist der Rückfall.
      const sent = navigator.sendBeacon?.(address, new Blob([body], { type: 'application/json' }));
      if (sent) return;
      fetch(address, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
    function onHidden() {
      if (document.visibilityState === 'hidden') farewell();
    }
    window.addEventListener('pagehide', farewell);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', farewell);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [event.token, sessionKey, sourceType, texts, questions, preview, done]);

  function goTo(id, nextDirection = 'forward') {
    clearTimeout(timer.current);
    setLocked(false);
    setProblem(null);
    setDirection(nextDirection);
    depth.current += 1;
    window.history.pushState({ qratingStep: id, qratingDepth: depth.current }, '');
    setStepId(id);
  }

  function goBack() {
    if (index === 0) return;
    if (depth.current > 0) {
      window.history.back();
      return;
    }
    // Restored from a draft: there is no earlier history entry of this flow.
    const previous = steps[index - 1].id;
    clearTimeout(timer.current);
    setLocked(false);
    setProblem(null);
    setDirection('back');
    window.history.replaceState({ qratingStep: previous, qratingDepth: 0 }, '');
    setStepId(previous);
  }

  function advance() {
    const issue = stepProblem(step, state);
    if (issue) {
      setLocked(false);
      setProblem(issue);
      return;
    }
    goTo(nextStepId(steps, step.id, { editing, rating: state.rating }));
  }
  advanceRef.current = advance;

  function advanceSoon(pause) {
    setLocked(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => advanceRef.current(), pause);
  }

  function update(patch) {
    setState((current) => ({ ...current, ...patch }));
    setProblem(null);
  }

  function setAnswer(question, value) {
    setState((current) => ({ ...current, answers: { ...current.answers, [question.internal_name]: value } }));
    setProblem(null);
  }

  function chooseRating(value) {
    if (locked) return;
    update({ rating: value });
    advanceSoon(ratingPause);
  }

  function chooseAnswer(question, value) {
    if (locked) return;
    setAnswer(question, value);
    advanceSoon(choicePause);
  }

  function chooseNewsletter(value) {
    if (locked) return;
    update({ newsletter: value });
    setFocusEmail(value);
    if (!value) advanceSoon(choicePause);
  }

  function edit(id) {
    setEditing(true);
    goTo(id);
  }

  function onEnter(keyEvent) {
    if (keyEvent.key !== 'Enter' || keyEvent.nativeEvent.isComposing) return;
    keyEvent.preventDefault();
    advance();
  }

  async function submit() {
    if (sending) return;
    const blocker = firstProblem(steps, state);
    if (blocker) {
      edit(blocker.step.id);
      setProblem(blocker.problem);
      return;
    }
    // A preview shows the thank-you page without storing anything.
    if (preview) {
      clearDraft(event.token);
      setDone(true);
      return;
    }
    setSending(true);
    setSubmitError('');
    try {
      await api(`/public/events/${event.token}/feedback`, {
        method: 'POST',
        body: JSON.stringify(buildPayload(state, { questions, sourceType, startedAt, honeypot, language: lang, sessionKey }))
      });
      clearDraft(event.token);
      setDone(true);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return <GuestStage brandColor={brandColor} imageUrl={image} lang={lang}>
      <div className="guest-frame">
        <PreviewBanner preview={preview} texts={texts} />
        <section className="guest-step guest-thanks" aria-labelledby="guest-thanks-title">
          <Ticket event={event} locale={locale} logo={logo} stamp={texts.stamp_label}>
            <div className="guest-ticket-rating">
              <MiniStars value={state.rating} label={fillText(texts.stars_value, { wert: state.rating })} />
            </div>
          </Ticket>
          <h1 id="guest-thanks-title" ref={heading} tabIndex={-1} className="guest-thanks-title">{texts.thank_headline}</h1>
          <p className="guest-help">{texts.thank_text}</p>
          <UpcomingList items={upcoming} locale={locale} headline={texts.upcoming_headline || 'Als Nächstes'} shopLabel={texts.upcoming_shop_label || 'Tickets'} />
          {footerText && <p className="guest-fine">{footerText}</p>}
          <ProductCredit credit={event.credit} />
        </section>
      </div>
    </GuestStage>;
  }

  const title = (text) => <h1 id="guest-step-title" ref={heading} tabIndex={-1} className="guest-question">{text}</h1>;
  const total = steps.length - 1;
  const onSummary = step.kind === 'summary';
  const answered = isAnswered(step, state);
  const required = isRequired(step);
  const tapStep = step.kind === 'rating'
    || (step.kind === 'question' && choiceTypes.has(questionType(step.question)))
    || (step.kind === 'newsletter' && state.newsletter !== true);

  let action = null;
  if (onSummary) {
    action = <button type="button" className="guest-primary" onClick={submit} disabled={sending}>
      <span>{sending ? texts.sending_label : texts.submit}</span>
      {!sending && <Send size={20} aria-hidden="true" />}
    </button>;
  } else if (tapStep) {
    if (answered) {
      action = <button type="button" className="guest-primary" onClick={advance} disabled={locked}>
        <span>{texts.next_label}</span><ArrowRight size={20} aria-hidden="true" />
      </button>;
    } else if (!required) {
      action = <button type="button" className="guest-quiet" onClick={advance}>{texts.skip_label}</button>;
    }
  } else if (answered || required) {
    action = <button type="button" className="guest-primary" onClick={advance}>
      <span>{texts.next_label}</span><ArrowRight size={20} aria-hidden="true" />
    </button>;
  } else {
    action = <button type="button" className="guest-quiet guest-quiet--boxed" onClick={advance}>{texts.skip_label}</button>;
  }

  let content = null;
  if (step.kind === 'rating') {
    content = <RatingStep event={event} texts={texts} image={image} locale={locale} rating={state.rating} onChoose={chooseRating} title={title} />;
  } else if (step.kind === 'contact') {
    content = <>
      {title(texts.low_rating_contact_headline)}
      <p className="guest-help">{texts.low_rating_contact_text}</p>
      <label className="guest-field">
        <span>{texts.low_rating_phone_label}</span>
        <input className="guest-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={80}
          placeholder={texts.low_rating_phone_placeholder} value={state.contactPhone}
          onChange={(changeEvent) => update({ contactPhone: changeEvent.target.value })} onKeyDown={onEnter} />
      </label>
      <label className="guest-field">
        <span>{texts.low_rating_note_label}</span>
        <textarea className="guest-input guest-textarea guest-textarea--small" maxLength={500}
          placeholder={texts.low_rating_note_placeholder} value={state.contactNote}
          onChange={(changeEvent) => update({ contactNote: changeEvent.target.value })} />
      </label>
    </>;
  } else if (step.kind === 'question') {
    content = <QuestionStep step={step} state={state} texts={texts} title={title}
      onAnswer={setAnswer} onChoose={chooseAnswer} onUpdate={update} onEnter={onEnter} />;
  } else if (step.kind === 'comment') {
    const positive = step.field === 'commentPositive';
    content = <>
      {title(positive ? texts.positive_label : texts.improvement_label)}
      <textarea className="guest-input guest-textarea" maxLength={3000} aria-labelledby="guest-step-title"
        placeholder={positive ? texts.positive_placeholder : texts.improvement_placeholder}
        value={state[step.field]} onChange={(changeEvent) => update({ [step.field]: changeEvent.target.value })} />
    </>;
  } else if (step.kind === 'newsletter') {
    content = <>
      {title(texts.newsletter_question)}
      {texts.newsletter_help && <p className="guest-help">{texts.newsletter_help}</p>}
      <div className="guest-choices guest-choices--pair" role="group" aria-labelledby="guest-step-title">
        <Choice selected={state.newsletter === true} onClick={() => chooseNewsletter(true)}>{texts.newsletter_yes}</Choice>
        <Choice selected={state.newsletter === false} onClick={() => chooseNewsletter(false)}>{texts.newsletter_no}</Choice>
      </div>
      {state.newsletter === true && <div className="guest-optin">
        <p className="guest-consent"><Check size={18} strokeWidth={2.6} aria-hidden="true" /><span>{texts.newsletter_label}</span></p>
        <label className="guest-field">
          <span>{texts.newsletter_email_label}</span>
          <input className="guest-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
            spellCheck={false} maxLength={254} autoFocus={focusEmail} value={state.newsletterEmail}
            onChange={(changeEvent) => update({ newsletterEmail: changeEvent.target.value })} onKeyDown={onEnter} />
        </label>
        <p className="guest-fine">
          {texts.newsletter_privacy_note}
          {privacyUrl && <>{' '}<a className="guest-fine-link" href={privacyUrl} target="_blank" rel="noreferrer">{texts.newsletter_privacy_link}</a></>}
        </p>
        {privacyText && <p className="guest-fine">{privacyText}</p>}
      </div>}
    </>;
  } else {
    const stub = [privacyText, footerText, event.credit].filter(Boolean);
    content = <>
      {title(texts.summary_headline)}
      <p className="guest-help">{texts.summary_text}</p>
      <Ticket event={event} locale={locale} logo={logo} stub={stub}>
        <ul className="guest-rows">
          {steps.filter((item) => item.kind !== 'summary').map((item) => (
            <li key={item.id}><SummaryRow step={item} state={state} texts={texts} lang={lang} onEdit={() => edit(item.id)} /></li>
          ))}
        </ul>
      </Ticket>
      <input className="hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true"
        value={honeypot} onChange={(changeEvent) => setHoneypot(changeEvent.target.value)} />
    </>;
  }

  return <GuestStage brandColor={brandColor} imageUrl={image} lang={lang} ownSwitch>
    <div className="guest-frame">
      <PreviewBanner preview={preview} texts={texts} />
      <header className="guest-top">
        <div className="guest-progress" aria-hidden="true">
          {steps.slice(0, total).map((item, itemIndex) => (
            <span key={item.id} className={onSummary || itemIndex < index ? 'is-done' : itemIndex === index ? 'is-current' : undefined}><i /></span>
          ))}
        </div>
        <div className="guest-bar">
          <button type="button" className="guest-back" onClick={goBack} disabled={index === 0} aria-label={texts.back_label}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <p className="guest-title">{event.name}</p>
          <p className="guest-count" aria-hidden="true">{onSummary ? <Check size={18} strokeWidth={2.6} /> : `${index + 1}/${total}`}</p>
          <ThemeSwitch className="guest-bar-theme" />
        </div>
        <p className="sr-only" aria-live="polite">
          {onSummary ? texts.summary_headline : fillText(texts.progress_label, { nummer: index + 1, gesamt: total })}
        </p>
      </header>
      <section key={step.id} className={`guest-step guest-step--${step.kind}${step.kind === 'rating' && !image ? ' guest-step--center' : ''}`}
        data-dir={direction} aria-labelledby="guest-step-title">
        {content}
        {problem && <p className="guest-problem" role="alert">{texts[problem]}</p>}
        {onSummary && submitError && <p className="guest-problem" role="alert">{submitError}</p>}
        <div className="guest-actions">{action}</div>
      </section>
    </div>
  </GuestStage>;
}

function RatingStep({ event, texts, image, locale, rating, onChoose, title }) {
  const [preview, setPreview] = useState(0);
  const meta = [formatDay(event.dateFrom, locale), event.location].filter(Boolean).join(' · ');
  return <>
    {image && <figure className="guest-poster">
      <img src={image} alt={event.imageAlt || ''} fetchpriority="high" />
    </figure>}
    {meta && <p className="guest-meta">{meta}</p>}
    {title(texts.headline)}
    {texts.subtitle && <p className="guest-help">{texts.subtitle}</p>}
    <div className="guest-rating guest-rating--hero">
      <span className="guest-spot" style={{ '--level': preview || rating }} aria-hidden="true" />
      <StarButtons value={rating} label={texts.rating_label} texts={texts} onChoose={onChoose} onPreview={setPreview} />
      <p className="guest-reaction" aria-live="polite">
        {rating ? <span key={rating}>{texts[`rating_reaction_${rating}`]}</span> : null}
      </p>
    </div>
  </>;
}

function StarButtons({ value, label, texts, onChoose, onPreview, size = 'hero' }) {
  const [hover, setHover] = useState(0);
  function preview(next) {
    setHover(next);
    onPreview?.(next);
  }
  return <div className={`guest-stars guest-stars--${size}`} role="group" aria-label={label} onPointerLeave={() => preview(0)}>
    {[1, 2, 3, 4, 5].map((star) => {
      const on = star <= value;
      const hinted = !on && star <= hover;
      return <button key={star} type="button" style={{ '--i': star }}
        className={`guest-star${on ? ' is-on' : ''}${hinted ? ' is-hint' : ''}`}
        aria-pressed={star === value}
        aria-label={fillText(texts.stars_value, { wert: star })}
        onPointerEnter={(pointerEvent) => pointerEvent.pointerType === 'mouse' && preview(star)}
        onClick={() => onChoose(star)}>
        {/* A new key replays the pop animation of the filled stars. */}
        <Star key={on ? `on-${value}` : 'off'} aria-hidden="true" strokeWidth={1.7} />
      </button>;
    })}
  </div>;
}

function MiniStars({ value, label }) {
  return <span className="guest-mini-stars" role="img" aria-label={label}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={star <= value ? 'is-on' : undefined} aria-hidden="true" strokeWidth={1.8} />)}
  </span>;
}

function QuestionStep({ step, state, texts, title, onAnswer, onChoose, onUpdate, onEnter }) {
  const { question } = step;
  const type = questionType(question);
  const value = state.answers[question.internal_name];
  const options = questionOptions(question);
  const hint = question.help_text || (type === 'checkboxes' ? texts.multi_hint : '');
  return <>
    {title(question.label)}
    {hint && <p className="guest-help">{hint}</p>}
    {type === 'rating' && <div className="guest-rating">
      <StarButtons size="inline" value={Number(value) || 0} label={question.label} texts={texts} onChoose={(star) => onChoose(question, star)} />
    </div>}
    {type === 'nps' && <NpsScale value={value} label={question.label} texts={texts} onChoose={(score) => onChoose(question, score)} />}
    {type === 'yes_no' && <div className="guest-choices guest-choices--pair" role="group" aria-labelledby="guest-step-title">
      <Choice selected={value === yesValue} onClick={() => onChoose(question, yesValue)}>{texts.yes_label}</Choice>
      <Choice selected={value === noValue} onClick={() => onChoose(question, noValue)}>{texts.no_label}</Choice>
    </div>}
    {type === 'multiple_choice' && <div className="guest-choices" role="group" aria-labelledby="guest-step-title">
      {options.map((option) => <Choice key={option} marker selected={value === option} onClick={() => onChoose(question, option)}>{option}</Choice>)}
    </div>}
    {type === 'checkboxes' && <Chips options={options} value={Array.isArray(value) ? value : []} onChange={(next) => onAnswer(question, next)} />}
    {step.detailField && <Detail field={step.detailField} value={state[step.detailField]} texts={texts} onUpdate={onUpdate} />}
    {type === 'text_short' && <input className="guest-input" maxLength={500} aria-labelledby="guest-step-title"
      placeholder={question.placeholder || ''} value={typeof value === 'string' ? value : ''}
      onChange={(changeEvent) => onAnswer(question, changeEvent.target.value)} onKeyDown={onEnter} />}
    {type === 'text_long' && <textarea className="guest-input guest-textarea" maxLength={3000} aria-labelledby="guest-step-title"
      placeholder={question.placeholder || ''} value={typeof value === 'string' ? value : ''}
      onChange={(changeEvent) => onAnswer(question, changeEvent.target.value)} />}
  </>;
}

function Choice({ selected, marker = false, onClick, children }) {
  return <button type="button" className={`guest-choice${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onClick}>
    <span className="guest-choice-label">{children}</span>
    {marker && <span className="guest-choice-mark" aria-hidden="true">{selected && <Check size={16} strokeWidth={3} />}</span>}
  </button>;
}

function Chips({ options, value, onChange }) {
  const selected = new Set(value);
  function toggle(option) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((item) => next.has(item)));
  }
  return <div className="guest-chips" role="group" aria-labelledby="guest-step-title">
    {options.map((option) => {
      const on = selected.has(option);
      return <button key={option} type="button" className="guest-chip" aria-pressed={on} onClick={() => toggle(option)}>
        {on && <Check size={17} strokeWidth={2.8} aria-hidden="true" />}
        <span>{option}</span>
      </button>;
    })}
  </div>;
}

function Detail({ field, value, texts, onUpdate }) {
  const [open, setOpen] = useState(() => hasValue(value));
  const [opened, setOpened] = useState(false);
  const positive = field === 'commentPositive';
  if (!open) {
    return <button type="button" className="guest-link" onClick={() => { setOpen(true); setOpened(true); }}>
      <Plus size={18} strokeWidth={2.6} aria-hidden="true" /><span>{texts.detail_label}</span>
    </button>;
  }
  return <label className="guest-field guest-detail">
    <span>{positive ? texts.positive_label : texts.improvement_label}</span>
    <textarea className="guest-input guest-textarea guest-textarea--small" maxLength={3000} autoFocus={opened}
      placeholder={positive ? texts.positive_placeholder : texts.improvement_placeholder}
      value={value} onChange={(changeEvent) => onUpdate({ [field]: changeEvent.target.value })} />
  </label>;
}

function NpsScale({ value, label, texts, onChoose }) {
  return <div className="guest-nps">
    <div className="guest-scale" role="group" aria-label={label}>
      {Array.from({ length: 11 }, (_, score) => (
        <button key={score} type="button" aria-pressed={value === score}
          aria-label={fillText(texts.nps_value, { wert: score })} onClick={() => onChoose(score)}>{score}</button>
      ))}
    </div>
    <div className="guest-scale-legend" aria-hidden="true"><span>{texts.nps_low_label}</span><span>{texts.nps_high_label}</span></div>
  </div>;
}

function Ticket({ event, locale, logo, stamp = '', stub = [], children }) {
  const meta = [formatDay(event.dateFrom, locale), event.location].filter(Boolean).join(' · ');
  return <div className={`guest-ticket${stamp ? ' is-stamped' : ''}`}>
    <div className="guest-ticket-head">
      <div className="guest-ticket-heading">
        <p className="guest-ticket-kicker">{event.organization?.name || 'Feedback'}</p>
        <p className="guest-ticket-title">{event.name}</p>
        {meta && <p className="guest-ticket-meta">{meta}</p>}
      </div>
      {logo && <img className="guest-ticket-logo" src={logo} alt="" />}
    </div>
    {children}
    {stub.length > 0 && <div className="guest-ticket-stub">{stub.map((line) => <p key={line}>{line}</p>)}</div>}
    {stamp && <div className="guest-stamp" aria-hidden="true"><span>{stamp}</span></div>}
  </div>;
}

function SummaryRow({ step, state, texts, lang, onEdit }) {
  let label = '';
  let value = null;
  let detail = '';
  if (step.kind === 'rating') {
    label = texts.summary_rating_label;
    if (state.rating) value = <MiniStars value={state.rating} label={fillText(texts.stars_value, { wert: state.rating })} />;
  } else if (step.kind === 'contact') {
    label = texts.summary_contact_label;
    value = [state.contactPhone.trim(), state.contactNote.trim()].filter(Boolean).join(' · ') || null;
  } else if (step.kind === 'question') {
    const answer = state.answers[step.question.internal_name];
    label = step.question.label;
    if (questionType(step.question) === 'rating' && hasValue(answer)) {
      value = <MiniStars value={Number(answer)} label={answerText(step.question, answer, texts)} />;
    } else {
      value = answerText(step.question, answer, texts) || null;
    }
    if (step.detailField) detail = state[step.detailField].trim();
  } else if (step.kind === 'comment') {
    label = step.field === 'commentPositive' ? texts.positive_label : texts.improvement_label;
    value = state[step.field].trim() || null;
  } else if (step.kind === 'newsletter') {
    label = texts.summary_newsletter_label;
    if (state.newsletter === true) value = [texts.newsletter_yes, state.newsletterEmail.trim()].filter(Boolean).join(': ');
    if (state.newsletter === false) value = texts.newsletter_no;
  }
  const empty = value === null && !detail;
  const quoted = lang === 'en' ? `“${detail}”` : `„${detail}“`;
  return <button type="button" className="guest-row" onClick={onEdit}>
    <span className="guest-row-label">{label}</span>
    {empty
      ? <span className="guest-row-value is-empty">{texts.summary_skipped}</span>
      : value !== null && <span className="guest-row-value">{value}</span>}
    {detail && <span className="guest-row-detail">{quoted}</span>}
    <span className="guest-row-edit"><Pencil size={15} aria-hidden="true" /><span className="sr-only">{texts.edit_label}</span></span>
  </button>;
}
