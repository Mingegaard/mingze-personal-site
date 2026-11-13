import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

// Apply the saved theme before the first paint. This stores appearance only.
try {
  const theme = localStorage.getItem('personal-ocean.site.theme') || 'light';
  if (theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.setAttribute('data-ds-dark-theme', '');
  }
} catch {}

createRoot(document.getElementById('root')).render(<App />);
