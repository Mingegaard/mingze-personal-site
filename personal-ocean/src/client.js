import { mountRipples } from './ripples.js';
import { createElement } from 'react';
import personalLogo from './assets/mingze-logo.png';
import personalMark from './assets/mingze-mark.png';
import { PersonalChat, ChatHistory } from './chat.jsx';
import { createChatStore } from './chat-store.js';
import chatStyles from './chat.css';
import { OceanEngine } from '../../ascii-sharks/src/engine.ts';
import styles from './ocean.css';
import profileStyles from './profile.css';
import { ProfilePage, ProfileIcon } from './profile.jsx';

import { PROFILE_NS, profileLocales } from './profile-locales.js';
import { GuestbookPage, GuestbookIcon } from './guestbook.jsx';
import { GUESTBOOK_NS, guestbookLocales } from './guestbook-locales.js';
import { createGuestbookApi } from './guestbook-api.js';
import guestbookStyles from './guestbook.css';

export const inject = ['slots', 'locale', 'layout'];

/** Mount a disposable background while leaving all application controls interactive. */
export function apply(ctx) {
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
    name: 'sidebar.brand.mark',
  }, () => createElement('img', { src: personalMark, alt: '', className: 'personal-brand-mark', draggable: false })));
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
    name: 'sidebar.brand.name',
  }, () => createElement('img', { src: personalLogo, alt: '高铭泽', className: 'personal-brand-logo', draggable: false })));
  ctx.effect(() => ctx.locale.register(PROFILE_NS, profileLocales));
  ctx.effect(() => ctx.locale.register(GUESTBOOK_NS, guestbookLocales));
  const t = ctx.locale.bind(PROFILE_NS);
  const guestbookT = ctx.locale.bind(GUESTBOOK_NS);
  const guestbookApi = createGuestbookApi(window.__PERSONAL_SUPABASE__ ?? {});
  const chats = createChatStore();
  const openChat = () => {
    ctx.layout.selectPanel(null);
  };
  ctx.slots.inject('main', () => ctx.slots.register({
    name:'main', key:'conversation', priority:-10, locale:PROFILE_NS, inject:()=>({store:chats}),
  }, PersonalChat));
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name:'sidebar.workspaces', priority:-10, locale:PROFILE_NS, inject:()=>({store:chats,open:openChat}),
  }, ChatHistory));
  ctx.effect(() => {
    // Keep the existing sidebar brand/button, but route it to browser-only chats.
    const start = event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (!button?.closest('[data-slot="sidebar"]') ||
        ![...button.classList].some(name=>name.endsWith('_newSession') || name.endsWith('_brand'))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      chats.newChat(); openChat();
    };
    document.addEventListener('click',start,true);
    return () => { document.removeEventListener('click',start,true); chats.dispose(); };
  });
  ctx.effect(() => {
    const updateTitle = () => document.documentElement.style.setProperty('--personal-home-title', JSON.stringify(t('homeTitle')));
    updateTitle();
    const unsubscribe = ctx.locale.subscribe(updateTitle);
    return () => { unsubscribe(); document.documentElement.style.removeProperty('--personal-home-title'); };
  });
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'personal-profile', locale: PROFILE_NS,
    inject: () => ({ getLocale: () => ctx.locale.getSnapshot().active }),
  }, ProfilePage));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'personal-profile', order: -10, label: () => t('profile'), locale: PROFILE_NS,
  }, ProfileIcon));
  ctx.slots.inject('main', () => ctx.slots.register({
    name:'main',key:'personal-guestbook',locale:GUESTBOOK_NS,inject:()=>({api:guestbookApi}),
  },GuestbookPage));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name:'sidebar.panellist',id:'personal-guestbook',order:-9,label:()=>guestbookT('guestbook'),locale:GUESTBOOK_NS,
  },GuestbookIcon));
  const config = window.__PERSONAL_OCEAN_CONFIG__ ?? {};
  ctx.effect(() => mountRipples());
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'personal-ocean';
    style.textContent = styles + '\n' + profileStyles + '\n' + chatStyles + '\n' + guestbookStyles;
    const canvas = document.createElement('canvas');
    canvas.className = 'personal-ocean-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.setProperty('--ocean-opacity', String(config.opacity ?? 0.62));
    document.head.append(style);
    document.body.prepend(canvas);
    document.documentElement.dataset.personalOcean = '';
    let engine;
    try {
      engine = new OceanEngine(canvas, config.sharks);
    } catch (error) {
      style.remove();
      canvas.remove();
      delete document.documentElement.dataset.personalOcean;
      throw error;
    }
    return () => {
      engine.destroy();
      canvas.remove();
      style.remove();
      delete document.documentElement.dataset.personalOcean;
    };
  });
}
