import React, { useId, useRef, useState } from 'react';

const paths = {
 rename:'m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-5-5L3 14l-1 7Z',
 pin:'m15 3 6 6-4 1-4 4v4l-3-3-6 6 6-6-3-3h4l4-4Z',
 fork:'M6 3v12a4 4 0 0 0 4 4h8M6 9h7a5 5 0 0 0 5-5m-3 12 3 3-3 3',
 copy:'M9 8h11v13H9zM5 16H3V3h11v2',
 archive:'M3 3h18v5H3zM5 8v13h14V8M9 12h6',
 restore:'M3 3h18v5H3zM5 8v13h14V8m-10 7 3-3 3 3m-3-3v6',
 trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
 move:'M3 18V5h7l3 3h8v5M3 18h9m3-3 4 3-4 3m-3-3h7',
 remove:'M3 18V5h7l3 3h8v8M3 18h8m5-2 5 5m0-5-5 5',
 plus:'M12 4v16M4 12h16',
 back:'m14 5-7 7 7 7',
 chat:'M4 4h16v13H9l-5 4Z',
};
export function ManagementIcon({name}) {
 if(name==='more') return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>;
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[name]??paths.chat} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function ManagementMenu({kind,item,state,store,t,request,open}) {
 const menu=useRef(null),trigger=useRef(null),id=useId();
 const [pane,setPane]=useState('main'),[notice,setNotice]=useState('');
 const chat=kind==='chat';
 const close=()=>{menu.current?.hidePopover();trigger.current?.focus();};
 const focusFirst=()=>requestAnimationFrame(()=>menu.current?.querySelector('button:not(:disabled)')?.focus());
 const show=()=>{
   setPane('main');setNotice('');
   const r=trigger.current.getBoundingClientRect(),width=Math.min(232,innerWidth-24);
   const height=chat?430:158;
   Object.assign(menu.current.style,{width:`${width}px`,left:`${Math.max(12,Math.min(r.right-width,innerWidth-width-12))}px`,top:`${Math.max(12,Math.min(r.bottom+6,innerHeight-height-12))}px`,maxHeight:`${innerHeight-24}px`});
   focusFirst();
 };
 const run=fn=>{if(fn()!==false) close();};
 const ask=action=>{close();request({action,kind,item});};
 const keydown=event=>{
   if(event.key==='Escape'){event.preventDefault();close();return;}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
   event.preventDefault();const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')];
   const index=buttons.indexOf(document.activeElement);
   const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
   buttons[next]?.focus();
 };
 const action=(key,icon,fn,danger=false)=><button type="button" role="menuitem" className={danger?'is-danger':undefined} onClick={fn}><ManagementIcon name={icon}/><span>{t(key)}</span>{key==='manageMove'&&<span className="personal-management-chevron" aria-hidden="true">›</span>}</button>;
 return <>
   <button ref={trigger} type="button" className="personal-project-more personal-management-trigger" aria-label={t('manageMore',{name:chat?item.title:item.name})}
     aria-haspopup="menu" popoverTarget={id} onClick={show}><ManagementIcon name="more"/></button>
   <div id={id} ref={menu} popover="auto" role="menu" className="personal-management-menu" aria-label={t('manageMore',{name:chat?item.title:item.name})} onKeyDown={keydown}>
     {pane==='move'?<>
       {action('manageBack','back',()=>{setPane('main');focusFirst();})}<div role="separator"/>
       <div className="personal-management-caption">{t('manageMove')}</div>
       {state.projects.map(p=><button key={p.id} type="button" role="menuitem" disabled={p.id===item.projectId} onClick={()=>run(()=>store.moveChat(item.id,p.id))}><ManagementIcon name="move"/><span>{p.name}</span>{p.id===item.projectId&&<small>✓</small>}</button>)}
       {state.projects.length===0&&<p className="personal-management-caption">{t('projectCreate')}</p>}
     </>:<>
       {!chat&&action('projectNewChat','plus',()=>run(()=>{store.newChat(item.id);open();}))}
       {action('manageRename','rename',()=>ask('rename'))}
       {chat&&<>
         {!item.archived&&action(item.pinned?'manageUnpin':'managePin','pin',()=>run(()=>store.pinChat(item.id,!item.pinned)))}
         {action('manageFork','fork',()=>run(()=>{const ok=store.forkChat(item.id,t('manageForkTitle',{name:item.title}));if(ok)open();return ok;}))}
         {action('manageCopyId','copy',async()=>{try{await navigator.clipboard.writeText(item.id);setNotice(t('manageCopied'));}catch{setNotice(t('manageCopyFailed'));}})}
         <div role="separator"/>
         {action(item.archived?'manageRestore':'manageArchive',item.archived?'restore':'archive',()=>run(()=>store.archiveChat(item.id,!item.archived)))}
       </>}
       {!chat&&<div role="separator"/>}
       {action(chat?'manageDelete':'projectDelete','trash',()=>ask('delete'),true)}
       {chat&&<>
         <div role="separator"/>
         <div className="personal-management-caption">{state.projects.find(p=>p.id===item.projectId)?.name??t('chatRecent')}</div>
         {action('manageMove','move',()=>{setPane('move');focusFirst();})}
         {item.projectId&&action('manageRemove','remove',()=>run(()=>store.moveChat(item.id,null)))}
       </>}
     </>}
     {notice&&<p role="status" className="personal-management-caption">{notice}</p>}
   </div>
 </>;
}

