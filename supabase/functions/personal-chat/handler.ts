import { ApiError, cors, failure, json, readJson, visitorHash, requestHash } from '../_shared/http.ts';
import type { Env, Rpc } from '../_shared/http.ts';

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const LEGACY_MODEL = 'deepseek-v4-flash';
const efforts = ['off', 'low', 'medium', 'high', 'max'];
const usageFields = ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens'];
const boundedSetting = (env: Env, name: string, fallback: number, max: number) => {
  const value = Number(env(name) ?? fallback);
  return Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
};

export function createChatHandler({ env, rpc, profile, fetchImpl = fetch }: { env: Env; rpc: Rpc; profile: string; fetchImpl?: typeof fetch }) {
  const system = `${profile.trim()}\n\n## Website Runtime\nYou are the AI representative on Mingze Gao's personal website. His public username is mingze_gao2026. You have no access to local files, directories, terminals, browsers, or other tools, and cannot perform actions on a visitor's computer. Do not claim that you have performed such actions.`;
  return async (request: Request): Promise<Response> => {
    let headers: Record<string, string> = {}, reservation: string | undefined, upstreamSignal: AbortSignal | undefined;
    try {
      headers = cors(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') throw new ApiError(405, 'method');
      const input = await readJson(request, 80000);
      const requestedModel = input?.model ?? MODEL, requestedEffort = input?.reasoningEffort ?? 'off';
      if (![MODEL, LEGACY_MODEL].includes(requestedModel) || !efforts.includes(requestedEffort)) throw new ApiError(400, 'invalid-selection');
      // Cached clients may retain a costly old selection. Migrate those requests to
      // non-thinking mode; current clients can explicitly select reasoning again.
      const effort = requestedModel === LEGACY_MODEL ? 'off' : requestedEffort;
      const messages = input?.messages;
      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24 || messages.at(-1)?.role !== 'user'
        || messages.some(message => !message || !['user', 'assistant'].includes(message.role)
          || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 8000)
        || messages.reduce((sum, message) => sum + message.content.length, 0) > 50000) throw new ApiError(400, 'invalid');
      const key = env('PERSONAL_DEEPSEEK_API_KEY');
      if (!key || !profile.trim()) throw new ApiError(503, 'unconfigured');
      const maxTokens = effort === 'off' ? 1024 : 4096;
      const upstreamMessages = [{ role: 'system', content: system }, ...messages.map(({ role, content }) => ({ role, content }))];
      // Conservative reservation covers UTF-8 input bytes plus output cap; never refunded
      // after an upstream attempt, even on timeout, so retries cannot evade daily limits.
      const budget = new TextEncoder().encode(JSON.stringify(upstreamMessages)).length + maxTokens + 1024;
      reservation = await rpc('site_reserve_ai_request', {
        p_token_hash: await visitorHash(request), p_request_hash: await requestHash(request, env),
        p_reserved_tokens: budget,
        p_daily_requests: boundedSetting(env, 'AI_DAILY_REQUEST_LIMIT', 50, 500),
        p_daily_tokens: boundedSetting(env, 'AI_DAILY_TOKEN_LIMIT', 500000, 2000000),
      });
      upstreamSignal = AbortSignal.any([request.signal, AbortSignal.timeout(110000)]);
      const upstream = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: upstreamSignal,
        body: JSON.stringify({ model: MODEL, stream: false, max_tokens: maxTokens,
          thinking: { type: effort === 'off' ? 'disabled' : 'enabled' },
          // DeepSeek's official medium alias maps to high; storage retains the original choice.
          ...(effort === 'off' ? {} : { reasoning_effort: effort === 'medium' ? 'high' : effort }), messages: upstreamMessages }),
      });
      if (!upstream.ok) throw new ApiError(502, upstream.status === 402 ? 'balance' : 'upstream');
      const result = await upstream.json(), content = result?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ApiError(502, 'upstream');
      const usage = Object.fromEntries(usageFields
        .filter(field => Number.isSafeInteger(result?.usage?.[field]) && result.usage[field] >= 0)
        .map(field => [field, result.usage[field]]));
      return json({ content, ...(Object.keys(usage).length ? { usage } : {}) }, headers);
    } catch (error) {
      if (!(error instanceof ApiError) && upstreamSignal) {
        if (request.signal.aborted) error = new ApiError(499, 'cancelled');
        else if (upstreamSignal.reason?.name === 'TimeoutError' || (error instanceof Error && error.name === 'TimeoutError')) {
          error = new ApiError(504, 'timeout');
        } else if (error instanceof TypeError || (error instanceof Error && error.name === 'NetworkError')) {
          error = new ApiError(502, 'upstream-unreachable');
        } else error = new ApiError(502, 'upstream');
      }
      return failure(error, headers);
    }
    finally {
      if (reservation) {
        try { await rpc('site_finish_ai_request', { p_id: reservation }); }
        catch { /* The short SQL lease expires automatically; reservations remain counted. */ }
      }
    }
  };
}
