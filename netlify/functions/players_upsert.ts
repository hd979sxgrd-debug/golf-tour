import type { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';

type Payload = { id?: string; name: string; hcp?: number | null };

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const body = await readJson<Payload>(event.body);
    const id = body.id ?? crypto.randomUUID();
    const name = (body.name || '').trim();
    const hcp = body.hcp ?? null;

    if (!name) return bad('name is required');

    const sql = `
      INSERT INTO players (id, name, hcp)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        hcp  = EXCLUDED.hcp
      RETURNING id, name, hcp
    `;
    const pool = getPool();
    const { rows } = await pool.query(sql, [id, name, hcp]);

    return ok({ player: rows[0] });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'players_upsert failed', 500);
  }
};
