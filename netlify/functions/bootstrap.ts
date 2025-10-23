import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';

/* ---- helpers: autodetect columns ---- */

async function resolveHcpColumn(pool: Pool): Promise<'hcp' | 'hi' | 'handicap'> {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'players' and column_name in ('hcp','hi','handicap')`
  );
  if (rows.length > 0) return rows[0].column_name;
  await pool.query(`alter table players add column if not exists hcp real`);
  return 'hcp';
}

async function resolveSiColumn(pool: Pool): Promise<'stroke_index' | 'si' | 'strokeindex'> {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'courses' and column_name in ('stroke_index','si','strokeindex')`
  );
  if (rows.length > 0) return rows[0].column_name;
  await pool.query(`alter table courses add column if not exists stroke_index int[]`);
  return 'stroke_index';
}

async function resolveTeamPlayersCol(pool: Pool): Promise<'player_ids' | 'playerids' | 'players' | 'members'> {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'teams' and column_name in ('player_ids','playerids','players','members')`
  );
  if (rows.length > 0) return rows[0].column_name;
  await pool.query(`alter table teams add column if not exists player_ids text[]`);
  return 'player_ids';
}

/** Возвращает имя колонки дня и её nullability */
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

/* ---- handler ---- */

export const handler: Handler = async () => {
  try {
    const pool = getPool();

    // players
    const hcpCol = await resolveHcpColumn(pool);
    const players = (await pool.query(
      `select id, name, ${hcpCol} as hcp from players order by name`
    )).rows;

    // teams
    const tCol = await resolveTeamPlayersCol(pool);
    const teamsRaw = (await pool.query(
      `select id, name, ${tCol} as player_ids from teams order by name`
    )).rows;
    const teams = teamsRaw.map((t: any) => ({ id: t.id, name: t.name, playerIds: t.player_ids || [] }));

    // courses
    const siCol = await resolveSiColumn(pool);
    const courses = (await pool.query(
      `select id, name, cr, slope, pars, ${siCol} as stroke_index from courses order by name`
    )).rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      cr: r.cr,
      slope: r.slope,
      pars: r.pars,
      strokeIndex: r.stroke_index || null,
    }));

    // matches — гарантируем базовую схему и читаем с учётом имени колонки дня
    await ensureMatchesSchema(pool);
    const { col: dayCol } = await resolveDayCol(pool);
    const matches = (await pool.query(
      `select id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id
         from matches
        order by created_at desc nulls last, name`
    )).rows.map((m: any) => ({
      id: m.id,
      name: m.name,
      day: m.day || null,
      format: m.format,
      courseId: m.course_id,
      sideA: m.side_a,
      sideB: m.side_b,
      sideATeamId: m.side_a_team_id || undefined,
      sideBTeamId: m.side_b_team_id || undefined,
      scoresA: Array(18).fill(null),
      scoresB: Array(18).fill(null),
    }));

    return ok({ players, teams, courses, matches });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'bootstrap failed', 500);
  }
};
