import React, { useState, useRef, useMemo, useLayoutEffect } from 'react';
import { makeAccountActivity, formatTokens } from './profile-data.js';

export function ProfileIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>;
}
const modes = ['daily','weekly','total'];
const heatLevel = tokens => tokens === 0 ? 0 : tokens < 18000000 ? 1 : tokens < 40000000 ? 2 : tokens < 65000000 ? 3 : 4;
function Activity({ data, t, locale }) {
  const date = value => new Intl.DateTimeFormat(locale, {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value));
  const monthName = value => new Intl.DateTimeFormat(locale, {month:'short',timeZone:'UTC'}).format(new Date(value));
  const [mode,setMode] = useState('daily');
  const [tooltip,setTooltip] = useState(null);
  const [active,setActive] = useState(data.cells.findLastIndex(Boolean));
  const grid = useRef(null), section = useRef(null), scroll = useRef(null);
  useLayoutEffect(() => {
    const element = scroll.current;
    // On small phones, keep readable cells and reveal the newest dates first.
    const revealLatest = () => { element.scrollLeft = element.scrollWidth - element.clientWidth; };
    revealLatest();
    const resize = new ResizeObserver(revealLatest);
    resize.observe(element);
    return () => resize.disconnect();
  }, [data]);
  const weeklyTotals = useMemo(() => {
    let total = 0;
    return data.weeks.map(week => ({ ...week, cumulative: total += week.tokens }));
  }, [data]);
  const maxWeek = Math.max(1,...data.weeks.map(week=>week.tokens));
  const show = (element, label, tokens) => {
    const box = element.getBoundingClientRect(), parent = section.current.getBoundingClientRect();
    const width = Math.min(240, parent.width - 32);
    const x = Math.max(16, Math.min(box.left - parent.left + box.width / 2 - width / 2, parent.width - width - 16));
    const above = box.top - parent.top > 68;
    setTooltip({label, tokens, x, y: (above ? box.top : box.bottom) - parent.top + (above ? -10 : 10), width, above});
  };
  const move = (event,index) => {
    const delta = {ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7}[event.key];
    if (!delta) return;
    const next = index + delta;
    if (data.cells[next]) { event.preventDefault(); setActive(next); grid.current?.querySelector(`[data-day-index="${next}"]`)?.focus(); }
  };
  return <section ref={section} className="profile-activity" aria-labelledby="activity-title" onScrollCapture={()=>setTooltip(null)} onKeyDown={event=>{if(event.key==='Escape')setTooltip(null);}}>
    <div className="profile-section-heading"><h2 id="activity-title">{t('activity')}</h2><div className="profile-view-switch" aria-label={t('views')}>{modes.map(key=><button key={key} aria-pressed={mode===key} onClick={()=>{setMode(key);setTooltip(null);}}>{t(key)}</button>)}</div></div>
    <div className="profile-chart-scroll" ref={scroll} onMouseLeave={()=>setTooltip(null)}>
      <div className="profile-chart" style={{'--week-count':data.weeks.length}}>
        {mode==='daily' ? <div className="profile-heatmap" ref={grid} aria-label={t('dailyChart')}>{data.cells.map((day,index)=>day?<button key={day.date} data-day-index={index} className={`profile-heat-cell heat-${heatLevel(day.tokens)}`} tabIndex={index===active?0:-1} aria-label={`${date(day.date)}, ${formatTokens(day.tokens, locale)} Token`} onMouseEnter={event=>show(event.currentTarget,date(day.date),day.tokens)} onMouseLeave={()=>setTooltip(null)} onFocus={event=>{setActive(index);show(event.currentTarget,date(day.date),day.tokens);}} onBlur={()=>setTooltip(null)} onClick={event=>show(event.currentTarget,date(day.date),day.tokens)} onKeyDown={event=>move(event,index)}/>:<span className="profile-heat-cell heat-outside" key={`empty-${index}`}/>)}</div> :
        <div className="profile-block-chart" aria-label={t(mode==='weekly'?'weeklyChart':'totalChart')}>{weeklyTotals.map((week,index)=>{
          const tokens = mode==='weekly' ? week.tokens : week.cumulative;
          const height = tokens / (mode==='weekly' ? maxWeek : Math.max(1,data.chartTotal)) * 7;
          const label = mode==='weekly' ? `${date(week.date)} — ${date(week.end)}` : t('through', {date:date(week.end)});
          const open = event => show(event.currentTarget,label,tokens);
          return <button key={week.date} className="profile-block-column" aria-label={`${label}, ${formatTokens(tokens, locale)} Token`} onMouseEnter={open} onMouseLeave={()=>setTooltip(null)} onFocus={open} onBlur={()=>setTooltip(null)} onClick={open} onKeyDown={event=>{
            const next = event.key==='ArrowLeft'?index-1:event.key==='ArrowRight'?index+1:null;
            if(next!==null && next>=0 && next<weeklyTotals.length){event.preventDefault();event.currentTarget.parentElement.children[next]?.focus();}
          }}>{Array.from({length:7},(_,row)=>{
            const fill = Math.max(0,Math.min(1,height-(6-row)));
            return <span key={row} className={fill>0?'profile-block-filled':'heat-0'} style={fill>0?{'--block-opacity':.35+.65*fill}:undefined}/>;
          })}</button>;
        })}</div>}
        <div className="profile-months" aria-hidden="true">{data.months.map((month,index)=><span key={index} style={{gridColumn:month.column+1}}>{monthName(month.date)}</span>)}</div>
      </div>
    </div>
    {tooltip && <div className="profile-tooltip" role="tooltip" style={{left:tooltip.x,top:tooltip.y,maxWidth:tooltip.width,transform:tooltip.above?'translateY(-100%)':undefined}}><span>{tooltip.label}</span><span>{formatTokens(tooltip.tokens, locale)} Token</span></div>}
  </section>;
}
export function ProfilePage({ t, getLocale }) {
  const locale = getLocale();
  const data = useMemo(()=>makeAccountActivity(window.__PERSONAL_CODEX_USAGE__),[]);
  const duration = data.duration == null ? '—' : t('durationReal',{hours:Math.floor(data.duration/3600),minutes:Math.floor(data.duration%3600/60)});
  const updated = data.fetchedAt ? new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}).format(new Date(data.fetchedAt)) : null;
  const stats = [[formatTokens(data.total,locale),t('totalTokens')],[formatTokens(data.peak,locale),t('peak')],[duration,t('duration')],[data.longest == null ? '—' : t('days',{count:data.longest}),t('longest')],[data.current == null ? '—' : t('days',{count:data.current}),t('current')]];
  return <section className="personal-profile" aria-label={t('profile')}><div className="profile-wrap">
    <header className="profile-heading"><h1>{t('activity')}</h1>{updated && <p className="profile-updated">{t('updated',{time:updated})}</p>}</header>
    <div className="profile-stats" aria-label={t('stats')}>{stats.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {data.available ? <Activity key={locale} data={data} t={t} locale={locale}/> : <section className="profile-activity"><h2>{t('activity')}</h2><p>{t('unavailable')}</p></section>}
  </div></section>;
}
