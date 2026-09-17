import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  ChartColumn,
  QrCode as QrIcon,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star
} from 'lucide-react';
import { assetUrl } from '../lib/api.js';
import { AccessBanner, QrCode, cx, splitPrice, useReveal } from './siteKit.jsx';

const u = (value) => `calc(${value} * var(--u))`;

const stepTones = ['sun', 'berry', 'leaf'];
const featureTones = ['sun', 'berry', 'leaf', 'leaf', 'sun', 'berry'];
const planTones = { free: 'leaf', pro: 'berry', business: 'sun' };

// Features keep their icon when admins reorder or rename them.
const featureIcons = [
  [/qr|code/i, QrIcon],
  [/handy|mobil|smartphone|gästeseite|gaesteseite/i, Smartphone],
  [/alarm|benachrichtig|kritik|enttäusch|low-rating/i, BellRing],
  [/pretix|kalender/i, CalendarCheck],
  [/auswert|export|report|statistik|dashboard/i, ChartColumn],
  [/datenschutz|sicher|dsgvo|privacy/i, ShieldCheck]
];

function featureIcon(feature) {
  const match = featureIcons.find(([pattern]) => pattern.test(feature.title))
    || featureIcons.find(([pattern]) => pattern.test(feature.text));
  return match ? match[1] : Sparkles;
}

function imageUrl(url) {
  if (!url) return null;
  return url.startsWith('/storage') ? assetUrl(url) : url;
}

export default function Landing({ site, links }) {
  useReveal();
  return <>
    <Hero site={site} links={links} />
    <Steps site={site} />
    <Features site={site} />
    <Pricing site={site} links={links} />
    <Faq site={site} />
    <AccessBanner site={site} links={links} />
  </>;
}

function Hero({ site, links }) {
  return <section className="site-hero" aria-labelledby="hero-title">
    <div className="site-container relative">
      <div className="hero-copy">
        {site.eyebrow && <p className="hero-eyebrow hero-in">
          <span className="hero-eyebrow-band weave weave--berry" aria-hidden="true" />
          {site.eyebrow}
        </p>}
        <h1 id="hero-title" className="site-h1 hero-in" style={{ '--delay': '70ms' }}>{site.headline}</h1>
        <p className="hero-lead hero-in" style={{ '--delay': '150ms' }}>{site.subheadline}</p>
        <div className="hero-actions hero-in" style={{ '--delay': '230ms' }}>
          <a className="btn btn-berry btn-lg" href={links.primary}>
            {site.primaryCtaLabel}
            <ArrowRight className="btn-arrow" size={21} strokeWidth={2.4} aria-hidden="true" />
          </a>
          {site.secondaryCtaLabel && <a className="btn btn-outline btn-lg" href={links.guest}>{site.secondaryCtaLabel}</a>}
        </div>
        {site.trustText && <p className="hero-trust hero-in" style={{ '--delay': '310ms' }}>
          <Star size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          {site.trustText}
        </p>}
      </div>
      <HeroStage guestUrl={links.guest} guestLabel={site.secondaryCtaLabel} image={imageUrl(site.heroImageUrl)} />
    </div>
  </section>;
}

