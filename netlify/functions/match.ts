import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';

async function resolveDayCol(pool: Pool): Promise<'day' | 'match_day' | 'day_label'> {
  const { rows } = await pool.query(
    `select column_name
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
  if (rows.length > 0) return rows[0].column_name;
  await pool.query(`alter table matches add column if not exists day text`);
  return 'day';
}

export const handler: Handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return bad('id is required');

    const pool = getPool();
    await ensureMatchesSchema(pool);

    const dayCol = await resolveDayCol(pool);

    const mres = await pool.query(
      `select id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id
         from matches where id = $1`,
      [id]
    );
    if (mres.rowCount === 0) return bad('match not found', 404);
    const m = mres.rows[0];

    // курс со stroke_index-алиасами
    const cres = await pool.query(
      `select
         id, name, cr, slope, pars,
         (case
           when exists(select 1 from information_schema.columns where table_name='courses' and column_name='stroke_index') then stroke_index
           when exists(select 1 from information_schema.columns where table_name='courses' and column_name='si') then si
           when exists(select 1 from information_schema.columns where table_name='courses' and column_name='strokeindex') then strokeindex
           else null end) as stroke_index
       from courses where id = $1`,
      [m.course_id]
    );
    const c = cres.rowCount ? cres.rows[0] : null;

    return ok({
      match: {
        id: m.id,
        name: m.name,
        day: m.day,
        format: m.format,
        courseId: m.course_id,
        sideA: m.side_a,
        sideB: m.side_b,
        sideATeamId: m.side_a_team_id || undefined,
        sideBTeamId: m.side_b_team_id || undefined,
      },
      course: c && {
        id: c.id,
        name: c.name,
        cr: c.cr,
        slope: c.slope,
        pars: c.pars,
        strokeIndex: c.stroke_index,
      }
    });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'match failed', 500);
  }
};
