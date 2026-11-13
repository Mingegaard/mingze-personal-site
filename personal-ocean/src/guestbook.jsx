import React, { useEffect, useId, useRef, useState } from 'react';

const LIMIT = 1000;
const mergeComments = (before, after) => [...new Map([...before, ...after].map(comment => [comment.id, comment])).values()];
const nameOf = comment => String(comment?.displayName || comment?.id?.slice(0, 8) || 'Visitor');

export function GuestbookIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4.5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9l-5.5 3v-3H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/></svg>;
}

function VisitorAvatar({ seed }) {
  let hash = 2166136261;
  for (const char of String(seed || 'visitor')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = [208, 220, 192, 241, 174][hash % 5];
  const cells = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if ((hash >>> (y * 3 + x)) & 1) {
      cells.push(<rect key={`${x}-${y}`} x={9 + x * 6} y={9 + y * 6} width="6" height="6" rx="1"/>);
      if (x !== 2) cells.push(<rect key={`${4-x}-${y}`} x={9 + (4 - x) * 6} y={9 + y * 6} width="6" height="6" rx="1"/>);
    }
  }
  return <svg className="guestbook-avatar" viewBox="0 0 48 48" aria-hidden="true" style={{'--visitor-hue':hue}}><rect className="guestbook-avatar-bg" width="48" height="48" rx="17"/><g className="guestbook-avatar-tiles">{cells}</g></svg>;
}

function errorCopy(error, t, fallback) {
  const code = String(error?.code || error?.message || '');
  if (/rate.?limit|too.?many|429/i.test(code)) return t('rateLimited');
  if (/unconfigured|unavailable|disabled/i.test(code)) return t('unavailable');
  if (/invalid|too.?long|empty/i.test(code)) return t('invalid');
  return t(fallback);
}

function CommentTime({ value, t }) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 1000));
  const locale = t('locale');
  const absolute = new Intl.DateTimeFormat(locale, { dateStyle:'medium', timeStyle:'short' }).format(date);
  let label = t('justNow');
  if (seconds >= 60 && seconds < 604800) {
    const [unit, divisor] = seconds < 3600 ? ['minute',60] : seconds < 86400 ? ['hour',3600] : ['day',86400];
    label = new Intl.RelativeTimeFormat(locale, { numeric:'auto' }).format(-Math.floor(seconds / divisor), unit);
  } else if (seconds >= 604800) label = new Intl.DateTimeFormat(locale, { month:'short', day:'numeric', ...(date.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{}) }).format(date);
  return <time dateTime={date.toISOString()} title={absolute}>{label}</time>;
}

function MessageComposer({ t, onSubmit, target, onCancel }) {
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const input = useRef(null), pending = useRef(false), mounted = useRef(true);
  const errorId = useId();
  const length = [...draft].length;
  useEffect(() => { mounted.current=true; return () => {mounted.current=false;}; },[]);
  useEffect(() => { if(target) input.current?.focus(); },[target?.id]);
  const submit = async event => {
    event?.preventDefault();
    if (pending.current || !draft.trim() || length > LIMIT) return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    try {
      await onSubmit(draft.trim());
      if (mounted.current) {setDraft('');setNotice(t(target?'replyPosted':'posted'));}
    } catch (reason) {if (mounted.current) setError(errorCopy(reason,t,'postError'));}
    finally {pending.current=false;if (mounted.current) setBusy(false);}
  };
  return <form className={`guestbook-composer${target?' guestbook-composer-reply':''}`} onSubmit={submit}>
    {target && <div className="guestbook-reply-context"><span>{t('replyTo',{name:nameOf(target).replace(/^@/,'')})}</span><button type="button" className="guestbook-text-button" disabled={busy} onClick={onCancel}>{t('cancel')}</button></div>}
    <textarea ref={input} value={draft} rows={target?2:3} maxLength={LIMIT*2} placeholder={target?t('replyTo',{name:nameOf(target).replace(/^@/,'')}):t('placeholder')} aria-label={target?t('replyTo',{name:nameOf(target).replace(/^@/,'')}):t('placeholder')} aria-describedby={error?errorId:undefined} aria-invalid={!!error} disabled={busy}
      onChange={event=>{setDraft([...event.target.value].slice(0,LIMIT).join(''));setError('');setNotice('');}} onKeyDown={event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}}/>
    <div className="guestbook-composer-footer"><span className="guestbook-character-count">{t('characters',{count:length,max:LIMIT})}</span><button className="guestbook-submit" type="submit" disabled={busy||!draft.trim()}>{busy?t('posting'):t(target?'reply':'post')}<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div>
    {error && <p className="guestbook-error" role="alert" id={errorId}>{error}</p>}
    <span className="guestbook-sr-only" role="status">{notice}</span>
  </form>;
}