function HeroStage({ guestUrl, guestLabel, image }) {
  const stage = useRef(null);
  const [paused, setPaused] = useState(false);

  // The bands only move while they are on screen.
  useEffect(() => {
    if (!stage.current || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  return <div className="hero-stage-wrap">
    <div ref={stage} className={cx('hero-stage', paused && 'is-paused')}>
      {image && <figure
        className="stage-photo stage-pop"
        style={{ left: u(420), top: u(40), width: u(260), height: u(190), '--rot': '7deg', '--delay': '820ms' }}
        aria-hidden="true"
      >
        <img src={image} alt="" loading="eager" decoding="async" />
      </figure>}
      <Band tone="leaf" left={80} top={120} height={76} rotate={-16} size={20} delay={100} speed={52}
        words={['Scannen', 'Bewerten', 'Gehört werden']} />
      <Band tone="sun" left={20} top={430} height={76} rotate={9} size={20} delay={220} speed={70} reverse
        words={['qrat.ing', 'Nordlicht Open Air', 'Einlass']} />
      <Band tone="berry" left={40} top={270} height={84} rotate={-3} size={22} delay={340} speed={60}
        words={['Wie war dein Abend?']} />
      <a
        className="qr-card stage-pop"
        href={guestUrl}
        aria-label={guestLabel || 'Gästeseite ansehen'}
        style={{ left: u(120), top: u(196), '--rot': '-3deg', '--delay': '560ms' }}
      >
        <QrCode value={guestUrl} className="qr-code" />
        <span className="qr-label"><ScanLine size={15} strokeWidth={2.6} aria-hidden="true" />Scan mich</span>
      </a>
      <span className="sticker sticker--ink stage-float" aria-hidden="true"
        style={{ left: u(360), top: u(560), width: u(132), height: u(132), '--rot': '12deg', '--delay': '720ms', '--float': '6.5s' }}>
        Direkt im<br />Handy-Browser
      </span>
      <span className="sticker sticker--sun stage-float" aria-hidden="true"
        style={{ left: u(200), top: u(640), width: u(104), height: u(104), '--rot': '-10deg', '--delay': '820ms', '--float': '7.8s' }}>
        DE · EN
      </span>
      <span className="sticker sticker--line stage-float" aria-hidden="true"
        style={{ left: u(510), top: u(690), width: u(116), height: u(116), '--rot': '-6deg', '--delay': '920ms', '--float': '8.6s' }}>
        Mit<br />Pretix
      </span>
    </div>
  </div>;
}

function Band({ tone, left, top, height, rotate, size, delay, speed, reverse = false, words }) {
  const group = (hidden) => <span className="band-group" aria-hidden={hidden || undefined}>
    {[0, 1, 2, 3].map((round) => words.map((word) => <React.Fragment key={`${round}-${word}`}>
      <span>{word}</span>
      <svg className="band-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 1.5l2.4 8.1 8.1 2.4-8.1 2.4-2.4 8.1-2.4-8.1-8.1-2.4 8.1-2.4z" fill="currentColor" />
      </svg>
    </React.Fragment>))}
  </span>;
  return <div
    className={cx('band-strip stage-band stitched weave', `weave--${tone}`)}
    aria-hidden="true"
    style={{
      left: u(left),
      top: u(top),
      width: u(1100),
      height: u(height),
      fontSize: u(size),
      '--rot': `${rotate}deg`,
      '--delay': `${delay}ms`,
      '--speed': `${speed}s`
    }}
  >
    <span className={cx('band-track', reverse && 'is-reverse')}>
      {group(false)}
      {group(true)}
    </span>
  </div>;
}

function Steps({ site }) {
  if (!site.steps?.length) return null;
  return <section id="ablauf" className="site-section site-section--first" aria-labelledby="ablauf-title">
    <div className="site-container">
      <h2 id="ablauf-title" className="site-h2 reveal">{site.stepsHeadline}</h2>
      <ol className="card-list steps-grid">
        {site.steps.map((step, index) => <li key={index} className="reveal" style={{ '--delay': `${index * 90}ms` }}>
          <article className={cx('step-card', `step-card--${stepTones[index % stepTones.length]}`)}>
            <span className="step-number" aria-hidden="true">{index + 1}</span>
            <div className="step-copy">
              <h3 className="step-title">{step.title}</h3>
              <p className="step-text">{step.text}</p>
            </div>
          </article>
        </li>)}
      </ol>
    </div>
  </section>;
}

function Features({ site }) {
  if (!site.features?.length) return null;
  return <section id="funktionen" className="site-section" aria-labelledby="funktionen-title">
    <div className="site-container">
      <h2 id="funktionen-title" className="site-h2 max-w-[820px] reveal">{site.featuresHeadline}</h2>
      <ul className="card-list features-grid">
        {site.features.map((feature, index) => {
          const Icon = featureIcon(feature);
          return <li key={index} className="reveal" style={{ '--delay': `${(index % 3) * 80}ms` }}>
            <article className={cx('feature-card', index % 6 === 5 && 'is-dark')}>
              <span className={cx('feature-band weave', `weave--${featureTones[index % featureTones.length]}`)} aria-hidden="true" />
              <div className="feature-body">
                <Icon className="feature-icon" size={32} strokeWidth={2} aria-hidden="true" />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </article>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}

function Pricing({ site, links }) {
  const plans = site.pricing || [];
  if (!plans.length) return null;
  return <section id="preise" className="site-section" aria-labelledby="preise-title">
    <div className="site-container">
      <div className="section-head reveal">
        <h2 id="preise-title" className="site-h2">{site.pricingHeadline}</h2>
        {site.pricingNote && <p className="section-note">{site.pricingNote}</p>}
      </div>
      <ul className="card-list pricing-grid">
        {plans.map((plan, index) => {
          const tone = planTones[plan.plan] || stepTones[(index + 2) % stepTones.length];
          const { amount, per } = splitPrice(plan.price);
          return <li key={plan.plan || index} className="reveal" style={{ '--delay': `${index * 90}ms` }}>
            <article className={cx('plan-card', plan.highlight && 'is-highlight')}>
              <div className={cx('plan-head stitched weave', `weave--${tone}`)}>
                <h3>{plan.name}</h3>
                {plan.highlight && <span className="plan-badge">Empfohlen</span>}
              </div>
              <div className="plan-body">
                <p className="plan-price">
                  <span className={cx('plan-amount', amount.length > 8 && 'is-long')}>{amount}</span>
                  {per && <span className="plan-per">{per}</span>}
                </p>
                {plan.text && <p className="plan-summary">{plan.text}</p>}
                {plan.features?.length > 0 && <ul className="plan-features">
                  {plan.features.map((feature, featureIndex) => <li key={featureIndex}>
                    <span className={cx('plan-bullet weave', `weave--${tone}`)} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>)}
                </ul>}
                <a className={cx('btn plan-cta', plan.highlight ? 'btn-berry' : 'btn-outline')} href={links.plan(plan)}>
                  {plan.ctaLabel || `${plan.name} anfragen`}
                </a>
              </div>
            </article>
          </li>;
        })}
      </ul>
      <p className="pricing-foot reveal">
        Anfragen gehen per E-Mail an <a className="text-link" href={`mailto:${links.email}`}>{links.email}</a>.
      </p>
    </div>
  </section>;
}

function Faq({ site }) {
  const items = site.faq || [];
  if (!items.length) return null;
  const shown = items.slice(0, 6);
  return <section id="fragen" className="site-section" aria-labelledby="fragen-title">
    <div className="site-container">
      <h2 id="fragen-title" className="site-h2 reveal">{site.faqHeadline}</h2>
      <div className="faq-grid">
        {shown.map((item, index) => <article key={index} className="faq-card reveal" style={{ '--delay': `${(index % 2) * 80}ms` }}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </article>)}
      </div>
      {items.length > shown.length && <p className="mt-8 reveal">
        <a className="text-link" href="/faq">Alle {items.length} Fragen ansehen</a>
      </p>}
    </div>
  </section>;
}
