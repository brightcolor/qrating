import { defineConfig } from 'vite';

// A guest page used to wait on three steps in a row: the base bundle, then the guest
// chunks, then the answer of the server. The guest chunks can only start once the base
// bundle has run, because main.jsx picks them by address. This plugin writes their names
// into index.html, and a line there preloads them on guest addresses — so they arrive
// alongside the base bundle instead of after it. The website and the admin area load
// nothing extra.
function preloadGuestChunks() {
  return {
    name: 'qrating-preload-guest-chunks',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context?.bundle;
        if (!bundle) return html;
        const entry = Object.values(bundle).find((chunk) => chunk.type === 'chunk' && /[\\/]src[\\/]PublicApp\.jsx$/.test(chunk.facadeModuleId || ''));
        if (!entry) return html;

        const scripts = new Set();
        const styles = new Set();
        const visit = (fileName) => {
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== 'chunk' || scripts.has(fileName)) return;
          scripts.add(fileName);
          for (const css of chunk.viteMetadata?.importedCss || []) styles.add(css);
          for (const dependency of chunk.imports || []) visit(dependency);
        };
        visit(entry.fileName);
        // FeedbackFlow sits behind a dynamic import of its own; the page needs it at once.
        for (const dependency of entry.dynamicImports || []) {
          if (/FeedbackFlow/.test(dependency)) visit(dependency);
        }

        const links = [
          ...[...scripts].map((file) => ['modulepreload', file, '']),
          ...[...styles].map((file) => ['preload', file, 'style'])
        ];
        const lines = links
          .map(([rel, file, as]) => `l=d.createElement('link');l.rel='${rel}';${as ? `l.as='${as}';` : ''}l.href='/${file}';h.appendChild(l);`)
          .join('');
        const script = `<script>(function(){if(!/^\\/(e|f)\\//.test(location.pathname))return;var d=document,h=d.head,l;${lines}})();</script>`;
        return html.replace('</head>', `  ${script}\n  </head>`);
      }
    }
  };
}

export default defineConfig({
  plugins: [preloadGuestChunks()]
});
