import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson, requireAdmin } from './_shared/http';

type Payload = {
  id: string;
  name: string;
  day: string;
  format: 'singles' | 'fourball';
  courseId: string;
  sideATeamId?: string;
  sideBTeamId?: string;
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
};

async function resolveDayCol(pool: Pool): Promise<'day' | 'match_day' | 'day_label'> {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'matches' and column_name in ('day','match_day','day_label')`
  );
  if (rows.length > 0) return rows[0].column_name;
  await pool.query(`alter table matches add column if not exists day text`);
  return 'day';
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    // защищаем эндпойнт (как и раньше)
    try { requireAdmin(event); } catch { /* можно позволить создание только через админку с Basic/x-admin-key */ return bad('Unauthorized', 401); }

    const body = await readJson<Payload>(event.body);
    const id = body.id;
    const name = (body.name || '').trim();
    const day = (body.day || '').trim() || null;
    const format = body.format;
    const courseId = body.courseId;
    const sideATeamId = body.sideATeamId ?? null;
    const sideBTeamId = body.sideBTeamId ?? null;

    if (!id || !name || !format || !courseId) return bad('id, name, format, courseId are required');

    // готовим JSON для side_a / side_b
    const sideA = (body.sideAPlayerIds || []).map(pid => ({ type: 'player', id: pid }));
    const sideB = (body.sideBPlayerIds || []).map(pid => ({ type: 'player', id: pid }));

    const pool = getPool();
    const dayCol = await resolveDayCol(pool);

    const sql = `
      insert into matches (id, name, ${dayCol}, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, now())
      on conflict (id) do update set
        name = excluded.name,
        ${dayCol} = excluded.${dayCol},
        format = excluded.format,
        course_id = excluded.course_id,
        side_a = excluded.side_a,
        side_b = excluded.side_b,
        side_a_team_id = excluded.side_a_team_id,
        side_b_team_id = excluded.side_b_team_id
      returning id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id
    `;
    const { rows } = await pool.query(sql, [
      id, name, day, format, courseId,
      JSON.stringify(sideA), JSON.stringify(sideB),
      sideATeamId, sideBTeamId
    ]);

    return ok({ match: rows[0] });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'match_create failed', 500);
  }
};
