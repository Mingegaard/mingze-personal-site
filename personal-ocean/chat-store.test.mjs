import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from './src/chat-store.js';

test('model and effort survive reload, follow each conversation, and reach the request', async t => {
  const values = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{
    getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),
  }});
  t.after(()=>{ if(previousStorage) Object.defineProperty(globalThis,'localStorage',previousStorage); else delete globalThis.localStorage; });
  const requests=[];
  t.mock.method(globalThis,'fetch',async(_,options)=>{requests.push(JSON.parse(options.body));return Response.json({content:'ok'});});
  let store=createChatStore();
  const selection={model:'deepseek-v4-flash',reasoningEffort:'high'};
  store.setSelection(selection); store.dispose();
  store=createChatStore();
  assert.deepEqual(store.getSnapshot().selection,selection);
  store.draft('first'); await store.send();
  const first=store.getSnapshot().selected;
  assert.equal(requests[0].model,selection.model);
  assert.equal(requests[0].reasoningEffort,selection.reasoningEffort);
  store.newChat(); store.setSelection({model:'deepseek-v4-flash',reasoningEffort:'off'});
  store.draft('second'); await store.send();
  store.select(first);
  assert.deepEqual(store.getSnapshot().selection,selection);
  store.setSelection({model:'unknown',reasoningEffort:'high'});
  assert.deepEqual(store.getSnapshot().selection,selection);
  store.dispose();
});

function storageFor(t, seed = []) {
  const values = new Map(seed);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),
  }});
  t.after(()=>{if(previous) Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  return values;
}

test('projects and independent chats retain their own membership across reloads and requests', async t => {
  storageFor(t);
  const requests=[];
  t.mock.method(globalThis,'fetch',async(_,options)=>{requests.push(JSON.parse(options.body));return Response.json({content:'reply'});});
  let store=createChatStore();
  assert.equal(store.createProject('  '),null);
  const project=store.createProject('Website');
  assert.equal(store.getSnapshot().projectView,true);
  store.newChat(project); store.draft('project first'); await store.send();
  const first=store.getSnapshot().selected;
  store.newChat(project); store.draft('project second'); await store.send();
  store.newChat();
  assert.equal(store.getSnapshot().projectId,null);
  store.draft('independent'); await store.send();
  const outside=store.getSnapshot().selected;
  assert.equal(store.getSnapshot().chats.filter(c=>c.projectId===project).length,2);
  assert.equal(store.getSnapshot().chats.find(c=>c.id===outside).projectId,null);
  assert.deepEqual(requests[1].messages,[{role:'user',content:'project second'}]);
  assert.equal(requests[1].projectId,undefined);
  assert.equal(requests[1].workspace,undefined);
  store.dispose(); store=createChatStore();
  assert.deepEqual(store.getSnapshot().projects,[{id:project,name:'Website'}]);
  store.select(first); assert.equal(store.getSnapshot().projectId,project);
  assert.equal(store.getSnapshot().projectView,false);
  store.openProject(project); assert.equal(store.getSnapshot().projectView,true);
  store.select(outside); assert.equal(store.getSnapshot().projectId,null);
  store.dispose();
});

test('migrates previous chats to Recent without dropping older conversations', async t => {
  const legacy=Array.from({length:35},(_,i)=>({id:String(i),title:'Old '+i,messages:[{role:'user',content:'hello'}]}));
  storageFor(t,[['personal-ocean.chats.v1',JSON.stringify(legacy)]]);
  let store=createChatStore();
  assert.equal(store.getSnapshot().chats.length,35);
  assert.ok(store.getSnapshot().chats.every(c=>c.projectId===null));
  store.createProject('New project'); store.dispose();
  store=createChatStore();
  assert.equal(store.getSnapshot().chats.length,35);
  assert.equal(store.getSnapshot().projects.length,1);
  store.dispose();
});

test('late replies cannot spill into a newly opened project or another conversation', async t => {
  storageFor(t);
  let resolve;
  t.mock.method(globalThis,'fetch',()=>new Promise(done=>{resolve=done;}));
  const store=createChatStore();
  store.draft('old request'); const pending=store.send();
  const project=store.createProject('Next project');
  resolve(Response.json({content:'late reply'})); await pending;
  assert.equal(store.getSnapshot().projectId,project);
  assert.equal(store.getSnapshot().projectView,true);
  assert.equal(store.getSnapshot().busy,false);
  assert.equal(store.getSnapshot().chats[0].messages.length,1);
  store.dispose();
});

test('deleting a project removes only its chats, survives reload, and ignores late replies', async t => {
  storageFor(t);
  const store=createChatStore();
  const project=store.createProject('Delete me');
  const other=store.createProject('Keep me');
  t.mock.method(globalThis,'fetch',async()=>Response.json({content:'saved'}));
  store.newChat(other);store.draft('other project');await store.send();
  store.newChat();store.draft('independent');await store.send();
  const outside=store.getSnapshot().selected;
  store.newChat(project);store.draft('pending');
  let resolve, signal;
  t.mock.method(globalThis,'fetch',(_,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});});
  const pending=store.send();
  assert.ok(store.getSnapshot().expandedProjects.includes(project));
  store.collapseProject(project);
  assert.ok(!store.getSnapshot().expandedProjects.includes(project));
  assert.equal(store.deleteProject(project),true);
  assert.equal(signal.aborted,true);
  assert.equal(store.getSnapshot().projectId,null);
  assert.equal(store.getSnapshot().selected,null);
  resolve(Response.json({content:'late'}));await pending;
  assert.equal(store.getSnapshot().chats.length,2);
  assert.ok(store.getSnapshot().chats.every(c=>c.projectId!==project));
  store.select(outside);
  store.deleteProject(other);
  assert.equal(store.getSnapshot().selected,outside);
  store.dispose();
  const reloaded=createChatStore();
  assert.equal(reloaded.getSnapshot().projects.length,0);
  assert.deepEqual(reloaded.getSnapshot().chats.map(c=>c.id),[outside]);
  reloaded.dispose();
});