function Message({ comment, root, t, onReply, replyTo, disabled = false }) {
  return <article className={`guestbook-message${root?' guestbook-message-root':''}`}>
    <VisitorAvatar seed={comment.avatarSeed || comment.id}/>
    <div className="guestbook-message-body"><div className="guestbook-message-identity"><span className="guestbook-name">{nameOf(comment)}</span></div>
      <p className="guestbook-message-text">{replyTo && <span className="guestbook-reply-recipient">{t('replyTo',{name:String(replyTo).replace(/^@/,'')})}<span aria-hidden="true"> · </span></span>}{comment.content}</p>
      <div className="guestbook-message-meta"><CommentTime value={comment.createdAt} t={t}/><button type="button" className="guestbook-text-button" disabled={disabled} onClick={()=>onReply(comment)}>{t('reply')}</button></div>
    </div>
  </article>;
}

function MessageThread({ comment, t, api, onReplyPosted }) {
  const [expanded,setExpanded] = useState(false);
  const [target,setTarget] = useState(null);
  const [posting,setPosting] = useState(false);
  const [replies,setReplies] = useState({items:comment.replies || [],cursor:null,loaded:false,busy:false,error:''});
  const controller = useRef(null), generation = useRef(0), fetching = useRef(false);
  const repliesId = useId();
  useEffect(() => {const epoch=++generation.current;return ()=>{if(generation.current===epoch)generation.current++;controller.current?.abort();};},[api]);
  const load = async (cursor = null) => {
    if (fetching.current) return;
    fetching.current=true;const epoch=generation.current;
    const pending=new AbortController();controller.current=pending;
    setReplies(value=>({...value,busy:true,error:''}));
    try {
      const result=await api.replies({parentId:comment.id,cursor,signal:pending.signal});
      if(epoch!==generation.current)return;
      setReplies(value=>({...value,items:mergeComments(value.items,result.items).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)),cursor:result.nextCursor??null,loaded:true,busy:false}));
    } catch(error) {if(epoch===generation.current&&error?.name!=='AbortError')setReplies(value=>({...value,busy:false,error:errorCopy(error,t,'loadError')}));}
    finally {if(controller.current===pending){controller.current=null;fetching.current=false;}}
  };
  const toggle = () => {
    if(!expanded&&!replies.loaded)void load();
    setExpanded(value=>!value);
  };
  const postReply = async content => {
    const epoch=generation.current;
    setPosting(true);
    try {
      const created=await api.post({content,parentId:comment.id,...(target?.id!==comment.id?{replyToId:target.id}:{})});
      if(epoch!==generation.current)return;
      const reply={...created,...(target?.id!==comment.id&&!created.replyToDisplayName?{replyToId:target.id,replyToDisplayName:nameOf(target)}:{})};
      setReplies(value=>({...value,items:mergeComments(value.items,[reply])}));
      setExpanded(true);setTarget(null);onReplyPosted(comment.id);
      if(!replies.loaded)void load();
    } finally {if(epoch===generation.current)setPosting(false);}
  };
  const count=Math.max(comment.replyCount||0,replies.items.length);
  return <section className="guestbook-thread">
    <Message comment={comment} root t={t} onReply={setTarget} disabled={posting}/>
    {count>0 && <button type="button" className="guestbook-expand" aria-expanded={expanded} aria-controls={repliesId} onClick={toggle}><span className="guestbook-expand-line" aria-hidden="true"/>{t(expanded?'hideReplies':'showReplies',{count})}<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{transform:expanded?'rotate(180deg)':undefined}}><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}
    {expanded && <div className="guestbook-replies" id={repliesId} aria-label={t('replyList')}>
      {replies.items.map(reply=><Message key={reply.id} comment={reply} t={t} onReply={setTarget} disabled={posting} replyTo={reply.replyToId&&reply.replyToId!==comment.id?(reply.replyToDisplayName||nameOf(replies.items.find(item=>item.id===reply.replyToId))):null}/>)}
      {replies.busy && <p className="guestbook-loading" role="status">{t('loading')}</p>}
      {replies.error && <div className="guestbook-inline-error" role="alert"><span>{replies.error}</span><button type="button" className="guestbook-text-button" onClick={()=>load(replies.loaded?replies.cursor:null)}>{t('retry')}</button></div>}
      {replies.cursor&&!replies.error&&<button type="button" className="guestbook-text-button guestbook-more-replies" disabled={replies.busy} onClick={()=>load(replies.cursor)}>{t(replies.busy?'loading':'moreReplies')}<span aria-hidden="true"> ↓</span></button>}
    </div>}
    {target && <div className="guestbook-reply-form"><MessageComposer t={t} target={target} onSubmit={postReply} onCancel={()=>setTarget(null)}/></div>}
  </section>;
}

