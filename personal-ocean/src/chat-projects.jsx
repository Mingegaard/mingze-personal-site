import React, { useId, useRef, useState } from 'react';
import { ChatRow, ManagementMenu } from './chat-management.jsx';
import { orderedChats } from './chat-store.js';

export function FolderIcon({expanded = false}) {
  if (expanded) return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 18V5a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v2M3 19l2-8h17l-3 9H5a2 2 0 0 1-2-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 2h18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}

const ProjectPlusIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;

function ProjectRow({project,chats,state,store,t,open,request}) {
  const chatsId = useId();
  const expanded = state.expandedProjects.includes(project.id);
  return <div className="personal-project-group">
    <div className="personal-project-row" data-active={state.projectId === project.id}
      draggable onDragStart={event=>{event.dataTransfer.setData('application/x-personal-project',project.id);event.dataTransfer.effectAllowed='move';}}
      onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-personal-project'))event.preventDefault();}}
      onDrop={event=>{event.preventDefault();store.reorderProject(event.dataTransfer.getData('application/x-personal-project'),project.id);}}
      onContextMenu={event=>{event.preventDefault();const trigger=event.currentTarget.querySelector('.personal-management-trigger');setTimeout(()=>{if(trigger?.isConnected)trigger.click();},100);}}>
      <button type="button" className="personal-project-link" aria-expanded={expanded} aria-controls={chatsId}
        title={project.name} onClick={()=>{if(expanded) store.collapseProject(project.id);else {store.openProject(project.id);open();}}}>
        <FolderIcon expanded={expanded}/><span>{project.name}</span>
      </button>
      <ManagementMenu kind="project" item={project} state={state} store={store} t={t} request={request} open={open}/>
      <button type="button" className="personal-project-add-chat" aria-label={t('projectNewNamed',{name:project.name})}
        title={t('projectNewChat')} onClick={()=>{store.newChat(project.id);open();}}><ProjectPlusIcon/></button>
    </div>
    <div id={chatsId} className="personal-project-children" hidden={!expanded}>
      {chats.length ? orderedChats(chats).map(chat=><ChatRow key={chat.id} chat={chat} state={state} store={store} t={t} open={open} request={request}/>) : <p>{t('projectEmpty')}</p>}
    </div>
  </div>;
}

export function ProjectNavigation({state,store,t,open,request}) {
  const dialog = useRef(null), nameInput = useRef(null);
  const [name,setName] = useState('');
  const titleId = useId();
  const grouped = new Map();
  for (const chat of state.chats.filter(c=>!c.archived)) {if (!grouped.has(chat.projectId)) grouped.set(chat.projectId,[]);grouped.get(chat.projectId).push(chat);}
  return <>
    <div className="personal-projects-heading">
      <h2>{t('projects')}</h2>
      <button type="button" className="personal-project-add" aria-label={t('projectCreate')} title={t('projectCreate')}
        onClick={()=>{dialog.current.showModal();nameInput.current?.focus();}}><ProjectPlusIcon/></button>
    </div>
    <div className="personal-project-navigation">
      {state.projects.map(project => <ProjectRow key={project.id} project={project} chats={grouped.get(project.id) ?? []}
        state={state} store={store} t={t} open={open} request={request}/>)}
      {state.projects.length === 0 && <p>{t('projectsEmpty')}</p>}
    </div>
    <dialog ref={dialog} className="personal-project-dialog" aria-labelledby={titleId} onClose={()=>setName('')}
      onClick={event=>{if(event.target === dialog.current) {const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.current.close();}}}>
      <form onSubmit={event=>{event.preventDefault();if(!name.trim()) return;store.createProject(name);dialog.current.close();open();}}>
        <h2 id={titleId}>{t('projectCreate')}</h2>
        <label>{t('projectName')}<input ref={nameInput} value={name} onChange={event=>setName(event.target.value)} maxLength={80} placeholder={t('projectNameHint')} required/></label>
        <p>{t('projectDescription')}</p>
        <div className="personal-project-dialog-actions"><button type="button" onClick={()=>dialog.current.close()}>{t('projectCancel')}</button><button type="submit" disabled={!name.trim()}>{t('projectCreate')}</button></div>
      </form>
    </dialog>
  </>;
}

export function ProjectPage({project,state,store,t}) {
  const chats = orderedChats(state.chats.filter(chat => chat.projectId === project.id && !chat.archived));
  return <section className="personal-chat personal-project-page" aria-label={project.name}>
    <div className="personal-chat-scroll">
      <div className="personal-project-panel">
        <header><div className="personal-project-title"><FolderIcon/><h1>{project.name}</h1></div>
          <button type="button" className="personal-project-start" onClick={()=>store.newChat(project.id)}>+ {t('projectNewChat')}</button></header>
        {chats.length ? <div className="personal-project-conversations" aria-label={t('projectConversations')}>
          {chats.map(chat=><button key={chat.id} type="button" onClick={()=>store.select(chat.id)}>
            <span>{chat.title}</span><small>{chat.messages.at(-1)?.content}</small>
          </button>)}
        </div> : <div className="personal-project-empty"><FolderIcon/><h2>{t('projectEmpty')}</h2><p>{t('projectEmptyHint')}</p></div>}
        {state.storageError && <p className="personal-chat-error" role="alert">{t('chatStorageError')}</p>}
      </div>
    </div>
  </section>;
}
