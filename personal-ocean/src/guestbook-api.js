// Only the Supabase public URL/key belong here. Model and database secrets stay in Edge Functions.
const FRESH_MS = 30_000, STALE_MS = 5 * 60_000, READ_TIMEOUT_MS = 15_000, MAX_PAGES = 40;
const pageKey = query => JSON.stringify(['guestbook',query.action,query.parentId ?? null,query.cursor ?? null]);
const isFirstList = query => query.action === 'list' && query.cursor == null;
const isPage = value => value && Array.isArray(value.items)
  && (value.nextCursor == null || typeof value.nextCursor === 'string');

// A reader may leave without cancelling a request shared with other readers or a prefetch.
function waitFor(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve,reject) => {
    const abort = () => { signal.removeEventListener('abort',abort);reject(signal.reason); };
    if (signal.aborted) abort();
    else signal.addEventListener('abort',abort,{once:true});
    promise.then(value => {
      signal.removeEventListener('abort',abort);resolve(value);
    },error => {
      signal.removeEventListener('abort',abort);reject(error);
    });
  });
}

export function createGuestbookApi({url,publishableKey,fetchImpl=fetch,storage,cacheStorage,now=Date.now} = {}) {
  const base = (url || '').replace(/\/$/,'');
  const storageKey = `personal-ocean.visitor.v1:${base}`;
  const cacheStorageKey = `personal-ocean.guestbook.v1:${base}`;
  let visitor = null, registering = null;
  const pendingPosts = new Map();
  const pages = new Map(), reads = new Map();
  let generation = 0;
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (typeof saved?.token === 'string' && saved?.visitor?.id) visitor = saved;
  } catch {}
  try {
    cacheStorage ??= globalThis.sessionStorage;
    const saved = JSON.parse(cacheStorage?.getItem(cacheStorageKey) || 'null');
    const age = now() - saved?.at;
    if (Number.isFinite(saved?.at) && age >= 0 && age < STALE_MS && isPage(saved?.page)) {
      const query = {action:'list'};
      pages.set(pageKey(query),{query,at:saved.at,page:saved.page});
    } else if (saved) cacheStorage?.removeItem(cacheStorageKey);
  } catch { /* An unavailable or full session store must not block public reads. */ }
  const call = async (name,{body,query,signal,token}={}) => {
    if (!base || (body && !publishableKey)) throw Object.assign(new Error('unconfigured'),{code:'unconfigured'});
    const endpoint = new URL(`${base}/functions/v1/${name}`);
    for (const [key,value] of Object.entries(query || {})) if(value != null) endpoint.searchParams.set(key,value);
    const response = await fetchImpl(endpoint.toString(),{
      method:body ? 'POST' : 'GET',signal,credentials:'omit',
      headers:body?{apikey:publishableKey,'Content-Type':'application/json',...(token?{'X-Visitor-Token':token}:{})}:{},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok) {
      const code = typeof result?.error === 'string' ? result.error : 'unavailable';
      throw Object.assign(new Error(code),{code,status:response.status,retryAfter:response.headers.get('Retry-After')});
    }
    return result;
  };
  const cached = query => {
    const key = pageKey(query), entry = pages.get(key);
    if (!entry) return null;
    const age = now() - entry.at;
    if (age < 0 || age >= STALE_MS) {
      pages.delete(key);
      if (isFirstList(query)) {
        try { cacheStorage?.removeItem(cacheStorageKey); } catch { /* Memory cache still expires. */ }
      }
      return null;
    }
    pages.delete(key);pages.set(key,entry);
    return entry;
  };
  const remember = (query,page) => {
    const entry = {query,page,at:now()}, key = pageKey(query);
    pages.delete(key);pages.set(key,entry);
    while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value);
    if (isFirstList(query)) {
      try { cacheStorage?.setItem(cacheStorageKey,JSON.stringify({at:entry.at,page})); }
      catch { /* Keep the in-memory page when browser storage cannot be written. */ }
    }
  };
  const invalidate = parentId => {
    generation++;
    for (const [key,entry] of pages) {
      if (entry.query.action === 'list' || (parentId != null && entry.query.parentId === parentId)) pages.delete(key);
    }
    try { cacheStorage?.removeItem(cacheStorageKey); } catch { /* The current instance is already invalidated. */ }
  };
  const readPage = async (query,{signal,force=false}={}) => {
    signal?.throwIfAborted();
    const entry = cached(query);
    if (!force && entry && now() - entry.at < FRESH_MS) return entry.page;
    const key = pageKey(query);
    let request = reads.get(key);
    if (!request || request.generation !== generation) {
      const epoch = generation, controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new DOMException('Guestbook read timed out','TimeoutError')),READ_TIMEOUT_MS);
      request = {generation:epoch,promise:null};
      const current = request;
      current.promise = waitFor(call('guestbook',{query,signal:controller.signal}),controller.signal).then(result => {
        if (!isPage(result)) throw Object.assign(new Error('unavailable'),{code:'unavailable'});
        const page = {items:result.items,nextCursor:result.nextCursor ?? null};
        if (epoch === generation) remember(query,page);
        return page;
      }).finally(() => {
        clearTimeout(timer);
        if (reads.get(key) === current) reads.delete(key);
      });
      reads.set(key,current);
    }
    return waitFor(request.promise,signal);
  };
  const identity = async () => {
    if (visitor) return visitor;
    if (!registering) registering = call('guestbook',{body:{action:'register'}}).then(result=>{
      if(typeof result?.token !== 'string' || !result?.visitor?.id) throw new Error('unavailable');
      visitor = {token:result.token,visitor:result.visitor};
      try { storage?.setItem(storageKey,JSON.stringify(visitor)); } catch {}
      return visitor;
    }).finally(()=>{registering=null;});
    return registering;
  };
  const write = async (name,body,signal) => {
    const current = await identity();
    signal?.throwIfAborted();
    try { return await call(name,{body,signal,token:current.token}); }
    catch(error) {
      if(error.status !== 401 || error.code !== 'visitor') throw error;
      // The server rejected the identity before writing; recover once, never retry a submitted post.
      if(visitor?.token === current.token) {
        visitor=null;
        try { storage?.removeItem(storageKey); } catch {}
      }
      const replacement=await identity();
      signal?.throwIfAborted();
      return call(name,{body,signal,token:replacement.token});
    }
  };
  return {
    peekList:({cursor}={})=>cached({action:'list',cursor})?.page ?? null,
    peekReplies:({parentId,cursor})=>cached({action:'replies',parentId,cursor})?.page ?? null,
    list:({cursor,signal,force}={})=>readPage({action:'list',cursor},{signal,force}),
    replies:({parentId,cursor,signal,force})=>readPage({action:'replies',parentId,cursor},{signal,force}),
    prefetchList:()=>readPage({action:'list'}).catch(()=>undefined),
    post:async({content,parentId,replyToId})=>{
      const key=JSON.stringify({content,parentId,replyToId});
      let requestId=pendingPosts.get(key);
      if(!requestId) {requestId=crypto.randomUUID();pendingPosts.set(key,requestId);}
      const result=await write('guestbook',{action:'post',content,parentId,replyToId,requestId});
      pendingPosts.delete(key);
      invalidate(parentId);
      return result;
    },
    requestChat:({signal,...body})=>write('personal-chat',body,signal),
  };
}
