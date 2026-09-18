import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BrightColorSign, brightColorUrl } from '../lib/credit.jsx';
import { encode } from 'uqr';
import { ArrowRight, Check, Copy, Mail } from 'lucide-react';

export const DEFAULT_CONTACT = 'kontakt@qrating.de';

export const NAV_ITEMS = [
  { id: 'ablauf', label: 'So geht’s' },
  { id: 'funktionen', label: 'Funktionen' },
  { id: 'preise', label: 'Preise' },
  { id: 'fragen', label: 'Fragen' }
];

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function mailtoUrl(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, '')}${path}`;
}

// Guest pages live on the feedback domain (qrat.ing), the website on its own domain.
export function guestPageUrl(target, feedbackAppUrl) {
  const base = feedbackAppUrl || window.location.origin;
  const value = String(target || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return joinUrl(base, value);
  return base;
}

// "29 € / Monat" -> { amount: "29 €", per: "pro Monat" }
export function splitPrice(label) {
  const [amount = '', ...rest] = String(label || '').split('/');
  const per = rest.join('/').trim();
  return {
    amount: amount.trim().replace(/\s*\bEUR\b/i, ' €').trim(),
    per: per && !/^(pro|je)\s/i.test(per) ? `pro ${per}` : per
  };
}

export function siteLinks({ content, adminAppUrl, feedbackAppUrl, onLanding }) {
  const brand = content.brand || 'qrating';
  const email = content.contactEmail || DEFAULT_CONTACT;
  const section = (id) => (onLanding ? `#${id}` : `/#${id}`);
  const primary = String(content.primaryCtaUrl || '#zugang');
  return {
    email,
    section,
    home: '/',
    admin: adminAppUrl ? joinUrl(adminAppUrl, '/admin') : '/admin',
    guest: guestPageUrl(content.secondaryCtaUrl, feedbackAppUrl),
    primary: primary.startsWith('#') ? section(primary.slice(1)) : primary,
    access: mailtoUrl(
      email,
      `${brand}: Zugang anfragen`,
      'Hallo,\n\nich möchte qrating für meine Events nutzen.\n\nVeranstalter:\nWebsite:\nEvents pro Jahr (ungefähr):\n\nViele Grüße\n'
    ),
    plan: (plan) => mailtoUrl(
      email,
      `${brand}: Tarif ${plan.name}`,
      `Hallo,\n\nich interessiere mich für den Tarif ${plan.name}.\n\nVeranstalter:\nWebsite:\n\nViele Grüße\n`
    )
  };
}

export function LogoMark({ className }) {
  return <svg className={cx('logo-mark', className)} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <circle cx="20" cy="20" r="20" style={{ fill: 'var(--sun)' }} />
    <path className="logo-star" d="M20 8.5l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z" style={{ fill: 'var(--ink)' }} />
  </svg>;
}

export function QrCode({ value, className }) {
  const qr = useMemo(() => {
    const { data, size } = encode(value, { ecc: 'M', border: 0 });
    let path = '';
    data.forEach((row, y) => {
      for (let x = 0; x < size; x += 1) {
        if (!row[x]) continue;
        let run = 1;
        while (x + run < size && row[x + run]) run += 1;
        path += `M${x} ${y}h${run}v1h-${run}z`;
        x += run - 1;
      }
    });
    return { path, size };
  }, [value]);
  return <svg className={className} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    <path d={qr.path} fill="currentColor" />
  </svg>;
}

// Fades elements with the class "reveal" in once they scroll into view.
// index.html sets html.site-reveal before the first paint, so nothing flashes.
export function useReveal() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('site-reveal')) return undefined;
    if (!('IntersectionObserver' in window)) {
      root.classList.remove('site-reveal');
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal:not(.is-in)').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

// The landing section in the middle of the viewport, for the navigation marker.
function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  const key = ids.join('|');
  useEffect(() => {
    setActive(null);
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!elements.length || !('IntersectionObserver' in window)) return undefined;
    const visible = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      setActive(ids.find((id) => visible.get(id)) || null);
    }, { rootMargin: '-42% 0px -54% 0px' });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

