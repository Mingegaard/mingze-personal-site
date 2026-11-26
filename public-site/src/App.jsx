import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PersonalChat, ChatHistory } from '../../personal-ocean/src/chat.jsx';
import { createChatStore } from '../../personal-ocean/src/chat-store.js';
import { ProfilePage, ProfileIcon } from '../../personal-ocean/src/profile.jsx';
import { profileLocales } from '../../personal-ocean/src/profile-locales.js';
import { GuestbookPage, GuestbookIcon } from '../../personal-ocean/src/guestbook.jsx';
import { guestbookLocales } from '../../personal-ocean/src/guestbook-locales.js';
import { createGuestbookApi } from '../../personal-ocean/src/guestbook-api.js';
import { DolphinBackground } from './DolphinBackground.jsx';
import personalLogo from '../../personal-ocean/src/assets/mingze-logo.png';
import personalMark from '../../personal-ocean/src/assets/mingze-mark.png';
import { languages, shellLocales, translator } from './locales.js';
import { settingsLocales } from './settings-locales.js';
import { Settings } from './Settings.jsx';
import '../../personal-ocean/src/ocean.css';
import '../../personal-ocean/src/chat.css';
import '../../personal-ocean/src/profile.css';
import '../../personal-ocean/src/guestbook.css';
import './site.css';

