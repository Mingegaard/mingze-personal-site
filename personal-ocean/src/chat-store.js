import { DEFAULT_SELECTION, validSelection, normalizeSelection } from '../chat-options.mjs';
const KEY = 'personal-ocean.chats.v1';
const SELECTION_VERSION = 2;
// Version each preference and conversation, including historic uses of the same model ID.
// Only choices explicitly saved by this version may restore an enabled reasoning level.
const restoreSelection = (value, version) => version === SELECTION_VERSION ? normalizeSelection(value) : {...DEFAULT_SELECTION};
export const orderedChats = chats => [...chats].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
export function createChatStore({requestChat} = {}) {
  let saved = [], projects = [];
  try {
    const data = JSON.parse(localStorage.getItem(KEY + '.projects'));
    const legacy = data === null ? JSON.parse(localStorage.getItem(KEY)) : data?.chats;
    if (Array.isArray(data?.projects)) projects = data.projects
      .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
      .map(p => ({id:p.id, name:p.name.slice(0,80)}));
    const projectIds = new Set(projects.map(p => p.id));
    if (Array.isArray(legacy)) saved = legacy
      .filter(c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages))
      .map(c => ({...c, selection:restoreSelection(c.selection,c.selectionVersion), selectionVersion:SELECTION_VERSION, projectId:projectIds.has(c.projectId) ? c.projectId : null,
        messages:c.messages.filter(m => ['user','assistant'].includes(m?.role) && typeof m.content === 'string')}));
  } catch {}
  let selection = DEFAULT_SELECTION;
  try { const savedSelection = JSON.parse(localStorage.getItem(KEY + '.selection')); selection = restoreSelection(savedSelection,savedSelection?.selectionVersion); } catch {}
  let state = { chats:saved, projects, expandedProjects:[], projectId:null, projectView:false, selected:null, busy:false, error:null, storageError:false, draft:'', selection }; 
  const listeners = new Set();
  let controller;
  const publish = (patch, persist = true) => {
    state = {...state, ...patch};
    if (persist && (patch.chats || patch.projects)) {
      try { localStorage.setItem(KEY + '.projects', JSON.stringify({projects:state.projects,chats:state.chats})); state = {...state,storageError:false}; }
      catch { state = {...state,storageError:true}; }
    }
    listeners.forEach(fn => fn());
  };
  const commit = patch => {
    const next = {...state,...patch};
    try {localStorage.setItem(KEY+'.projects',JSON.stringify({projects:next.projects,chats:next.chats}));}
    catch {publish({storageError:true});return false;}
    publish({...patch,storageError:false},false);
    return true;
  };
  const clearActive = {selected:null,projectId:null,projectView:false,busy:false,error:null,draft:''};
  const updateChat = (id,patch,extra={}) => {
    if (!state.chats.some(c=>c.id===id)) return false;
    return commit({chats:state.chats.map(c=>c.id===id?{...c,...patch}:c),...extra});
  };
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    draft: draft => publish({draft}),
    setSelection: selection => {
      if (!validSelection(selection) || state.busy) return;
      selection = normalizeSelection(selection);
      try { localStorage.setItem(KEY + '.selection', JSON.stringify({...selection,selectionVersion:SELECTION_VERSION})); } catch {}
      publish({selection, chats:state.chats.map(c => c.id === state.selected ? {...c, selection, selectionVersion:SELECTION_VERSION} : c)});
    },
    createProject: name => {
      name = name.trim().slice(0,80);
      if (!name) return null;
      const project = {id:crypto.randomUUID(),name};
      controller?.abort(); controller = null;
      publish({projects:[...state.projects,project],expandedProjects:[...state.expandedProjects,project.id],projectId:project.id,projectView:true,selected:null,busy:false,error:null,draft:''});
      return project.id;
    },
    renameProject: (id,name) => {
      name=name.trim().slice(0,80);
      return !!name && state.projects.some(p=>p.id===id) && commit({projects:state.projects.map(p=>p.id===id?{...p,name}:p)});
    },
    renameChat: (id,title) => !!title.trim() && updateChat(id,{title:title.trim().slice(0,80)}),
    pinChat: (id,pinned) => updateChat(id,{pinned:!!pinned}),
    archiveChat: (id,archived) => {
      const active=archived && state.selected===id;
      const result=updateChat(id,{archived:!!archived},active?clearActive:{});
      if(result && active){controller?.abort();controller=null;}
      return result;
    },
    deleteChat: id => {
      if(!state.chats.some(c=>c.id===id)) return false;
      const active=state.selected===id;
      const result=commit({chats:state.chats.filter(c=>c.id!==id),...(active?clearActive:{})});
      if(result && active){controller?.abort();controller=null;}
      return result;
    },
    moveChat: (id,projectId) => {
      if(projectId!==null && !state.projects.some(p=>p.id===projectId)) return false;
      return updateChat(id,{projectId},{...(state.selected===id?{projectId}:{}),
        expandedProjects:projectId?[...new Set([...state.expandedProjects,projectId])]:state.expandedProjects});
    },
    forkChat: (id,title) => {
      const source=state.chats.find(c=>c.id===id);
      if(!source) return false;
      const chat={...source,id:crypto.randomUUID(),title:title.slice(0,80),archived:false,pinned:false,
        messages:source.messages.map(m=>({...m}))};
      if(!commit({chats:[chat,...state.chats]})) return false;
      store.select(chat.id);return true;
    },
    reorderProject: (id,beforeId) => {
      if(id===beforeId || !state.projects.some(p=>p.id===beforeId)) return false;
      const project=state.projects.find(p=>p.id===id);if(!project) return false;
      const projects=state.projects.filter(p=>p.id!==id);projects.splice(projects.findIndex(p=>p.id===beforeId),0,project);
      return commit({projects});
    },
    openProject: projectId => {
      if (!state.projects.some(p => p.id === projectId)) return;
      controller?.abort(); controller = null;
      publish({projectId,expandedProjects:[...new Set([...state.expandedProjects,projectId])],projectView:true,selected:null,busy:false,error:null,draft:''});
    },
    collapseProject: projectId => publish({expandedProjects:state.expandedProjects.filter(id=>id!==projectId)}),
    deleteProject: projectId => {
      if (!state.projects.some(p=>p.id===projectId)) return false;
      const projects = state.projects.filter(p=>p.id!==projectId);
      const chats = state.chats.filter(c=>c.projectId!==projectId);
      // Commit deletion before changing the UI, so a failed save cannot resurrect it on reload.
      try { localStorage.setItem(KEY + '.projects',JSON.stringify({projects,chats})); }
      catch { publish({storageError:true}); return false; }
      const active = state.projectId === projectId;
      if (active) { controller?.abort(); controller = null; }
      publish({projects,chats,storageError:false,expandedProjects:state.expandedProjects.filter(id=>id!==projectId),
        ...(active ? {projectId:null,projectView:false,selected:null,busy:false,error:null,draft:''} : {})},false);
      return true;
    },
    newChat: (projectId = null) => {
      if (projectId !== null && !state.projects.some(p => p.id === projectId)) return;
      controller?.abort(); controller = null;
      publish({projectId,expandedProjects:projectId ? [...new Set([...state.expandedProjects,projectId])] : state.expandedProjects,projectView:false,selected:null,busy:false,error:null,draft:''});
    },
    select: selected => {
      const chat = state.chats.find(c => c.id === selected);
      if (!chat || chat.archived) return;
      controller?.abort(); controller = null;
      publish({selected,projectId:chat.projectId ?? null,expandedProjects:chat.projectId ? [...new Set([...state.expandedProjects,chat.projectId])] : state.expandedProjects,projectView:false,busy:false,error:null,draft:'',selection:normalizeSelection(chat.selection ?? state.selection)});
    },
    stop: () => { controller?.abort(); controller = null; publish({busy:false}); },
    async send() {
      const content = state.draft.trim();
      if (!content || state.busy || state.projectView) return;
      const previous = state.chats.find(c => c.id === state.selected);
      const chat = {...(previous ?? {id:crypto.randomUUID(), title:content.slice(0,36), projectId:state.projectId, messages:[]})};
      chat.selection = {...state.selection};
      chat.selectionVersion = SELECTION_VERSION;
      chat.messages = [...chat.messages, {role:'user',content}];
      const pending = new AbortController(); controller = pending;
      publish({chats:[chat,...state.chats.filter(c => c.id !== chat.id)],selected:chat.id,draft:'',busy:true,error:null});
      try {
        // Keep the most recent turns within the server's bounded text budget.
        const messages = []; let size = 0;
        for (const message of [...chat.messages].reverse().slice(0,24)) {
          if (size + message.content.length > 50000) break;
          messages.unshift(message); size += message.content.length;
        }
        let result;
        if (requestChat) {
          result = await requestChat({messages,...chat.selection,signal:pending.signal});
        } else {
          const response = await fetch('/api/personal-chat', {method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,...chat.selection}),signal:pending.signal});
          result = await response.json();
          if (!response.ok) throw new Error(result.error ?? 'unavailable');
        }
        if (typeof result?.content !== 'string') throw new Error(result?.error ?? 'unavailable');
        if (controller !== pending) return;
        publish({chats:state.chats.map(c => c.id === chat.id ? {...c,messages:[...c.messages,{role:'assistant',content:result.content}]} : c),busy:false});
      } catch (error) {
        if (controller !== pending) return;
        publish({busy:false,error:error.name === 'AbortError' ? null : error.message,draft:content});
      } finally { if (controller === pending) controller = null; }
    },
    dispose: () => { controller?.abort(); listeners.clear(); },
  };
  return store;
}