export function SiteHeader({ site, links, page }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [marker, setMarker] = useState(null);
  const linkRefs = useRef({});
  const menuButton = useRef(null);
  const active = useActiveSection(page === 'landing' ? NAV_ITEMS.map((item) => item.id) : []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [page]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    const place = () => {
      const link = active && linkRefs.current[active];
      setMarker(link ? { x: link.offsetLeft, width: link.offsetWidth } : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);

  const close = () => setOpen(false);

  return <header className={cx('site-header', scrolled && 'is-scrolled', open && 'is-open')}>
    <div className="site-container site-header-inner">
      <a href={links.home} className="site-logo" aria-label={`${site.brand}, zur Startseite`}>
        <LogoMark />
        <span aria-hidden="true">{site.brand}</span>
      </a>
      <nav className="site-nav" aria-label="Hauptnavigation">
        {NAV_ITEMS.map((item) => <a
          key={item.id}
          ref={(element) => { linkRefs.current[item.id] = element; }}
          href={links.section(item.id)}
          aria-current={active === item.id ? 'true' : undefined}
        >
          {item.label}
        </a>)}
        <span
          className="site-nav-indicator weave weave--berry"
          style={marker ? { translate: `${marker.x}px 0`, width: `${marker.width}px`, opacity: 1 } : undefined}
          aria-hidden="true"
        />
      </nav>
      <div className="site-header-actions">
        <a className="site-login" href={links.admin}>Anmelden</a>
        <a className="btn btn-ink btn-sm" href={links.section('zugang')}>Zugang anfragen</a>
      </div>
      <button
        ref={menuButton}
        type="button"
        className="site-menu-btn"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="sr-only">{open ? 'Menü schließen' : 'Menü öffnen'}</span>
        <span className="menu-lines" aria-hidden="true"><span /><span /><span /></span>
      </button>
    </div>
    <div className={cx('site-menu-backdrop', open && 'is-open')} onClick={close} aria-hidden="true" />
    <div id="site-menu" className={cx('site-menu', open && 'is-open')}>
      <nav aria-label="Menü">
        {NAV_ITEMS.map((item, index) => <a key={item.id} href={links.section(item.id)} onClick={close} style={{ '--i': index }}>
          {item.label}
          <ArrowRight size={22} strokeWidth={2.4} aria-hidden="true" />
        </a>)}
      </nav>
      <div className="site-menu-actions">
        <a className="btn btn-outline" href={links.admin} onClick={close}>Anmelden</a>
        <a className="btn btn-berry" href={links.section('zugang')} onClick={close}>Zugang anfragen</a>
      </div>
    </div>
  </header>;
}

export function AccessBanner({ site, links }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(links.email);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2400);
    } catch {
      window.location.href = `mailto:${links.email}`;
    }
  }

  return <section id="zugang" className="site-section" aria-labelledby="zugang-title">
    <div className="site-container">
      <div className="access-card reveal">
        <span className="access-band access-band--one weave weave--berry stitched" aria-hidden="true" />
        <span className="access-band access-band--two weave weave--leaf stitched" aria-hidden="true" />
        <div className="access-copy">
          <h2 id="zugang-title" className="site-h2">{site.ctaHeadline}</h2>
          {site.ctaText && <p className="access-text">{site.ctaText}</p>}
          <div className="access-actions">
            <a className="btn btn-ink btn-lg" href={links.access}>
              <Mail size={20} strokeWidth={2.4} aria-hidden="true" />
              {site.primaryCtaLabel}
            </a>
            <button type="button" className="access-copy-btn" onClick={copyAddress}>
              <span className="access-copy-address">{links.email}</span>
              <span className="access-copy-hint" aria-live="polite">
                {copied
                  ? <><Check size={14} strokeWidth={3} aria-hidden="true" /> Adresse kopiert</>
                  : <><Copy size={14} strokeWidth={2.4} aria-hidden="true" /> Adresse kopieren</>}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

export function SiteFooter({ site, links }) {
  return <footer className="site-footer">
    <div className="footer-bands" aria-hidden="true">
      <span className="weave weave--leaf" />
      <span className="weave weave--berry" />
      <span className="weave weave--sun" />
    </div>
    <div className="site-container site-footer-inner">
      <div className="footer-brand">
        <a href={links.home} className="footer-logo">
          <LogoMark />
          {site.brand}
        </a>
        {site.footerText && <p>{site.footerText}</p>}
      </div>
      <nav className="footer-nav" aria-label="Weitere Seiten">
        <a href="/faq">Fragen</a>
        <a href="/impressum">Impressum</a>
        <a href="/datenschutz">Datenschutz</a>
        <a href={`mailto:${links.email}`}>Kontakt</a>
        <a href={links.admin}>Anmelden</a>
      </nav>
      <p className="footer-copy">© {new Date().getFullYear()} {site.brand}{site.showProductCredit === false ? '' : <>
        {' · ein Projekt von '}
        <a className="brand-credit-link" href={brightColorUrl} target="_blank" rel="noreferrer"><BrightColorSign />bright color</a>
      </>}</p>
    </div>
  </footer>;
}
