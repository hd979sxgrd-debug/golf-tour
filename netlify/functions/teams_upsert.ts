import type { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';

type Payload = { id?: string; name: string; playerIds: string[] };

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const body = await readJson<Payload>(event.body);
    const id = body.id ?? crypto.randomUUID();
    const name = (body.name || '').trim();
    const playerIds = Array.isArray(body.playerIds) ? body.playerIds : [];

    if (!name) return bad('name is required');

    const sql = `
      INSERT INTO teams (id, name, player_ids)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        player_ids = EXCLUDED.player_ids
      RETURNING id, name, player_ids
    `;
    const pool = getPool();
    const { rows } = await pool.query(sql, [id, name, playerIds]);

    return ok({ team: rows[0] });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'teams_upsert failed', 500);
  }
};
