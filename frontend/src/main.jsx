import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

async function bootstrap() {
  const path = window.location.pathname;
  const module = path.startsWith('/admin')
    ? await import('./AdminApp.jsx')
    : await import('./PublicApp.jsx');
  const App = module.default;
  createRoot(document.getElementById('root')).render(<App />);
}

bootstrap();
