import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuestbookApi } from './src/guestbook-api.js';

const visitorStorageKey = 'personal-ocean.visitor.v1:https://example.supabase.co';
const savedVisitor = {token:'original-token',visitor:{id:'original-visitor'}};
function setup(fetchImpl, initialVisitor) {
  const values = new Map();
  if (initialVisitor) values.set(visitorStorageKey, JSON.stringify(initialVisitor));
  const options = {url:'https://example.supabase.co',publishableKey:'public-test-key',fetchImpl,
    storage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
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
