// netlify/functions/_shared/http.ts
import type { Handler, HandlerEvent } from '@netlify/functions';

/** CORS helper: вернёт корректные заголовки (по умолчанию *) */
export function cors(originEnv?: string) {
  const origin = originEnv || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  };
}

/** Удобные ответы */
export const ok = (body: any = {}, extra?: Record<string, string>) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json', ...cors(process.env.CORS_ORIGIN), ...(extra || {}) },
  body: JSON.stringify(body),
});

export const bad = (message: string, code = 400) => ({
  statusCode: code,
  headers: { 'content-type': 'application/json', ...cors(process.env.CORS_ORIGIN) },
  body: JSON.stringify({ error: message }),
});

export const methodNotAllowed = () => bad('Method Not Allowed', 405);

export const handleOptions: Handler = async () => ({
  statusCode: 204,
  headers: { ...cors(process.env.CORS_ORIGIN) },
  body: '',
});

/** Простой парсер JSON тела */
export async function readJson<T>(rawBody: string | null): Promise<T> {
  if (!rawBody) throw new Error('Empty body');
  return JSON.parse(rawBody) as T;
}

/**
 * Мини-авторизация для админских эндпоинтов.
 * Поддерживает:
 *  - Basic auth: admin / belek2025!
 *  - либо заголовок x-admin-key: belek2025!
 */
export function requireAdmin(event: HandlerEvent) {
  const headers = event.headers || {};
  const auth = headers['authorization'] || headers['Authorization'] || '';
  const hdrKey = (headers['x-admin-key'] || headers['X-Admin-Key'] || '') as string;

  // 1) Basic admin:belek2025!
  if (auth.startsWith('Basic ')) {
    try {
      const dec = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const [u, p] = dec.split(':');
      if (u === 'admin' && p === 'belek2025!') return;
    } catch {}
  }

  // 2) x-admin-key
  if (hdrKey === 'belek2025!') return;

  throw new Error('Unauthorized');
}
