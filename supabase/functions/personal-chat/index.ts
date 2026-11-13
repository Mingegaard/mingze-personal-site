import { createRpc } from '../_shared/http.ts';
import { createChatHandler } from './handler.ts';
import { PROFILE } from './profile.ts';

const env = (name: string) => Deno.env.get(name);
Deno.serve(createChatHandler({ env, rpc: createRpc(env), profile: PROFILE }));