const preferences = { locale: 'personal-ocean.site.locale', theme: 'personal-ocean.site.theme', sidebar: 'personal-ocean.site.sidebar', fontSize:'personal-ocean.site.font-size',fontFamily:'personal-ocean.site.font-family' };
const dictionaries = Object.fromEntries(languages.map(([locale]) => [locale, { ...profileLocales[locale], ...shellLocales[locale],...settingsLocales[locale] }]));
function savedPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function currentPage() {
  const value = window.location.hash.slice(1);
  return ['profile', 'guestbook'].includes(value) ? value : 'chat';
}
function Icon({ kind, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'new' ? <><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5H9l-5 2v-5a8.5 8.5 0 1 1 17-5.5Z"/><path d="M12 7v8M8 11h8"/></> : kind === 'sidebar' ? <><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/></> : kind === 'close' ? <path d="m6 6 12 12M18 6 6 18"/> : <><path d="m9.6 3-.7 2.1-2 .9-2-.4L3 8.6l1.3 1.7v2.4L3 14.4l1.9 3 2-.4 2 .9.7 2.1h3.8l.7-2.1 2-.9 2 .4 1.9-3-1.3-1.7v-2.4L20 8.6l-1.9-3-2 .4-2-.9-.7-2.1Z"/><circle cx="11.5" cy="11.5" r="3"/></>}
  </svg>;
}
export function App() {
  const [locale, setLocale] = useState(() => {
    const saved = savedPreference(preferences.locale, navigator.language.startsWith('zh') ? 'zh' : 'en');
    return languages.some(([key]) => key === saved) ? saved : 'en';
  });
  const [theme, setTheme] = useState(() => {
    const saved = savedPreference(preferences.theme, 'light');
    return ['light', 'dark', 'system'].includes(saved) ? saved : 'light';
  });
  const [dark, setDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'));
  const [wide, setWide] = useState(() => savedPreference(preferences.sidebar, innerWidth >= 760 ? 'wide' : 'compact') === 'wide');
  const [fontSize,setFontSize]=useState(()=>{
    const saved=Number(savedPreference(preferences.fontSize,'14'));
    return Number.isInteger(saved)&&saved>=12&&saved<=24?saved:14;
  });
  const [fontFamily,setFontFamily]=useState(()=>{
    const saved=savedPreference(preferences.fontFamily,'').trim();
    return saved.length<=200&&CSS.supports('font-family',saved)?saved:'';
  });
  const [page, setPage] = useState(currentPage);
  const [settings, setSettings] = useState(false);
  const [usageRevision, setUsageRevision] = useState(0);
  const api = useMemo(() => createGuestbookApi({ url: import.meta.env.VITE_SUPABASE_URL, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }), []);
  const [store] = useState(() => createChatStore({ requestChat: api.requestChat }));
  const t = useMemo(() => translator(dictionaries, locale), [locale]);
  const guestbookT = useMemo(() => translator(guestbookLocales, locale), [locale]);
  const navigate = useCallback(next => {
    window.location.hash = next === 'chat' ? '' : next;
    setPage(next);
    if (innerWidth < 760) setWide(false);
  }, []);
  const openChat = useCallback(() => navigate('chat'), [navigate]);
  const startChat = () => { store.newChat(); navigate('chat'); };
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return;
    // Establish the public API connection before the visitor opens the guestbook.
    const link=document.createElement('link');
    link.rel='preconnect';link.href=import.meta.env.VITE_SUPABASE_URL;link.crossOrigin='anonymous';
    document.head.append(link);
    return ()=>link.remove();
  }, []);
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; savePreference(preferences.locale, locale); }, [locale]);
  useEffect(() => { savePreference(preferences.sidebar, wide ? 'wide' : 'compact'); }, [wide]);
  useEffect(()=>{savePreference(preferences.fontSize,String(fontSize));document.documentElement.style.setProperty('--site-chat-font-size',`${fontSize}px`);},[fontSize]);
  useEffect(()=>{savePreference(preferences.fontFamily,fontFamily);if(fontFamily)document.documentElement.style.setProperty('--site-font-family',fontFamily);else document.documentElement.style.removeProperty('--site-font-family');},[fontFamily]);
  useEffect(() => {
    savePreference(preferences.theme, theme);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.body.toggleAttribute('data-ds-dark-theme', dark);
      setDark(dark);
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    // Optional explicitly published statistics only; no local account connection.
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}profile-usage.json`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => {
      if (data && typeof data === 'object' && Array.isArray(data.dailyUsageBuckets)) {
        window.__PERSONAL_CODEX_USAGE__ = data;
        setUsageRevision(value => value + 1);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <>
    <DolphinBackground dark={dark}/>
    <a className="site-skip" href="#site-content" onClick={event => {event.preventDefault();document.getElementById('site-content')?.focus();}}>{t('skipContent')}</a>
    <div className="site-shell" data-wide={wide}>
      {wide && <button className="site-mobile-shade" aria-label={t('collapseSidebar')} onClick={() => setWide(false)}/>}
      <aside className="site-sidebar" data-slot="sidebar" aria-label={t('navigation')}>
        <header className="site-brand-row">
          <button type="button" className="site-brand" onClick={startChat} aria-label="M.GAO"><img src={wide ? personalLogo : personalMark} alt="M.GAO" className={wide ? 'site-wordmark' : 'site-mark'}/></button>
          {wide && <button type="button" className="site-icon-button" aria-label={t('collapseSidebar')} title={t('collapseSidebar')} onClick={() => setWide(false)}><Icon kind="sidebar" size={18}/></button>}
        </header>
        {!wide && <button type="button" className="site-nav-button site-expand" aria-label={t('expandSidebar')} title={t('expandSidebar')} onClick={() => setWide(true)}><Icon kind="sidebar"/></button>}
        <nav className="site-navigation" aria-label={t('navigation')}>
          <button type="button" className="site-nav-button" onClick={startChat} title={wide ? undefined : t('newChat')} aria-label={t('newChat')}><Icon kind="new"/>{wide && <span>{t('newChat')}</span>}</button>
          <button type="button" className="site-nav-button" aria-current={page === 'profile' ? 'page' : undefined} onClick={() => navigate('profile')} title={wide ? undefined : t('profile')} aria-label={t('profile')}><ProfileIcon/>{wide && <span>{t('profile')}</span>}</button>
          <button type="button" className="site-nav-button" aria-current={page === 'guestbook' ? 'page' : undefined} onPointerEnter={() => {void api.prefetchList();}} onFocus={() => {void api.prefetchList();}} onPointerDown={() => {void api.prefetchList();}} onClick={() => navigate('guestbook')} title={wide ? undefined : t('guestbook')} aria-label={t('guestbook')}><GuestbookIcon/>{wide && <span>{t('guestbook')}</span>}</button>
        </nav>
        <div className="site-history"><ChatHistory store={store} t={t} wide={wide} open={openChat}/></div>
        <button type="button" className="site-nav-button site-settings-trigger" onClick={() => setSettings(true)} title={wide ? undefined : t('settings')} aria-label={t('settings')}><Icon kind="settings"/>{wide && <span>{t('settings')}</span>}</button>
      </aside>
      <main id="site-content" className="site-content" tabIndex={-1}>
        {page === 'profile' ? <ProfilePage key={usageRevision} t={t} getLocale={() => locale}/> : page === 'guestbook' ? <GuestbookPage t={guestbookT} api={api}/> : <PersonalChat store={store} t={t}/>}
      </main>
    </div>
    {settings && <Settings t={t} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} fontSize={fontSize} setFontSize={setFontSize} fontFamily={fontFamily} setFontFamily={setFontFamily} store={store} onClose={() => setSettings(false)}/>}
  </>;
}
