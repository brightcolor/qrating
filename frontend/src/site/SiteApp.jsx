import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import '@fontsource/paytone-one';
import '@fontsource-variable/hanken-grotesk';
import './site.css';
import { Plus } from 'lucide-react';
import { API_BASE, api } from '../lib/api.js';
import Landing from './Landing.jsx';
import { AccessBanner, DEFAULT_CONTACT, LogoMark, SiteFooter, SiteHeader, cx, siteLinks, useReveal } from './siteKit.jsx';

const pages = {
  '/': 'landing',
  '/faq': 'faq',
  '/impressum': 'imprint',
  '/datenschutz': 'privacy'
};

const pageTitles = {
  faq: 'Fragen und Antworten',
  imprint: 'Impressum',
  privacy: 'Datenschutz'
};

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

function pageFor(pathname) {
  return pages[normalizePath(pathname)] || 'landing';
}

// index.html starts this request while the scripts load.
function loadSite() {
  const early = API_BASE === '/api' ? window.__qratingSite : undefined;
  window.__qratingSite = undefined;
  return early ? early.catch(() => api('/public/site')) : api('/public/site');
}

// Waits briefly for the web fonts so the page does not jump when they arrive.
function fontsReady(timeout) {
  if (!document.fonts?.load) return Promise.resolve();
  const loading = Promise.all([
    document.fonts.load('400 1em "Paytone One"', 'Qä€'),
    document.fonts.load('600 1em "Hanken Grotesk Variable"', 'Qä€')
  ]).catch(() => undefined);
  return Promise.race([loading, new Promise((resolve) => window.setTimeout(resolve, timeout))]);
}

function useSite() {
  const [state, setState] = useState({ status: 'loading', data: null });
  useEffect(() => {
    let active = true;
    Promise.all([loadSite(), fontsReady(1200)])
      .then(([data]) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error', data: null }));
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export default function SiteApp() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [visit, setVisit] = useState(0);
  const site = useSite();
  const page = pageFor(path);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('site-html');
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const onPopState = () => {
      setPath(window.location.pathname);
      setVisit((count) => count + 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const brand = site.data?.content?.brand || 'qrating';
    document.title = pageTitles[page] ? `${pageTitles[page]} · ${brand}` : `${brand} · QR-Feedback für Events`;
  }, [page, site.data]);

  // After switching pages: jump to the requested section, else to the top.
  useLayoutEffect(() => {
    if (site.status !== 'ready') return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page, visit, site.status]);

  // Website links switch pages in place; everything else loads normally.
  const onClick = useCallback((event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !pages[normalizePath(url.pathname)]) return;
    const samePage = normalizePath(url.pathname) === normalizePath(window.location.pathname);
    if (samePage && url.hash) return;
    event.preventDefault();
    if (samePage) {
      window.history.replaceState(null, '', url.pathname + url.search);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
    setPath(url.pathname);
    setVisit((count) => count + 1);
  }, []);

  if (site.status === 'loading') {
    return <div className="site" aria-busy="true">
      <div className="site-state site-loader" role="status">
        <LogoMark />
        <span className="sr-only">Seite wird geladen</span>
      </div>
    </div>;
  }

  if (site.status === 'error') {
    return <div className="site">
      <main className="site-state">
        <LogoMark />
        <h1>Die Seite konnte gerade nicht geladen werden.</h1>
        <p>Lade sie bitte neu. Klappt das wiederholt nicht, erreichst du uns unter {DEFAULT_CONTACT}.</p>
        <button type="button" className="btn btn-ink" onClick={() => window.location.reload()}>Neu laden</button>
      </main>
    </div>;
  }

  const { content, adminAppUrl, feedbackAppUrl } = site.data;
  const links = siteLinks({ content, adminAppUrl, feedbackAppUrl, onLanding: page === 'landing' });

  return <div className="site" onClick={onClick}>
    <a className="skip-link" href="#inhalt">Zum Inhalt</a>
    <SiteHeader site={content} links={links} page={page} />
    <main id="inhalt" key={`${page}-${visit}`} className="site-page" tabIndex={-1}>
      {page === 'landing' && <Landing site={content} links={links} />}
      {page === 'faq' && <FaqPage site={content} links={links} />}
      {page === 'imprint' && <LegalPage title="Impressum" text={content.imprint} />}
      {page === 'privacy' && <LegalPage title="Datenschutz" text={content.privacy} />}
    </main>
    <SiteFooter site={content} links={links} />
  </div>;
}

function FaqPage({ site, links }) {
  const [open, setOpen] = useState(0);
  useReveal();
  return <>
    <section className="page-hero" aria-labelledby="faq-title">
      <div className="site-container page-narrow">
        <h1 id="faq-title" className="site-h1 page-title hero-in">Fragen und Antworten</h1>
        <p className="page-lead hero-in" style={{ '--delay': '80ms' }}>Das Wichtigste zu {site.brand}, kurz beantwortet.</p>
        <div className="acc-list mt-10 mb-4">
          {(site.faq || []).map((item, index) => <FaqItem
            key={index}
            id={`frage-${index + 1}`}
            item={item}
            open={open === index}
            delay={120 + index * 50}
            onToggle={() => setOpen(open === index ? -1 : index)}
          />)}
        </div>
      </div>
    </section>
    <AccessBanner site={site} links={links} />
  </>;
}

function FaqItem({ id, item, open, delay, onToggle }) {
  return <div className={cx('acc-item hero-in', open && 'is-open')} style={{ '--delay': `${delay}ms` }}>
    <h2 className="m-0">
      <button type="button" className="acc-button" id={`${id}-frage`} aria-expanded={open} aria-controls={`${id}-antwort`} onClick={onToggle}>
        <span>{item.question}</span>
        <span className="acc-icon" aria-hidden="true"><Plus size={20} strokeWidth={2.8} /></span>
      </button>
    </h2>
    <div className="acc-panel" id={`${id}-antwort`} role="region" aria-labelledby={`${id}-frage`}>
      <div className="acc-panel-inner">
        <p>{item.answer}</p>
      </div>
    </div>
  </div>;
}

function LegalPage({ title, text }) {
  return <section className="page-hero" aria-labelledby="legal-title">
    <div className="site-container page-narrow">
      <h1 id="legal-title" className="site-h1 page-title hero-in">{title}</h1>
      <div className="legal-card hero-in" style={{ '--delay': '100ms' }}>
        <span className="legal-band weave weave--leaf" aria-hidden="true" />
        <div className="legal-text">{text}</div>
      </div>
    </div>
  </section>;
}