test('failed deletion keeps the project and conversations intact', t => {
  storageFor(t);
  const store=createChatStore();
  const id=store.createProject('Keep on failure');
  t.mock.method(localStorage,'setItem',()=>{throw new Error('quota');});
  assert.equal(store.deleteProject(id),false);
  assert.equal(store.getSnapshot().projects.length,1);
  assert.equal(store.getSnapshot().projectId,id);
  assert.equal(store.getSnapshot().storageError,true);
  store.dispose();
});

test('management retains titles, pinning, membership, branches and archives after reload', async t => {
  storageFor(t);
  t.mock.method(globalThis,'fetch',async()=>Response.json({content:'answer'}));
  const store=createChatStore();
  const first=store.createProject('First'), second=store.createProject('Second');
  store.newChat(first);store.draft('hello');await store.send();
  const id=store.getSnapshot().selected;
  assert.equal(store.renameProject(first,'  Renamed project  '),true);
  assert.equal(store.renameProject(first,' '),false);
  assert.equal(store.renameChat(id,'Renamed chat'),true);
  store.pinChat(id,true);
  assert.equal(store.moveChat(id,'missing'),false);
  assert.equal(store.moveChat(id,second),true);
  assert.equal(store.getSnapshot().projectId,second);
  store.moveChat(id,null);
  assert.equal(store.getSnapshot().projectId,null);
  assert.equal(store.forkChat(id,'Branch'),true);
  const branch=store.getSnapshot().selected;
  assert.notEqual(branch,id);
  assert.deepEqual(store.getSnapshot().chats[0].messages,store.getSnapshot().chats[1].messages);
  store.draft('branch-only');await store.send();
  assert.equal(store.getSnapshot().chats.find(c=>c.id===id).messages.length,2);
  store.archiveChat(branch,true);
  assert.equal(store.getSnapshot().selected,null);
  store.select(branch);assert.equal(store.getSnapshot().selected,null);
  store.archiveChat(branch,false);store.select(branch);
  assert.equal(store.getSnapshot().selected,branch);
  store.archiveChat(branch,true);
  assert.equal(store.reorderProject(second,first),true);
  store.dispose();
  const restored=createChatStore();
  assert.deepEqual(restored.getSnapshot().projects.map(p=>p.name),['Second','Renamed project']);
  assert.equal(restored.getSnapshot().chats.find(c=>c.id===id).pinned,true);
  assert.equal(restored.getSnapshot().chats.find(c=>c.id===id).title,'Renamed chat');
  assert.equal(restored.getSnapshot().chats.find(c=>c.id===id).projectId,null);
  assert.equal(restored.getSnapshot().chats.find(c=>c.id===branch).archived,true);
  restored.deleteChat(branch);
  assert.deepEqual(restored.getSnapshot().chats.map(c=>c.id),[id]);
  restored.dispose();
});

