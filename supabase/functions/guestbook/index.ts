import { createRpc } from '../_shared/http.ts';
import { createGuestbookHandler } from './handler.ts';

const env = (name: string) => Deno.env.get(name);
Deno.serve(createGuestbookHandler({ env, rpc: createRpc(env) }));