export function ChatRow({chat,state,store,t,open,request}) {
 return <div className="personal-conversation-row" data-active={state.selected===chat.id} onContextMenu={event=>{event.preventDefault();const trigger=event.currentTarget.querySelector('.personal-management-trigger');setTimeout(()=>{if(trigger?.isConnected)trigger.click();},100);}}>
   <button type="button" className="personal-conversation-link" title={chat.title} aria-current={state.selected===chat.id?'page':undefined}
     onClick={()=>{if(!chat.archived){store.select(chat.id);open();}}} onDoubleClick={()=>request({action:'rename',kind:'chat',item:chat})}>
     <span>{chat.title}</span>{chat.pinned&&<span className="personal-chat-pin" aria-label={t('managePin')}><ManagementIcon name="pin"/></span>}
   </button>
   <ManagementMenu kind="chat" item={chat} state={state} store={store} t={t} request={request} open={open}/>
 </div>;
}

export function useManagementDialog({store,t}) {
 const dialog=useRef(null),input=useRef(null),cancel=useRef(null);
 const [pending,setPending]=useState(null),[name,setName]=useState(''),[error,setError]=useState(false);
 const titleId=useId(),descriptionId=useId();
 const request=value=>{setPending(value);setName(value.kind==='project'?value.item.name:value.item.title);setError(false);dialog.current.showModal();requestAnimationFrame(()=>{if(value.action==='rename'){input.current?.focus();input.current?.select();}else cancel.current?.focus();});};
 const rename=pending?.action==='rename',project=pending?.kind==='project';
 const submit=event=>{
   event.preventDefault();if(!pending)return;
   const {id}=pending.item;
   const ok=rename?(project?store.renameProject(id,name):store.renameChat(id,name)):(project?store.deleteProject(id):store.deleteChat(id));
   if(ok)dialog.current.close();else setError(true);
 };
 const state=store.getSnapshot();
 const title=rename?t('manageRename'):t(project?'projectDelete':'manageDeleteChat');
 return {request,dialog:<dialog ref={dialog} className="personal-project-dialog" aria-labelledby={titleId} aria-describedby={!rename?descriptionId:undefined} onClose={()=>setPending(null)}>
   <form onSubmit={submit}>
     <h2 id={titleId}>{title}</h2>
     {rename?<label>{t(project?'projectName':'manageTitle')}<input ref={input} value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/></label>:
       <p id={descriptionId}>{project?t('projectDeleteConfirm',{name:pending?.item.name??'',count:state.chats.filter(c=>c.projectId===pending?.item.id).length}):t('manageDeleteConfirm',{name:pending?.item.title??''})}</p>}
     {error&&<p role="alert">{t('chatStorageError')}</p>}
     <div className="personal-project-dialog-actions"><button ref={cancel} type="button" onClick={()=>dialog.current.close()}>{t('projectCancel')}</button><button type="submit" className={!rename?'personal-project-delete-confirm':undefined} disabled={rename&&!name.trim()}>{rename?t('manageSave'):t('manageDelete')}</button></div>
   </form>
 </dialog>};
}
