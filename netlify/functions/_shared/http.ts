import type { Handler } from '@netlify/functions';

export function allowCors(originEnv: string | undefined) {
  const origin = originEnv || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  };
}

export const ok = (body: any = {}, init?: Record<string, string>) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json', ...allowCors(process.env.CORS_ORIGIN), ...(init || {}) },
  body: JSON.stringify(body),
});

export const bad = (message: string, code = 400) => ({
  statusCode: code,
  headers: { 'content-type': 'application/json', ...allowCors(process.env.CORS_ORIGIN) },
  body: JSON.stringify({ error: message }),
});

export const methodNotAllowed = () => bad('Method Not Allowed', 405);

export const handleOptions: Handler = async () => ({
  statusCode: 204,
  headers: { ...allowCors(process.env.CORS_ORIGIN) },
  body: '',
});

export async function readJson<T>(rawBody: string | null): Promise<T> {
  if (!rawBody) throw new Error('Empty body');
  return JSON.parse(rawBody) as T;
}
