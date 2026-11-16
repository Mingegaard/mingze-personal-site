import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { CHAT_MODELS, CHAT_EFFORTS } from '../../personal-ocean/chat-options.mjs';
import { languages } from './locales.js';

function SettingsIcon({kind}) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='general'?<><path d="M4 7h7m4 0h5M4 17h11m4 0h1"/><circle cx="13" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></>:kind==='close'?<path d="m6 6 12 12M18 6 6 18"/>:<><rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/></>}
  </svg>;
}

export function Settings({t,locale,setLocale,theme,setTheme,fontSize,setFontSize,fontFamily,setFontFamily,store,onClose}) {
  const dialog=useRef(null), id=useId();
  const [section,setSection]=useState('general');
  const [fontDraft,setFontDraft]=useState(fontFamily), [fontError,setFontError]=useState(false);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot);
  const model=CHAT_MODELS.find(item=>item.id===state.selection.model)??CHAT_MODELS[0];
  useEffect(()=>{dialog.current.showModal();},[]);
  const applyFont=()=>{
    const value=fontDraft.trim();
    if(value&&!CSS.supports('font-family',value)){setFontError(true);return;}
    setFontError(false);setFontFamily(value);
  };
  return <dialog ref={dialog} className="site-settings" aria-labelledby={`${id}-title`} onClose={onClose} onClick={event=>{
    if(event.target!==dialog.current)return;
    const r=dialog.current.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.current.close();
  }}>
    <header className="site-settings-header"><h2 id={`${id}-title`}>{t('settings')}</h2><button type="button" className="site-icon-button" aria-label={t('close')} onClick={()=>dialog.current.close()}><SettingsIcon kind="close"/></button></header>
    <div className="site-settings-layout">
      <nav className="site-settings-nav" aria-label={t('settings')}>
        {['general','models'].map(value=><button key={value} type="button" aria-current={section===value?'page':undefined} aria-controls={`${id}-content`} onClick={()=>setSection(value)}><SettingsIcon kind={value}/><span>{t(value==='general'?'settingsGeneral':'settingsModels')}</span></button>)}
      </nav>
      <section id={`${id}-content`} className="site-settings-content" aria-label={t(section==='general'?'settingsGeneral':'settingsModels')}>
        {section==='general'?<>
          <section className="site-settings-group" aria-labelledby={`${id}-appearance`}>
            <h3 id={`${id}-appearance`}>{t('settingsAppearance')}</h3>
            <label className="site-setting-row"><span>{t('language')}</span><select value={locale} onChange={event=>setLocale(event.target.value)}>{languages.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <div className="site-setting-row"><span id={`${id}-theme`}>{t('appearance')}</span><div className="site-theme-options" role="group" aria-labelledby={`${id}-theme`}>{['light','dark','system'].map(value=><button key={value} type="button" aria-pressed={theme===value} onClick={()=>setTheme(value)}>{t(value)}</button>)}</div></div>
          </section>
          <section className="site-settings-group" aria-labelledby={`${id}-reading`}>
            <h3 id={`${id}-reading`}>{t('settingsReading')}</h3>
            <div className="site-setting-row"><div className="site-setting-copy"><label htmlFor={`${id}-size`}>{t('settingsFontSize')}</label><p>{t('settingsFontSizeHint')}</p></div>
              <div className="site-font-stepper"><button type="button" aria-label={t('settingsFontDecrease')} disabled={fontSize<=12} onClick={()=>setFontSize(fontSize-1)}>−</button><output id={`${id}-size`} aria-live="polite">{fontSize} <span>{t('settingsUnitPx')}</span></output><button type="button" aria-label={t('settingsFontIncrease')} disabled={fontSize>=24} onClick={()=>setFontSize(fontSize+1)}>+</button></div>
            </div>
            <div className="site-setting-row site-setting-font"><div className="site-setting-copy"><label htmlFor={`${id}-family`}>{t('settingsFontFamily')}</label><p id={`${id}-font-hint`}>{t('settingsFontFamilyHint')}</p></div><div className="site-font-field"><input id={`${id}-family`} value={fontDraft} placeholder={t('settingsFontPlaceholder')} maxLength={200} aria-describedby={`${id}-font-hint${fontError?` ${id}-font-error`:''}`} aria-invalid={fontError||undefined} onChange={event=>{setFontDraft(event.target.value);setFontError(false);}} onBlur={applyFont} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();applyFont();}}}/>{fontError&&<p id={`${id}-font-error`} role="alert">{t('settingsFontInvalid')}</p>}</div></div>
          </section>
          <p className="site-settings-save-hint">{t('settingsSaveHint')}</p>
        </>:<>
          <section className="site-settings-group" aria-labelledby={`${id}-models`}>
            <h3 id={`${id}-models`}>{t('settingsModels')}</h3>
            <div className="site-model-card">
              <header><span className="site-model-icon"><SettingsIcon kind="models"/></span><div><h4>{model.name}</h4><p>{t('settingsModelDescription')}</p></div><span className="site-model-default">{t('settingsModelDefault')}</span></header>
              <div className="site-model-status"><span>{t('settingsReasoningActual')}</span><span>{t('chatEffort_off')}</span></div>
              <p className="site-model-notice">{t('settingsReasoningNotice')}</p>
            </div>
          </section>
          <section className="site-settings-group" aria-labelledby={`${id}-preferences`}>
            <h3 id={`${id}-preferences`}>{t('settingsModelPreferences')}</h3>
            <label className="site-setting-row"><span className="site-setting-copy"><span>{t('settingsCurrentEffort')}</span><small>{t('settingsPreferencesHint')}</small></span><select value={state.selection.reasoningEffort} disabled={state.busy} onChange={event=>store.setSelection({...state.selection,reasoningEffort:event.target.value})}>{CHAT_EFFORTS.map(value=><option key={value} value={value}>{t('chatEffort_'+value)}</option>)}</select></label>
          </section>
          <p className="site-settings-save-hint">{t('settingsSaveHint')}</p>
        </>}
      </section>
    </div>
  </dialog>;
}
