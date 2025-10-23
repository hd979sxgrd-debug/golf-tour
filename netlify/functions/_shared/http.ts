// netlify/functions/_shared/http.ts
const ORIGIN = process.env.CORS_ORIGIN || '*';

export function ok(data: any, status = 200) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': ORIGIN,
      'access-control-allow-headers': 'content-type,x-admin-token',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    },
    body: JSON.stringify(data),
  };
}

export function bad(message = 'Bad Request', status = 400) {
  return ok({ error: message }, status);
}

export function cors() {
  return ok({ ok: true });
}

export function requireAdmin(event: any) {
  // при желании добавь ADMIN_TOKEN, пока просто пасс
  return true;
}
