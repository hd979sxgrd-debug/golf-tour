import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson, requireAdmin } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';

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

async function resolveDayCol(pool: Pool): Promise<{ col: 'day' | 'match_day' | 'day_label'; notNull: boolean }> {
  const { rows } = await pool.query(
    `select column_name, is_nullable
       from information_schema.columns
      where table_name = 'matches'
        and column_name in ('day','match_day','day_label')
      order by case column_name
                 when 'day' then 1
                 when 'match_day' then 2
                 when 'day_label' then 3
               end asc
      limit 1`
  );
  if (rows.length > 0) {
    return { col: rows[0].column_name, notNull: rows[0].is_nullable === 'NO' } as any;
  }
  await pool.query(`alter table matches add column if not exists day text`);
  return { col: 'day', notNull: false };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    try { requireAdmin(event); } catch { return bad('Unauthorized', 401); }

    const body = await readJson<Payload>(event.body);
    const id = body.id;
    const name = (body.name || '').trim();
    const rawDay = (body.day || '').trim();
    const format = body.format;
    const courseId = body.courseId;
    const sideATeamId = body.sideATeamId ?? null;
    const sideBTeamId = body.sideBTeamId ?? null;

    if (!id || !name || !format || !courseId) return bad('id, name, format, courseId are required');

    // side_a / side_b
    const sideA = (body.sideAPlayerIds || []).map(pid => ({ type: 'player', id: pid }));
    const sideB = (body.sideBPlayerIds || []).map(pid => ({ type: 'player', id: pid }));

    const pool = getPool();
    await ensureMatchesSchema(pool);
    const { col: dayCol, notNull } = await resolveDayCol(pool);
    const dayValue: string | null = rawDay || (notNull ? 'Day' : null); // если NOT NULL — никогда не оставляем null

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
      id, name, dayValue, format, courseId,
      JSON.stringify(sideA), JSON.stringify(sideB),
      sideATeamId, sideBTeamId
    ]);

    return ok({ match: rows[0] });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'match_create failed', 500);
  }
};
