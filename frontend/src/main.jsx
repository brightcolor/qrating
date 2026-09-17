import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

function loadApp(path) {
  if (path.startsWith('/admin')) return import('./AdminApp.jsx');
  if (path.startsWith('/e/') || path.startsWith('/f/')) return import('./PublicApp.jsx');
  return import('./site/SiteApp.jsx');
}

async function bootstrap() {
  const module = await loadApp(window.location.pathname);
  const App = module.default;
  createRoot(document.getElementById('root')).render(<App />);
}

bootstrap();
