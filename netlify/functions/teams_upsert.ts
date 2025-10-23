// netlify/functions/teams_upsert.ts
import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';

type Payload = { id?: string; name: string; playerIds: string[] };

async function resolvePlayersCol(pool: Pool): Promise<'player_ids' | 'playerids' | 'players' | 'members'> {
  const { rows } = await pool.query(
    `select column_name
       from information_schema.columns
      where table_name = 'teams' and column_name in ('player_ids','playerids','players','members')`
  );
  if (rows.length > 0) return rows[0].column_name;

  // если нет ни одной — создаём стандартную
  await pool.query(`alter table teams add column if not exists player_ids text[]`);
  return 'player_ids';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const body = await readJson<Payload>(event.body);
    const id = body.id ?? crypto.randomUUID();
    const name = (body.name || '').trim();
    const playerIds = Array.isArray(body.playerIds) ? body.playerIds : [];

    if (!name) return bad('name is required');

    const pool = getPool();
    const playersCol = await resolvePlayersCol(pool); // проверенное имя колонки

    const sql = `
      insert into teams (id, name, ${playersCol})
      values ($1, $2, $3)
      on conflict (id) do update set
        name = excluded.name,
        ${playersCol} = excluded.${playersCol}
      returning id, name, ${playersCol} as player_ids
    `;
    const { rows } = await pool.query(sql, [id, name, playerIds]);

    // нормализуем поле в camelCase для фронта
    return ok({ team: { id: rows[0].id, name: rows[0].name, playerIds: rows[0].player_ids || [] } });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'teams_upsert failed', 500);
  }
};
