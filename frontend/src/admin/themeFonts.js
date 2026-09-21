// Every look brings its own typefaces. They load only when that look is in use, so a person
// who keeps the default never downloads the fonts of the other nine.
const loaders = {
  baendchen: () => Promise.all([
    import('@fontsource/paytone-one/400.css'),
    import('@fontsource-variable/hanken-grotesk')
  ]),
  einlassliste: () => import('@fontsource-variable/archivo/wdth.css'),
  mischpult: () => Promise.all([
    import('@fontsource/barlow/400.css'),
    import('@fontsource/barlow/500.css'),
    import('@fontsource/barlow/600.css'),
    import('@fontsource/barlow/700.css'),
    import('@fontsource/barlow-semi-condensed/500.css'),
    import('@fontsource/barlow-semi-condensed/600.css'),
    import('@fontsource/barlow-semi-condensed/700.css')
  ]),
  ablaufplan: () => import('@fontsource-variable/geologica'),
  eintrittskarte: () => Promise.all([
    import('@fontsource-variable/bricolage-grotesque'),
    import('@fontsource-variable/instrument-sans')
  ]),
  kommandozeile: () => import('@fontsource-variable/schibsted-grotesk'),
  posteingang: () => Promise.all([
    import('@fontsource/atkinson-hyperlegible/400.css'),
    import('@fontsource/atkinson-hyperlegible/700.css')
  ]),
  plakat: () => Promise.all([
    import('@fontsource/anton/400.css'),
    import('@fontsource-variable/work-sans')
  ]),
  schwarzlicht: () => Promise.all([
    import('@fontsource-variable/unbounded'),
    import('@fontsource-variable/figtree')
  ]),
  tabellenwerk: () => Promise.all([
    import('@fontsource/ibm-plex-sans/400.css'),
    import('@fontsource/ibm-plex-sans/500.css'),
    import('@fontsource/ibm-plex-sans/600.css'),
    import('@fontsource/ibm-plex-sans/700.css'),
    import('@fontsource/ibm-plex-sans-condensed/500.css'),
    import('@fontsource/ibm-plex-sans-condensed/600.css')
  ])
};

// A font that fails to load leaves the system font in place; the page stays usable.
export function loadThemeFonts(id) {
  const load = loaders[id] || loaders.baendchen;
  return load().catch(() => null);
}
