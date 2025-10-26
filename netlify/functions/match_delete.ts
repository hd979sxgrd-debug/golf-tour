// netlify/functions/match_delete.ts
import { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, handleOptions, requireAdmin } from './_shared/http';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'DELETE') return bad('DELETE only', 405);
  try {
    requireAdmin(event);
  } catch {
    return bad('Unauthorized', 401);
  }

  const id = event.queryStringParameters?.id;
  if (!id) return bad('id required');

  const pool = getPool();
  try {
    await pool.query(`DELETE FROM matches WHERE id=$1`, [id]);
    return ok({ ok: true });
  } catch (e:any) {
    return bad(e.message, 500);
  }
};
