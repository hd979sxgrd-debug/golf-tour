import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad } from './_shared/http';

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
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return bad('id is required');

    const pool = getPool();
    const dayCol = await resolveDayCol(pool);

    const mres = await pool.query(
      `select id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id
       from matches where id = $1`, [id]
    );
    if (mres.rowCount === 0) return bad('match not found', 404);
    const match = mres.rows[0];

    const cres = await pool.query(`select id, name, cr, slope, pars,
      (select column_name from information_schema.columns
         where table_name='courses' and column_name in ('stroke_index','si','strokeindex')
         limit 1) as _si_col
    `);
    // упрощённо: отдельным запросом возьмём курс
    const course = (await pool.query(
      `select id, name, cr, slope, pars,
        (case
          when exists(select 1 from information_schema.columns where table_name='courses' and column_name='stroke_index') then stroke_index
          when exists(select 1 from information_schema.columns where table_name='courses' and column_name='si') then si
          when exists(select 1 from information_schema.columns where table_name='courses' and column_name='strokeindex') then strokeindex
          else null end) as stroke_index
       from courses where id = $1
      `,
      [match.course_id]
    )).rows[0] || null;

    return ok({
      match: {
        id: match.id,
        name: match.name,
        day: match.day,
        format: match.format,
        courseId: match.course_id,
        sideA: match.side_a,
        sideB: match.side_b,
        sideATeamId: match.side_a_team_id || undefined,
        sideBTeamId: match.side_b_team_id || undefined
      },
      course: course && {
        id: course.id,
        name: course.name,
        cr: course.cr,
        slope: course.slope,
        pars: course.pars,
        strokeIndex: course.stroke_index
      }
    });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'match failed', 500);
  }
};