test('management save failures preserve the current records', async t => {
  storageFor(t);
  t.mock.method(globalThis,'fetch',async()=>Response.json({content:'ok'}));
  const store=createChatStore();const id=store.createProject('Original');
  store.newChat(id);store.draft('original');await store.send();
  const chat=store.getSnapshot().selected;
  t.mock.method(localStorage,'setItem',()=>{throw new Error('quota');});
  for(const change of [()=>store.renameProject(id,'new'),()=>store.renameChat(chat,'new'),()=>store.pinChat(chat,true),()=>store.archiveChat(chat,true),()=>store.moveChat(chat,null),()=>store.deleteChat(chat),()=>store.forkChat(chat,'branch')]) assert.equal(change(),false);
  assert.equal(store.getSnapshot().projects[0].name,'Original');
  assert.equal(store.getSnapshot().chats[0].title,'original');
  assert.equal(store.getSnapshot().chats.length,1);
  assert.equal(store.getSnapshot().selected,chat);
  store.dispose();
});

test('archiving or deleting an active chat prevents a late response from reviving it', async t => {
  storageFor(t);
  for(const action of ['archiveChat','deleteChat']) {
    let resolve,signal;
    t.mock.method(globalThis,'fetch',(_,options)=>{signal=options.signal;return new Promise(done=>resolve=done);});
    const store=createChatStore();store.draft(action);const pending=store.send();
    const id=store.getSnapshot().selected;
    assert.equal(store[action](id,true),true);assert.equal(signal.aborted,true);
    resolve(Response.json({content:'late'}));await pending;
    assert.equal(store.getSnapshot().busy,false);assert.equal(store.getSnapshot().selected,null);
    const chat=store.getSnapshot().chats.find(c=>c.id===id);
    if(action==='deleteChat')assert.equal(chat,undefined);else assert.equal(chat.messages.length,1);
    store.dispose();
  }
});


test('migrates previous model choices to Mingze while retaining effort and messages', async t => {
  const values=storageFor(t);
  let payload;
  t.mock.method(globalThis,'fetch',async(_,options)=>{payload=JSON.parse(options.body);return Response.json({content:'ok'});});
  for (const previousModel of ['deepseek-flash','deepseek-v4-pro']) {
  const oldSelection={model:previousModel,reasoningEffort:'high'};
  const messages=[{role:'user',content:'saved history'}];
  values.clear();
  values.set('personal-ocean.chats.v1.selection',JSON.stringify(oldSelection));
  values.set('personal-ocean.chats.v1.projects',JSON.stringify({projects:[],chats:[{id:'old',title:'Old',messages,selection:oldSelection}]}));
  const store=createChatStore();
  assert.deepEqual(store.getSnapshot().selection,{model:'deepseek-v4-flash',reasoningEffort:'high'});
  store.select('old');
  assert.deepEqual(store.getSnapshot().chats[0].messages,messages);
  assert.deepEqual(store.getSnapshot().selection,{model:'deepseek-v4-flash',reasoningEffort:'high'});
  store.setSelection(oldSelection);
  assert.equal(store.getSnapshot().selection.model,'deepseek-v4-flash');
  store.draft('continue');await store.send();
  assert.equal(payload.model,'deepseek-v4-flash');assert.equal(payload.reasoningEffort,'high');
  store.dispose();
  }
});
