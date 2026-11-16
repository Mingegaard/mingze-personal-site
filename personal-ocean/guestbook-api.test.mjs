import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuestbookApi } from './src/guestbook-api.js';

const visitorStorageKey = 'personal-ocean.visitor.v1:https://example.supabase.co';
const savedVisitor = {token:'original-token',visitor:{id:'original-visitor'}};
function memoryStorage() {
  const values=new Map();
  return {values,getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function setup(fetchImpl, initialVisitor, extra={}) {
  const values = new Map();
  if (initialVisitor) values.set(visitorStorageKey, JSON.stringify(initialVisitor));
  const options = {url:'https://example.supabase.co',publishableKey:'public-test-key',fetchImpl,
    storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    cacheStorage:memoryStorage(),...extra};
  return {api:createGuestbookApi(options),options,values};
}
function deferred() {
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
test('read-only visitors need no identity; writes reuse the server-issued visitor token', async()=>{
  const calls=[];
  const {api,options}=setup(async(url,options)=>{
    calls.push({url,...options});
    const body=options.body?JSON.parse(options.body):null;
    return Response.json(body?.action==='register'?{token:'visitor-token',visitor:{id:'id-1',displayName:'访客-001',avatarSeed:'seed'}}:body?.action==='post'?{id:'post-1',content:body.content}:{items:[],nextCursor:null});
  });
  await api.list();
  assert.equal(calls.length,1);
  assert.equal(calls[0].headers['X-Visitor-Token'],undefined);
  await api.post({content:'hello'});
  await createGuestbookApi(options).post({content:'reply',parentId:'post-1'});
  assert.equal(calls.filter(c=>JSON.parse(c.body||'{}').action==='register').length,1);
  assert.equal(calls.at(-1).headers['X-Visitor-Token'],'visitor-token');
  assert.equal(calls.at(-1).headers.apikey,'public-test-key');
  assert.equal(calls.at(-1).credentials,'omit');
});
test('concurrent first writes share registration and never retry throttled posts', async()=>{
  let registrations=0,posts=0;
  const {api}=setup(async(_,options)=>{
    const body=JSON.parse(options.body);
    if(body.action==='register') {registrations++;return Response.json({token:'token',visitor:{id:'visitor'}});}
    posts++;
    return Response.json({error:'rate-limit'},{status:429});
  });
  const result=await Promise.allSettled([api.post({content:'first'}),api.post({content:'second'})]);
  assert.equal(registrations,1);assert.equal(posts,2);
  assert.ok(result.every(r=>r.status==='rejected'&&r.reason.status===429));
});
test('cloud chats share visitor identity and omit browser abort signals from the body', async()=>{
  let captured;
  const {api}=setup(async(url,options)=>{
    if(JSON.parse(options.body).action==='register')return Response.json({token:'token',visitor:{id:'visitor'}});
    captured={url,options};return Response.json({content:'reply'});
  });
  const controller=new AbortController();
  const result=await api.requestChat({messages:[{role:'user',content:'hello'}],model:'deepseek-v4-flash',reasoningEffort:'off',signal:controller.signal});
  assert.deepEqual(result,{content:'reply'});
  assert.equal(captured.url,'https://example.supabase.co/functions/v1/personal-chat');
  assert.equal(captured.options.signal,controller.signal);
  assert.equal(JSON.parse(captured.options.body).signal,undefined);
  controller.abort();
  await assert.rejects(api.requestChat({messages:[],signal:controller.signal}),{name:'AbortError'});
});

test('a blocked visitor is not replaced with a new identity', async()=>{
  const calls=[];
  const {api,values}=setup(async(_,options)=>{
    calls.push({body:JSON.parse(options.body),token:options.headers['X-Visitor-Token']});
    return Response.json({error:'blocked'},{status:403});
  },savedVisitor);

  await assert.rejects(api.post({content:'hello'}),{status:403,code:'blocked'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.action,'post');
  assert.equal(calls[0].token,savedVisitor.token);
  assert.deepEqual(JSON.parse(values.get(visitorStorageKey)),savedVisitor);
});

test('an invalid visitor is recovered once and the post keeps its request ID', async()=>{
  let registrations=0;
  const posts=[];
  const replacement={token:'replacement-token',visitor:{id:'replacement-visitor'}};
  const {api,values}=setup(async(_,options)=>{
    const body=JSON.parse(options.body);
    if(body.action==='register') {registrations++;return Response.json(replacement);}
    const token=options.headers['X-Visitor-Token'];
    posts.push({body,token});
    if(token===savedVisitor.token)return Response.json({error:'visitor'},{status:401});
    return Response.json({id:'post-1',content:body.content});
  },savedVisitor);

  assert.deepEqual(await api.post({content:'hello'}),{id:'post-1',content:'hello'});
  assert.equal(registrations,1);
  assert.deepEqual(posts.map(post=>post.token),[savedVisitor.token,replacement.token]);
  assert.equal(posts[0].body.requestId,posts[1].body.requestId);
  assert.deepEqual(JSON.parse(values.get(visitorStorageKey)),replacement);
});

test('a second invalid visitor response stops recovery rather than looping', async()=>{
  let registrations=0,posts=0;
  const {api}=setup(async(_,options)=>{
    if(JSON.parse(options.body).action==='register') {
      registrations++;return Response.json({token:'replacement-token',visitor:{id:'replacement-visitor'}});
    }
    posts++;return Response.json({error:'visitor'},{status:401});
  },savedVisitor);

  await assert.rejects(api.post({content:'hello'}),{status:401,code:'visitor'});
  assert.equal(registrations,1);
  assert.equal(posts,2);
});

test('unrelated authorization failures do not regenerate the visitor identity', async()=>{
  const actions=[];
  const {api,values}=setup(async(_,options)=>{
    actions.push(JSON.parse(options.body).action);
    return Response.json({error:'invalid-api-key'},{status:401});
  },savedVisitor);

  await assert.rejects(api.post({content:'hello'}),{status:401,code:'invalid-api-key'});
  assert.deepEqual(actions,['post']);
  assert.deepEqual(JSON.parse(values.get(visitorStorageKey)),savedVisitor);
});

test('a delayed old-token 401 reuses the identity already recovered by another post', {timeout:2000}, async()=>{
  const bothOldRequests=deferred(),releaseSecond=deferred();
  const replacement={token:'replacement-token',visitor:{id:'replacement-visitor'}};
  const posts=[];
  let registrations=0,oldRequests=0;
  const {api,values}=setup(async(_,options)=>{
    const body=JSON.parse(options.body);
    if(body.action==='register') {registrations++;return Response.json(replacement);}
    const token=options.headers['X-Visitor-Token'];
    posts.push({body,token});
    if(token===savedVisitor.token) {
      oldRequests++;
      if(oldRequests===2)bothOldRequests.resolve();
      if(body.content==='first')await bothOldRequests.promise;
      else await releaseSecond.promise;
      return Response.json({error:'visitor'},{status:401});
    }
    return Response.json({id:`post-${body.content}`,content:body.content});
  },savedVisitor);

  const first=api.post({content:'first'});
  const second=api.post({content:'second'});
  try {
    assert.equal((await first).id,'post-first');
    assert.equal(registrations,1);
    assert.deepEqual(JSON.parse(values.get(visitorStorageKey)),replacement);
  } finally {releaseSecond.resolve();}
  assert.equal((await second).id,'post-second');
  assert.equal(registrations,1);
  assert.deepEqual(JSON.parse(values.get(visitorStorageKey)),replacement);
  for(const content of ['first','second']) {
    const attempts=posts.filter(post=>post.body.content===content);
    assert.deepEqual(attempts.map(post=>post.token),[savedVisitor.token,replacement.token]);
    assert.equal(attempts[0].body.requestId,attempts[1].body.requestId);
  }
});

test('retrying a post after a lost response preserves its request ID until success', async()=>{
  const posts=[],committed=new Map();
  const {api}=setup(async(_,options)=>{
    const body=JSON.parse(options.body);
    assert.equal(body.action,'post');
    posts.push(body);
    // Simulate a server commit whose first response is lost in transit.
    if(!committed.has(body.requestId))committed.set(body.requestId,{id:`post-${committed.size+1}`,content:body.content});
    if(posts.length===1)throw new TypeError('Network response lost');
    return Response.json(committed.get(body.requestId));
  },savedVisitor);

  const payload={content:'A reply',parentId:'root-1',replyToId:'reply-1'};
  await assert.rejects(api.post(payload),{name:'TypeError',message:'Network response lost'});
  assert.equal(posts.length,1,'network failures must not trigger an automatic post retry');
  assert.equal((await api.post(payload)).id,'post-1');
  assert.match(posts[0].requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(posts[1].requestId,posts[0].requestId);
  assert.equal(committed.size,1,'the manual retry must resolve to the existing post');
  assert.equal(posts[1].parentId,payload.parentId);
  assert.equal(posts[1].replyToId,payload.replyToId);

  // The same text intentionally submitted again after success is a new post.
  assert.equal((await api.post(payload)).id,'post-2');
  assert.notEqual(posts[2].requestId,posts[1].requestId);
  assert.equal(committed.size,2);
});

test('public pages are fresh for 30 seconds, peekable for 5 minutes, and explicitly refreshable', async()=>{
  let time=100_000,reads=0;
  const {api}=setup(async(_,options)=>{
    assert.equal(options.headers.apikey,undefined);
    assert.equal(options.headers['Content-Type'],undefined);
    assert.equal(options.headers['X-Visitor-Token'],undefined);
    return Response.json({items:[{id:`version-${++reads}`}],nextCursor:null});
  },undefined,{now:()=>time});
  const first=await api.list();
  time+=29_999;
  assert.deepEqual(await api.list(),first);
  assert.equal(reads,1);
  time++;
  assert.deepEqual(api.peekList(),first,'stale data remains available to paint immediately');
  const refreshed=await api.list();
  assert.equal(refreshed.items[0].id,'version-2');
  assert.equal((await api.list({force:true})).items[0].id,'version-3');
  assert.equal(reads,3,'force must bypass a fresh cached result');
  time+=299_999;
  assert.equal(api.peekList().items[0].id,'version-3');
  time++;
  assert.equal(api.peekList(),null,'peek must not revive a five-minute-old result');
});

test('a failed refresh retains only the still-valid stale page and does not automatically retry', async()=>{
  let time=0,reads=0,offline=false;
  const {api}=setup(async()=>{
    reads++;
    if(offline)throw new TypeError('offline');
    return Response.json({items:[{id:'cached'}],nextCursor:null});
  },undefined,{now:()=>time});
  await api.list();
  time=30_000;offline=true;
  await assert.rejects(api.list(),{message:'offline'});
  assert.equal(reads,2);
  assert.equal(api.peekList().items[0].id,'cached');
  time=300_000;
  assert.equal(api.peekList(),null);
});

test('only the public first list page survives API recreation in session storage', async()=>{
  const session=memoryStorage();
  let time=1_000,reads=0;
  const {api,options,values}=setup(async(url)=>{
    reads++;
    const query=new URL(url).searchParams;
    return Response.json({items:[{id:query.get('parentId')||query.get('cursor')||'home'}],nextCursor:'next'});
  },savedVisitor,{cacheStorage:session,now:()=>time});
  const home=await api.list();
  await api.list({cursor:'page-2'});
  await api.replies({parentId:'root-1'});
  assert.equal(session.values.size,1);
  assert.equal(values.size,1,'public data must not enter visitor local storage');
  assert.ok(![...session.values.values()].join('').includes(savedVisitor.token));
  const recreated=createGuestbookApi(options);
  assert.deepEqual(recreated.peekList(),home);
  assert.equal(recreated.peekList({cursor:'page-2'}),null);
  assert.equal(recreated.peekReplies({parentId:'root-1'}),null);
  assert.deepEqual(await recreated.list(),home);
  assert.equal(reads,3);
  assert.equal(createGuestbookApi({...options,url:'https://other.supabase.co'}).peekList(),null);
  time+=30_000;
  assert.deepEqual(createGuestbookApi(options).peekList(),home,'stale session data is available immediately');
  time+=270_000;
  assert.equal(createGuestbookApi(options).peekList(),null);
});

test('list cursors and parent reply cursors have separate caches and concurrent requests', async()=>{
  const calls=[];
  const {api}=setup(async(url)=>{
    const query=Object.fromEntries(new URL(url).searchParams);
    calls.push(query);
    return Response.json({items:[{id:JSON.stringify(query)}],nextCursor:null});
  });
  const list=await api.list({cursor:'same'});
  const firstReplies=await api.replies({parentId:'root-1',cursor:'same'});
  const secondReplies=await api.replies({parentId:'root-2',cursor:'same'});
  const firstReplyPage=await api.replies({parentId:'root-1'});
  assert.deepEqual(api.peekList({cursor:'same'}),list);
  assert.deepEqual(await api.replies({parentId:'root-1',cursor:'same'}),firstReplies);
  assert.deepEqual(api.peekReplies({parentId:'root-2',cursor:'same'}),secondReplies);
  assert.deepEqual(api.peekReplies({parentId:'root-1'}),firstReplyPage);
  assert.equal(calls.length,4);
});

test('the in-memory cache evicts old pages while retaining recently read pages', async()=>{
  const {api}=setup(async(url)=>Response.json({items:[{id:new URL(url).searchParams.get('cursor')}],nextCursor:null}));
  for(let index=0;index<40;index++)await api.list({cursor:`page-${index}`});
  assert.ok(api.peekList({cursor:'page-0'}));
  await api.list({cursor:'page-40'});
  assert.ok(api.peekList({cursor:'page-0'}));
  assert.equal(api.peekList({cursor:'page-1'}),null);
  assert.ok(api.peekList({cursor:'page-40'}));
});

test('concurrent readers and prefetch share one request while caller cancellation stays isolated', async()=>{
  const response=deferred();
  let reads=0,networkSignal;
  const {api}=setup(async(_,options)=>{reads++;networkSignal=options.signal;return response.promise;});
  const firstController=new AbortController(),secondController=new AbortController();
  const first=api.list({signal:firstController.signal});
  const second=api.list({signal:secondController.signal});
  const prefetch=api.prefetchList();
  const cancelled=assert.rejects(first,{name:'AbortError'});
  firstController.abort();
  await cancelled;
  assert.equal(reads,1);
  assert.equal(networkSignal.aborted,false);
  response.resolve(Response.json({items:[{id:'shared'}],nextCursor:null}));
  assert.equal((await second).items[0].id,'shared');
  await prefetch;
  assert.equal(api.peekList().items[0].id,'shared');
});

test('an abandoned read can finish caching, and an already-aborted caller starts no request', async()=>{
  const response=deferred();
  let reads=0,networkSignal;
  const {api}=setup(async(_,options)=>{reads++;networkSignal=options.signal;return response.promise;});
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(api.list({signal:controller.signal}),{name:'AbortError'});
  assert.equal(reads,0);
  const active=new AbortController();
  const pending=api.list({signal:active.signal});
  const cancelled=assert.rejects(pending,{name:'AbortError'});
  active.abort();await cancelled;
  assert.equal(networkSignal.aborted,false);
  response.resolve(Response.json({items:[{id:'late'}],nextCursor:null}));
  assert.equal((await api.list()).items[0].id,'late');
  assert.equal(reads,1);
});

test('a shared public read times out after 15 seconds without automatic retries', async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  let reads=0,networkSignal;
  const {api}=setup(async(_,options)=>{reads++;networkSignal=options.signal;return new Promise(()=>{});});
  const pending=api.list();
  const timedOut=assert.rejects(pending,{name:'TimeoutError'});
  context.mock.timers.tick(14_999);
  assert.equal(networkSignal.aborted,false);
  context.mock.timers.tick(1);
  await timedOut;
  assert.equal(networkSignal.aborted,true);
  assert.equal(reads,1);
  assert.equal(api.peekList(),null);
});

test('posting invalidates list pages and the affected reply thread but preserves other threads', async()=>{
  let revision=0;
  const session=memoryStorage();
  const {api}=setup(async(url,options)=>{
    if(options.method==='POST') {
      revision++;return Response.json({id:'new-reply',content:'hello'});
    }
    return Response.json({items:[{id:`revision-${revision}`}],nextCursor:null});
  },savedVisitor,{cacheStorage:session});
  await api.list();await api.list({cursor:'page-2'});
  await api.replies({parentId:'root-1'});await api.replies({parentId:'root-1',cursor:'page-2'});
  const other=await api.replies({parentId:'root-2'});
  assert.equal(session.values.size,1);
  await api.post({content:'hello',parentId:'root-1'});
  assert.equal(api.peekList(),null);
  assert.equal(api.peekList({cursor:'page-2'}),null);
  assert.equal(api.peekReplies({parentId:'root-1'}),null);
  assert.equal(api.peekReplies({parentId:'root-1',cursor:'page-2'}),null);
  assert.deepEqual(api.peekReplies({parentId:'root-2'}),other);
  assert.equal(session.values.size,0);
  assert.equal((await api.list()).items[0].id,'revision-1');
});

test('a pre-post read cannot restore stale cache or displace a newer in-flight read', async()=>{
  const oldResponse=deferred(),newResponse=deferred(),session=memoryStorage();
  let reads=0;
  const {api,options}=setup(async(_,request)=>{
    if(request.method==='POST')return Response.json({id:'new',content:'hello'});
    reads++;return reads===1?oldResponse.promise:newResponse.promise;
  },savedVisitor,{cacheStorage:session});
  const oldRead=api.list();
  await api.post({content:'hello'});
  const newRead=api.list();
  assert.equal(reads,2,'post invalidation starts a new request instead of joining the old one');
  oldResponse.resolve(Response.json({items:[{id:'old'}],nextCursor:null}));
  await oldRead;
  assert.equal(api.peekList(),null);
  assert.equal(session.values.size,0,'the old response must not repopulate persisted data');
  const thirdReader=api.list();
  assert.equal(reads,2,'old-request cleanup must not remove the new shared request');
  newResponse.resolve(Response.json({items:[{id:'new'}],nextCursor:null}));
  await Promise.all([newRead,thirdReader]);
  assert.equal(api.peekList().items[0].id,'new');
  assert.equal(createGuestbookApi(options).peekList().items[0].id,'new');
});

test('prefetch is safe without configuration and when the network is unavailable', async()=>{
  let reads=0;
  const unconfigured=createGuestbookApi({fetchImpl:async()=>{reads++;throw new Error('must not run');},cacheStorage:memoryStorage()});
  assert.equal(await unconfigured.prefetchList(),undefined);
  assert.equal(reads,0);
  const {api}=setup(async()=>{reads++;throw new TypeError('offline');});
  assert.equal(await api.prefetchList(),undefined);
  assert.equal(reads,1);
  assert.equal(api.peekList(),null);
});

test('public list and reply reads need no custom headers while writes retain their credentials', async()=>{
  const calls=[];
  const {api,options}=setup(async(url,request)=>{
    calls.push({url,...request});
    return Response.json(request.method==='POST'?{id:'created',content:'hello'}:{items:[],nextCursor:null});
  },savedVisitor);
  await api.list();await api.replies({parentId:'root-1'});
  for(const request of calls) {
    assert.equal(request.method,'GET');
    assert.deepEqual(request.headers,{});
    assert.equal(request.credentials,'omit');
  }
  await api.post({content:'hello'});
  assert.deepEqual(calls.at(-1).headers,{
    apikey:'public-test-key','Content-Type':'application/json','X-Visitor-Token':savedVisitor.token,
  });
  const publicOnly=createGuestbookApi({...options,publishableKey:undefined,cacheStorage:memoryStorage()});
  assert.deepEqual(await publicOnly.list(),{items:[],nextCursor:null});
  const before=calls.length;
  await assert.rejects(publicOnly.post({content:'hello'}),{code:'unconfigured'});
  assert.equal(calls.length,before,'a missing key must still block writes before the network');
});

test('unavailable session storage never blocks reads, posts, or cache invalidation', async()=>{
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');},removeItem(){throw new Error('denied');}};
  const {api}=setup(async(_,request)=>Response.json(request.method==='POST'?{id:'created',content:'hello'}:{items:[{id:'home'}],nextCursor:null}),savedVisitor,{cacheStorage:denied});
  assert.equal((await api.list()).items[0].id,'home');
  assert.equal(api.peekList().items[0].id,'home');
  assert.equal((await api.post({content:'hello'})).id,'created');
  assert.equal(api.peekList(),null);
});
