import React, { useEffect, useId, useRef, useState } from 'react';
import { CHAT_MODELS, CHAT_EFFORTS } from '../chat-options.mjs';

const EffortIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h7m4 0h5M4 17h2m4 0h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="13" cy="7" r="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.6"/></svg>;
export function ChatModelSelect({selection, onSelect, disabled, t}) {
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState({});
  const modelMenu = useRef(null), modelTrigger = useRef(null);
  const effortMenu = useRef(null), effortTrigger = useRef(null);
  const modelId = useId(), effortId = useId();
  const model = CHAT_MODELS.find(item => item.id === selection.model) ?? CHAT_MODELS[0];
  const effort = t('chatEffort_' + selection.reasoningEffort);
  const effortIndex = CHAT_EFFORTS.indexOf(selection.reasoningEffort);
  const refs = kind => kind === 'model' ? [modelMenu,modelTrigger] : [effortMenu,effortTrigger];
  const close = kind => { const [menu,trigger]=refs(kind);menu.current?.hidePopover();setOpen(null);trigger.current?.focus(); };
  const show = kind => {
    if (disabled) return;
    const [menu,trigger] = refs(kind);
    if (menu.current.matches(':popover-open')) {close(kind);return;}
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(300,window.innerWidth-24);
    setPosition({width,left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),bottom:Math.max(12,window.innerHeight-rect.top+8),maxHeight:Math.max(100,rect.top-20)});
    setSearch(''); setOpen(kind); menu.current.showPopover();
    requestAnimationFrame(()=>{if(kind==='effort')menu.current?.focus({preventScroll:true});else menu.current?.querySelector('input, button')?.focus();});
  };
  // Listen to the native event so outside clicks and Escape also reset the trigger.
  useEffect(()=>{
    const cleanups=['model','effort'].map(kind=>{
      const element=refs(kind)[0].current;
      const toggle=event=>setOpen(current=>event.newState==='open'?kind:current===kind?null:current);
      element.addEventListener('toggle',toggle);
      return ()=>element.removeEventListener('toggle',toggle);
    });
    return ()=>cleanups.forEach(cleanup=>cleanup());
  },[]);
  useEffect(()=>{
    if(!open)return;
    const place=()=>{
      const [menu,trigger]=refs(open);
      const r=trigger.current.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24);
      const height=Math.min(menu.current.scrollHeight+2,window.innerHeight-24);
      const above=r.top-height-8;
      const top=above>=12?above:Math.max(12,Math.min(r.bottom+8,window.innerHeight-height-12));
      setPosition({width,left:Math.max(12,Math.min(r.right-width,window.innerWidth-width-12)),top,maxHeight:window.innerHeight-24});
    };
    const frame=requestAnimationFrame(place);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open]);
  const navigateModels = event => {
    if (event.key === 'Escape') {event.preventDefault();close('model');return;}
    if (event.target.tagName === 'INPUT' && !['ArrowDown','ArrowUp'].includes(event.key)) return;
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...modelMenu.current.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  };
  return <div className="personal-model-select">
    <button ref={effortTrigger} type="button" className="personal-effort-trigger" disabled={disabled}
      aria-haspopup="dialog" aria-controls={effortId} aria-expanded={open==='effort'} aria-label={`${t('chatEffort')}: ${effort}`}
      title={`${t('chatEffort')}: ${effort}`} onClick={()=>show('effort')}>
      <span>{effort}</span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <button ref={modelTrigger} type="button" className="personal-model-trigger" disabled={disabled}
      aria-haspopup="menu" aria-controls={modelId} aria-expanded={open==='model'} aria-label={`${t('chatSelectModel')}: ${model.name}`} onClick={()=>show('model')}>
      <span className="personal-model-name">{model.name}</span>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div id={effortId} ref={effortMenu} popover="auto" role="dialog" aria-label={t('chatEffort')}
      className="personal-model-menu personal-effort-menu" tabIndex={-1} style={position}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close('effort');}}}>
      <div className="personal-effort-heading"><EffortIcon/><strong>{effort}</strong><span aria-hidden="true"/></div>
      <div className="personal-effort-model">{model.name}</div>
      <div className="personal-effort-slider" style={{'--effort-ratio':effortIndex/(CHAT_EFFORTS.length-1)}}>
        <div className="personal-effort-track" aria-hidden="true"><div className="personal-effort-fill"/></div>
        <div className="personal-effort-ticks" aria-hidden="true">{CHAT_EFFORTS.map(level=><i key={level}/>)}</div>
        <div className="personal-effort-thumb" aria-hidden="true"/>
        <input type="range" min="0" max={CHAT_EFFORTS.length-1} step="1" value={effortIndex} disabled={disabled}
          aria-label={t('chatEffort')} aria-valuetext={effort}
          onChange={event=>onSelect({...selection,reasoningEffort:CHAT_EFFORTS[Number(event.target.value)]})}/>
      </div>
      <div className="personal-effort-labels">{CHAT_EFFORTS.map(level=><button key={level} type="button" disabled={disabled}
        aria-pressed={selection.reasoningEffort===level} onClick={()=>onSelect({...selection,reasoningEffort:level})}>{t('chatEffort_'+level)}</button>)}</div>
    </div>
    <div id={modelId} ref={modelMenu} popover="auto" role="menu" aria-label={t('chatSelectModel')} className="personal-model-menu" style={position}
      onKeyDown={navigateModels}>
      {CHAT_MODELS.length>1&&<input type="search" placeholder={t('chatSearchModels')} aria-label={t('chatSearchModels')} value={search} onChange={event=>setSearch(event.target.value)}/>}
      {CHAT_MODELS.filter(item=>item.name.toLowerCase().includes(search.toLowerCase())).map(item=><button key={item.id} type="button" role="menuitemradio"
        aria-checked={selection.model===item.id} onClick={()=>{onSelect({...selection,model:item.id});close('model');}}>
        <span>{item.name}</span><span className="personal-model-check">{selection.model===item.id?'✓':''}</span>
      </button>)}
    </div>
  </div>;
}