export function GuestbookPage({ t, api }) {
  const [feed,setFeed] = useState({items:[],cursor:null,busy:true,error:''});
  const generation = useRef(0), controller = useRef(null), fetching = useRef(false);
  const load = async (cursor = null) => {
    if(fetching.current)return;
    fetching.current=true;const epoch=generation.current;
    const pending=new AbortController();controller.current=pending;
    setFeed(value=>({...value,busy:true,error:''}));
    try {
      const result=await api.list({cursor,signal:pending.signal});
      if(epoch!==generation.current)return;
      setFeed(value=>({items:mergeComments(value.items,result.items),cursor:result.nextCursor??null,busy:false,error:''}));
    } catch(error) {if(epoch===generation.current&&error?.name!=='AbortError')setFeed(value=>({...value,busy:false,error:errorCopy(error,t,'loadError')}));}
    finally {if(controller.current===pending){controller.current=null;fetching.current=false;}}
  };
  useEffect(() => {
    generation.current++;fetching.current=false;setFeed({items:[],cursor:null,busy:true,error:''});
    void load();
    return ()=>{generation.current++;controller.current?.abort();};
  },[api]);
  const post = async content => {
    const epoch=generation.current;
    const created=await api.post({content});
    if(epoch!==generation.current)return;
    setFeed(value=>({...value,items:mergeComments([created],value.items)}));
  };
  const replied = id => setFeed(value=>({...value,items:value.items.map(item=>item.id===id?{...item,replyCount:(item.replyCount||0)+1}:item)}));
  return <section className="personal-guestbook" aria-label={t('guestbook')}><div className="guestbook-wrap">
    <header className="guestbook-heading"><div className="guestbook-heading-symbol"><GuestbookIcon size={25}/></div><h1>{t('guestbook')}</h1><p>{t('intro')}</p></header>
    <MessageComposer t={t} onSubmit={post}/>
    <div className="guestbook-feed" aria-label={t('messageList')} aria-busy={feed.busy}>
      {feed.items.map(comment=><MessageThread key={comment.id} comment={comment} t={t} api={api} onReplyPosted={replied}/>)}
      {!feed.busy&&!feed.error&&!feed.items.length&&<div className="guestbook-empty"><GuestbookIcon size={28}/><h2>{t('emptyTitle')}</h2><p>{t('emptyHint')}</p></div>}
      {feed.busy&&<p className="guestbook-loading" role="status"><span className="guestbook-loading-dot" aria-hidden="true"/>{t('loading')}</p>}
      {feed.error&&<div className="guestbook-feed-error" role="alert"><p>{feed.error}</p><button type="button" className="guestbook-secondary" onClick={()=>load(feed.cursor)}>{t('retry')}</button></div>}
      {feed.cursor&&!feed.error&&<button type="button" className="guestbook-secondary guestbook-load-more" disabled={feed.busy} onClick={()=>load(feed.cursor)}>{t(feed.busy?'loading':'moreMessages')}<span aria-hidden="true"> ↓</span></button>}
    </div>
  </div></section>;
}
