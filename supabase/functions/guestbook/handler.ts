import { ApiError, cors, failure, json, readJson, randomToken, digest, visitorHash, requestHash, isUuid, readCursor, makeCursor } from '../_shared/http.ts';
import type { Env, Rpc } from '../_shared/http.ts';

export function createGuestbookHandler({ env, rpc }: { env: Env; rpc: Rpc }) {
  return async (request: Request): Promise<Response> => {
    let headers: Record<string, string> = {};
    try {
      headers = cors(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method === 'GET') {
        const url = new URL(request.url), action = url.searchParams.get('action') ?? 'list';
        if (!['list', 'replies'].includes(action)) throw new ApiError(400, 'invalid');
        const parentId = action === 'replies' ? url.searchParams.get('parentId') : null;
        if (action === 'replies' && !isUuid(parentId)) throw new ApiError(400, 'invalid');
        const cursor = readCursor(url.searchParams.get('cursor'));
        const rows = await rpc('site_list_messages', { p_parent_id: parentId, p_cursor_at: cursor.at, p_cursor_id: cursor.id, p_limit: 21 });
        const items = rows.slice(0, 20), last = items.at(-1);
        return json({ items, nextCursor: rows.length > 20 && last ? makeCursor(last.createdAt, last.id) : null }, headers);
      }
      if (request.method !== 'POST') throw new ApiError(405, 'method');
      const input = await readJson(request, 8000);
      if (input?.action === 'register') {
        const token = randomToken();
        const visitor = await rpc('site_register_visitor', { p_token_hash: await digest(token), p_request_hash: await requestHash(request, env) });
        return json({ token, visitor }, headers, 201);
      }
      if (input?.action !== 'post' || typeof input.content !== 'string') throw new ApiError(400, 'invalid');
      const content = input.content.trim(), parentId = input.parentId ?? null, replyToId = input.replyToId ?? null;
      if (!content || [...content].length > 1000 || /\u0000/.test(content) || !isUuid(input.requestId)
        || (parentId !== null && !isUuid(parentId)) || (replyToId !== null && !isUuid(replyToId))
        || (replyToId !== null && parentId === null)) throw new ApiError(400, 'invalid');
      const posted = await rpc('site_post_message', {
        p_token_hash: await visitorHash(request), p_request_hash: await requestHash(request, env),
        p_content: content, p_parent_id: parentId, p_reply_to_id: replyToId, p_request_id: input.requestId,
      });
      return json(posted, headers, 201);
    } catch (error) { return failure(error, headers); }
  };
}
