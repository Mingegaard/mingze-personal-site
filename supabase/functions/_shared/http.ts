export type Env = (name: string) => string | undefined;
export type Rpc = (name: string, parameters: Record<string, unknown>) => Promise<any>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

export function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = (env('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new ApiError(403, 'origin');
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-visitor-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

export function json(body: unknown, headers: Record<string, string>, status = 200): Response {
  return Response.json(body, { status, headers });
}

export function failure(error: unknown, headers: Record<string, string>): Response {
  const expected = error instanceof ApiError;
  return json({ error: expected ? error.message : 'unavailable' }, headers, expected ? error.status : 503);
}

export async function readJson(request: Request, maxBytes: number): Promise<any> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError(413, 'too-large');
  if (!request.body) throw new ApiError(400, 'invalid');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'too-large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new ApiError(400, 'invalid'); }
}

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function visitorHash(request: Request): Promise<string> {
  const token = request.headers.get('X-Visitor-Token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'visitor');
  return digest(token);
}

export async function requestHash(request: Request, env: Env): Promise<string> {
  const salt = env('REQUEST_HASH_SALT');
  if (!salt || salt.length < 32) throw new ApiError(503, 'unconfigured');
  // IP limits are defense in depth; the global SQL budgets remain authoritative.
  const address = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  return digest(`${salt}:${address}`);
}

export function createRpc(env: Env, fetchImpl: typeof fetch = fetch): Rpc {
  return async (name, parameters) => {
    const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new ApiError(503, 'unconfigured');
    const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parameters), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok) {
      const code = result?.message;
      const statuses: Record<string, number> = { 'visitor': 401, 'blocked': 403, 'conflict': 409, 'rate-limit': 429, 'daily-limit': 429, 'busy': 429, 'not-found': 404, 'invalid': 400 };
      throw new ApiError(statuses[code] ?? 503, statuses[code] ? code : 'unavailable');
    }
    return result;
  };
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function readCursor(raw: string | null): { at: string | null; id: string | null } {
  if (!raw) return { at: null, id: null };
  if (raw.length > 160) throw new ApiError(400, 'invalid');
  try {
    const [at, id] = JSON.parse(atob(raw.replaceAll('-', '+').replaceAll('_', '/')));
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || !isUuid(id)) throw new Error();
    return { at, id };
  } catch { throw new ApiError(400, 'invalid'); }
}

export function makeCursor(at: string, id: string): string {
  return btoa(JSON.stringify([at, id])).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
