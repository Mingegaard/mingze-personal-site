import React, { useEffect, useId, useRef, useState } from 'react';
import { CHAT_MODELS, CHAT_EFFORTS } from '../chat-options.mjs';
import evolutionSprite from './assets/reasoning-evolution-ascii.png';

// Tight frame bounds keep each pose readable inside the compact slider thumb.
const evolutionFrames = [[55,367,340,308],[473,225,314,450],[859,116,316,558],[1262,69,420,606],[1729,55,388,620]];
function EvolutionFigure({index}) {
  const id = useId(), clipId = `${id}-clip`, outlineId = `${id}-outline`;
  const [x,y,width,height] = evolutionFrames[index] ?? evolutionFrames[0];
  const unit = Math.max(width / 48, height / 52);
  const outline = unit;
  const pad = unit * 4;
  return <svg className="personal-effort-figure" viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={clipId}><rect x={x} y={y} width={width} height={height}/></clipPath>
      <filter id={outlineId} filterUnits="userSpaceOnUse" x={x-pad} y={y-pad} width={width+pad*2} height={height+pad*2} colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius={unit} result="closedGaps"/>
        <feMorphology in="closedGaps" operator="erode" radius={unit} result="silhouette"/>
        <feMorphology in="silhouette" operator="dilate" radius={outline} result="expanded"/>
        <feComposite in="expanded" in2="silhouette" operator="out" result="rim"/>
        <feFlood floodColor="#234d78"/>
        <feComposite in2="rim" operator="in" result="blueOutline"/>
        <feComponentTransfer in="SourceGraphic" result="lightFigure">
          <feFuncR type="linear" slope=".85" intercept=".10"/>
          <feFuncG type="linear" slope=".75" intercept=".24"/>
          <feFuncB type="linear" slope=".65" intercept=".34"/>
        </feComponentTransfer>
        <feMerge><feMergeNode in="blueOutline"/><feMergeNode in="lightFigure"/></feMerge>
      </filter>
    </defs>
    <g filter={`url(#${outlineId})`}><image href={evolutionSprite} width="2172" height="724" clipPath={`url(#${clipId})`}/></g>
  </svg>;
}
function EffortTrail({index}) {
  const id = useId(), gradientId = `${id}-gradient`, pixelsId = `${id}-pixels`, fadeId = `${id}-fade`, maskId = `${id}-mask`;
  const peak = index === CHAT_EFFORTS.length - 1;
  return <svg className="personal-effort-trail" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradientId}>
        <stop stopColor="#397fc4" stopOpacity="0"/>
        <stop offset=".2" stopColor="#397fc4" stopOpacity=".01"/>
        <stop offset=".55" stopColor="#397fc4" stopOpacity={peak?.3:.17}/>
        <stop offset="1" stopColor={peak?'#397fd1':'#63ace0'} stopOpacity={peak?.82:.72}/>
      </linearGradient>
      <pattern id={pixelsId} width="96" height="30" patternUnits="userSpaceOnUse">
        {Array.from({length:80},(_,i)=>{
          const row=Math.floor(i/16),col=i%16,seed=(i*37+row*13)%101;
          return <rect key={i} className="personal-effort-pixel" x={col*6+1} y={row*6+1} width="4" height="4" rx=".35"
            fill={seed%5===0?'var(--effort-pixel-bright)':seed%3===0?'var(--effort-pixel-deep)':'var(--effort-pixel-blue)'}
            style={{'--pixel-duration':`${2+seed/55}s`,'--pixel-delay':`${-seed/23}s`,'--pixel-rest':.7+seed/340}}/>;
        })}
      </pattern>
      <linearGradient id={fadeId}><stop stopColor="#fff" stopOpacity="0"/><stop offset=".2" stopColor="#fff" stopOpacity=".28"/><stop offset=".45" stopColor="#fff" stopOpacity=".74"/><stop offset=".7" stopColor="#fff"/><stop offset="1" stopColor="#fff"/></linearGradient>
      <mask id={maskId}><rect width="100%" height="100%" fill={`url(#${fadeId})`}/></mask>
    </defs>
    {!peak&&<rect className="personal-effort-glow" width="100%" height="100%" fill={`url(#${gradientId})`}/>}
    {peak&&<rect width="100%" height="100%" fill={`url(#${pixelsId})`} mask={`url(#${maskId})`}/>}
  </svg>;
}
function EffortAura() {
  return <svg className="personal-effort-aura" viewBox="-36 -36 72 72" aria-hidden="true" focusable="false">
    <g transform="scale(.62 1)">
    {Array.from({length:12},(_,i)=><g key={i} transform={`rotate(${i*30+8})`}>
      <g className="personal-effort-ray" style={{'--ray-delay':`${-i*.19}s`}}>
        <path d="M 25 0 H 32" stroke="currentColor" strokeWidth=".8" strokeDasharray="1 2.5"/>
        {i%3===0&&<rect x="27" y="-1" width="2" height="2" rx=".3" fill="currentColor"/>}
      </g>
    </g>)}
    </g>
  </svg>;
}
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
    const width = Math.min(kind==='effort'?340:300,window.innerWidth-24);
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
      const r=trigger.current.getBoundingClientRect(),width=Math.min(open==='effort'?340:300,window.innerWidth-24);
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
      className="personal-model-menu personal-effort-menu" data-effort={selection.reasoningEffort} tabIndex={-1}
      style={{...position,'--effort-ratio':effortIndex/(CHAT_EFFORTS.length-1)}}
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close('effort');}}}>
      <div className="personal-effort-slider">
        <div className="personal-effort-track" aria-hidden="true"><div className="personal-effort-fill"><EffortTrail index={effortIndex}/></div></div>
        <div className="personal-effort-ticks" aria-hidden="true">{CHAT_EFFORTS.map(level=><i key={level}/>)}</div>
        <div className="personal-effort-thumb" aria-hidden="true">{selection.reasoningEffort==='max'&&<EffortAura/>}<EvolutionFigure index={effortIndex}/></div>
        <input type="range" min="0" max={CHAT_EFFORTS.length-1} step="1" value={effortIndex} disabled={disabled}
          aria-label={t('chatEffort')} aria-valuetext={effort}
          onChange={event=>onSelect({...selection,reasoningEffort:CHAT_EFFORTS[Number(event.target.value)]})}/>
      </div>
      <div className="personal-effort-labels">{CHAT_EFFORTS.map((level,index)=><button key={level} type="button" disabled={disabled} style={{'--level-ratio':index/(CHAT_EFFORTS.length-1)}}
        aria-label={t('chatEffort_'+level)} title={t('chatEffort_'+level)} aria-pressed={selection.reasoningEffort===level}
        onClick={()=>onSelect({...selection,reasoningEffort:level})}>{t('chatEffortLabel_'+level)}</button>)}</div>
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
