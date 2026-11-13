// Only the Supabase public URL/key belong here. Model and database secrets stay in Edge Functions.
export function createGuestbookApi({url,publishableKey,fetchImpl=fetch,storage} = {}) {
  const base = (url || '').replace(/\/$/,'');
  const storageKey = `personal-ocean.visitor.v1:${base}`;
  let visitor = null, registering = null;
  const pendingPosts = new Map();
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (typeof saved?.token === 'string' && saved?.visitor?.id) visitor = saved;
  } catch {}
  const call = async (name,{body,query,signal,token}={}) => {
    if (!base || !publishableKey) throw Object.assign(new Error('unconfigured'),{code:'unconfigured'});
    const endpoint = new URL(`${base}/functions/v1/${name}`);
    for (const [key,value] of Object.entries(query || {})) if(value != null) endpoint.searchParams.set(key,value);
    const response = await fetchImpl(endpoint.toString(),{
      method:body ? 'POST' : 'GET',signal,credentials:'omit',
      headers:{apikey:publishableKey,...(body?{'Content-Type':'application/json'}:{}),...(token?{'X-Visitor-Token':token}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok) {
      const code = typeof result?.error === 'string' ? result.error : 'unavailable';
      throw Object.assign(new Error(code),{code,status:response.status,retryAfter:response.headers.get('Retry-After')});
    }
    return result;
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
    list:({cursor,signal}={})=>call('guestbook',{query:{action:'list',cursor},signal}),
    replies:({parentId,cursor,signal})=>call('guestbook',{query:{action:'replies',parentId,cursor},signal}),
    post:async({content,parentId,replyToId})=>{
      const key=JSON.stringify({content,parentId,replyToId});
      let requestId=pendingPosts.get(key);
      if(!requestId) {requestId=crypto.randomUUID();pendingPosts.set(key,requestId);}
      const result=await write('guestbook',{action:'post',content,parentId,replyToId,requestId});
      pendingPosts.delete(key);
      return result;
    },
    requestChat:({signal,...body})=>write('personal-chat',body,signal),
  };
}
