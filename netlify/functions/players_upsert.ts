import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';

type Payload = { id?: string; name: string; hcp?: number | null };

async function resolveHcpColumn(pool: Pool): Promise<'hcp' | 'hi' | 'handicap'> {
  const { rows } = await pool.query(
    `select column_name
       from information_schema.columns
      where table_name = 'players' and column_name in ('hcp','hi','handicap')`
  );
  if (rows.length > 0) return rows[0].column_name;

  // ни одной подходящей — создаём стандартную
  await pool.query(`alter table players add column if not exists hcp real`);
  return 'hcp';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const body = await readJson<Payload>(event.body);
    const id = body.id ?? crypto.randomUUID();
    const name = (body.name || '').trim();
    const hcp = body.hcp ?? null;

    if (!name) return bad('name is required');

    const pool = getPool();
    const hcpCol = await resolveHcpColumn(pool); // 'hcp' | 'hi' | 'handicap'

    // Внимательно подставляем имя колонки только из whitelist:
    const sql = `
      insert into players (id, name, ${hcpCol})
      values ($1, $2, $3)
      on conflict (id) do update set
        name = excluded.name,
        ${hcpCol} = excluded.${hcpCol}
      returning id, name, ${hcpCol} as hcp
    `;
    const { rows } = await pool.query(sql, [id, name, hcp]);

    return ok({ player: rows[0] });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'players_upsert failed', 500);
  }
};
