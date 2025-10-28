import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';
import { buildHandicapSnapshot } from './_shared/hcp';

async function resolveDayCol(pool: Pool): Promise<'day' | 'match_day' | 'day_label'> {
  // (existing implementation retained)
  const { rows } = await pool.query(`
    select column_name
      from information_schema.columns
     where table_name = 'matches'
       and column_name in ('day','match_day','day_label')
  `);
  if (rows.length > 0) return rows[0].column_name as any;
  // default
  return 'day';
}

// New: detect which stroke-index column to use (mirrors logic used elsewhere)
async function resolveSiColumn(pool: Pool): Promise<'stroke_index' | 'si' | 'strokeindex'> {
  const { rows } = await pool.query(
    `select column_name 
     from information_schema.columns 
     where table_name = 'courses' and column_name in ('stroke_index','si','strokeindex')`
  );
  if (rows.length > 0) {
    return rows[0].column_name as 'stroke_index' | 'si' | 'strokeindex';
  }
  // no column found — ensure a standard one exists and return it
  await pool.query(`alter table courses add column if not exists stroke_index int[]`);
  return 'stroke_index';
}

export const handler: Handler = async (event) => {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) return bad('id is required');

    const pool = getPool();
    await ensureMatchesSchema(pool);

    const dayCol = await resolveDayCol(pool);
    const siCol = await resolveSiColumn(pool);

    const mres = await pool.query(
      `select id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id, handicap_snapshot
         from matches where id = $1`,
      [id]
    );
    if (mres.rowCount === 0) return bad('match not found', 404);
    const m = mres.rows[0];

    const extractPlayerIds = (side: any): string[] => {
      if (!Array.isArray(side)) return [];
      return side
        .map((item: any) => (item && typeof item === 'object' && item.type === 'player' ? String(item.id) : null))
        .filter((pid): pid is string => typeof pid === 'string' && pid.length > 0);
    };

    const expectedPids = Array.from(new Set([
      ...extractPlayerIds(m.side_a),
      ...extractPlayerIds(m.side_b),
    ]));
    let snapshot = (m.handicap_snapshot && typeof m.handicap_snapshot === 'object' && !Array.isArray(m.handicap_snapshot))
      ? (m.handicap_snapshot as Record<string, number | null>)
      : undefined;
    if (expectedPids.length > 0) {
      let needsSnapshot = !snapshot;
      if (!needsSnapshot && snapshot) {
        for (const pid of expectedPids) {
          if (!(pid in snapshot)) { needsSnapshot = true; break; }
        }
      }
      if (needsSnapshot) {
        snapshot = await buildHandicapSnapshot(pool, expectedPids);
        await pool.query(
          `update matches set handicap_snapshot = $2::jsonb where id = $1`,
          [m.id, JSON.stringify(snapshot)]
        );
      }
    }

    // safe: only reference the detected/created column name
    const cres = await pool.query(
      `select id, name, cr, slope, pars, ${siCol} as stroke_index
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
        handicapSnapshot: snapshot,
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