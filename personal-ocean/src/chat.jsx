import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FolderIcon, ProjectNavigation, ProjectPage } from './chat-projects.jsx';
import { ChatRow, useManagementDialog } from './chat-management.jsx';
import { orderedChats } from './chat-store.js';
import { ChatModelSelect } from './chat-model-select.jsx';

function fitComposer(input) {
  if (!input) return;
  input.style.height = 'auto';
  const maxHeight = parseFloat(getComputedStyle(input).maxHeight);
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > input.clientHeight ? 'auto' : 'hidden';
}

export function PersonalChat({store, t}) {
  const state = useSyncExternalStore(store.subscribe,store.getSnapshot);
  const chat = state.chats.find(c => c.id === state.selected);
  const messages = chat?.messages ?? [];
  const project = state.projects.find(p => p.id === state.projectId);
  const active = messages.length > 0;
  const showProject = state.projectView && !!project;
  const end = useRef(null), composerInput = useRef(null);
  useLayoutEffect(() => { fitComposer(composerInput.current); },[state.draft,active,showProject]);
  useEffect(() => {
    const input = composerInput.current;
    if (!input) return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      fitComposer(input);
    });
    observer.observe(input);
    return () => observer.disconnect();
  },[showProject]);
  useEffect(() => { end.current?.scrollIntoView({block:'nearest'}); },[messages.length,state.busy]);
  if (showProject) return <ProjectPage project={project} state={state} store={store} t={t}/>;
  return <section className="personal-chat" data-phase={active ? 'active' : 'hero'} aria-label={t('chatLabel')}>
    <div className="personal-chat-scroll">
      {project && <button type="button" className="personal-chat-project-context" onClick={()=>store.openProject(project.id)}><FolderIcon/><span>{project.name}</span></button>}
      {messages.length === 0 ? <h1 className="personal-chat-title">{t('homeTitle')}</h1> :
        <div className="personal-chat-messages" aria-live="polite">
          {messages.map((message,index) => <article key={index} className={`personal-message personal-message-${message.role}`} aria-label={t(message.role === 'user' ? 'chatYou' : 'chatAssistant')}>
            <div>{message.content}</div>
          </article>)}
          {state.busy && <p className="personal-chat-status" role="status">{t('chatThinking')}</p>}
          <div ref={end}/>
        </div>}
      <form className="personal-chat-composer" data-composer-card onSubmit={event => {event.preventDefault(); void store.send();}}>
        <textarea ref={composerInput} aria-label={t('chatPlaceholder')} placeholder={t('chatPlaceholder')} maxLength={8000}
          value={state.draft} onChange={e=>store.draft(e.target.value)} rows={active ? 1 : 3}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void store.send();}}}/>
        <div className="personal-chat-actions">
          <ChatModelSelect selection={state.selection} onSelect={store.setSelection} disabled={state.busy} t={t}/>
          {state.busy ? <button className="personal-chat-submit" type="button" aria-label={t('chatStop')} onClick={store.stop}>■</button> :
            <button className="personal-chat-submit" type="submit" disabled={!state.draft.trim()} aria-label={t('chatSend')}>↑</button>}
        </div>
        {state.error && <p className="personal-chat-error" role="alert">{t(state.error === 'balance' ? 'chatBalance' : 'chatError')}</p>}
      </form>
      {state.storageError && <p className="personal-chat-error" role="alert">{t('chatStorageError')}</p>}
    </div>
  </section>;
}

export function ChatHistory({store,t,open,wide}) {
  const state = useSyncExternalStore(store.subscribe,store.getSnapshot);
  const [showArchived,setShowArchived] = useState(false);
  const management = useManagementDialog({store,t});
  if (!wide) return null;
  const recent=orderedChats(state.chats.filter(chat=>!chat.projectId&&!chat.archived));
  const archived=state.chats.filter(chat=>chat.archived);
  return <section className="personal-chat-history" aria-label={t('chatHistory')}>
    <ProjectNavigation state={state} store={store} t={t} open={open} request={management.request}/>
    <h2 className="personal-recent-heading">{t('chatRecent')}</h2>
    {recent.length ? recent.map(chat=><ChatRow key={chat.id} chat={chat} state={state} store={store} t={t} open={open} request={management.request}/>) : <p>{t('chatHistoryEmpty')}</p>}
    {archived.length>0&&<>
      <button type="button" className="personal-archive-heading" aria-expanded={showArchived} onClick={()=>setShowArchived(value=>!value)}>{t('manageArchived')} <span>{archived.length}</span><span>{showArchived?'⌃':'⌄'}</span></button>
      {showArchived&&archived.map(chat=><ChatRow key={chat.id} chat={chat} state={state} store={store} t={t} open={open} request={management.request}/>)}
    </>}
    {state.storageError&&<p role="alert">{t('chatStorageError')}</p>}
    {management.dialog}
  </section>;
}
