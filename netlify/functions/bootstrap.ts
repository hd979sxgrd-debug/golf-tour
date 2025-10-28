import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';
import { buildHandicapSnapshot, resolvePlayerHcpColumn } from './_shared/hcp';

/* ---- helpers: autodetect columns ---- */

// (The file already has fairly complete resolveSiColumn with migration logic — keep that.)
async function resolveSiColumn(pool: Pool): Promise<'stroke_index' | 'si' | 'strokeindex'> {
  // Сделаем миграцию: если есть 'si' или 'strokeindex', приведём её к 'stroke_index'
  try {
    const { rows } = await pool.query(`
      select column_name
        from information_schema.columns
       where table_name = 'courses'
         and column_name in ('stroke_index','si','strokeindex')
    `);
    const cols = rows.map((r: any) => r.column_name);

    if (cols.includes('si') && !cols.includes('stroke_index')) {
      // переименовать si -> stroke_index
      await pool.query(`alter table courses rename column si to stroke_index`);
      return 'stroke_index';
    } else if (cols.includes('strokeindex') && !cols.includes('stroke_index')) {
      // переименовать strokeindex -> stroke_index
      await pool.query(`alter table courses rename column strokeindex to stroke_index`);
      return 'stroke_index';
    } else if (cols.includes('si') && cols.includes('stroke_index')) {
      // если есть обе — скопируем значения и удалим si
      await pool.query(`update courses set stroke_index = si where stroke_index is null and si is not null`);
      await pool.query(`alter table courses drop column if exists si`);
      return 'stroke_index';
    } else if (cols.includes('strokeindex') && cols.includes('stroke_index')) {
      await pool.query(`update courses set stroke_index = strokeindex where stroke_index is null and strokeindex is not null`);
      await pool.query(`alter table courses drop column if exists strokeindex`);
      return 'stroke_index';
    } else if (cols.includes('stroke_index')) {
      return 'stroke_index';
    } else if (cols.includes('si')) {
      return 'si';
    } else if (cols.includes('strokeindex')) {
      return 'strokeindex';
    }
  } catch (e) {
    console.error('resolveSiColumn migration error:', e);
  }

  // Если ничего не найдено — добавить стандартную колонку stroke_index
  await pool.query(`alter table courses add column if not exists stroke_index int[]`);
  return 'stroke_index';
}

async function resolveTeamPlayersCol(pool: Pool): Promise<'player_ids' | 'playerids' | 'players' | 'members'> {
  // (existing implementation retained)
  const { rows } = await pool.query(`
    select column_name from information_schema.columns
     where table_name = 'teams' and column_name in ('player_ids','playerids','players','members')
  `);
  if (rows.length > 0) return rows[0].column_name as any;
  await pool.query(`alter table teams add column if not exists player_ids text[]`);
  return 'player_ids';
}

/** Возвращает имя колонки дня и её nullability */
async function resolveDayCol(pool: Pool): Promise<{ col: 'day' | 'match_day' | 'day_label'; notNull: boolean }> {
  // (existing implementation retained)
  const { rows } = await pool.query(`
    select column_name, is_nullable
      from information_schema.columns
     where table_name = 'matches' and column_name in ('day','match_day','day_label')
  `);
  if (rows.length > 0) {
    const col = rows[0].column_name as any;
    return { col, notNull: rows[0].is_nullable === 'NO' };
  }
  // default
  return { col: 'day', notNull: false };
}

/* ---- handler ---- */

export const handler: Handler = async () => {
  try {
    const pool = getPool();

    // players
    const hcpCol = await resolvePlayerHcpColumn(pool);
    const players = (await pool.query(
      `select id, name, ${hcpCol} as hcp from players order by name`
    )).rows.map((p:any) => ({
      id: p.id,
      name: p.name,
      hcp: p.hcp ?? null
    }));

    // teams
    const teamPlayersCol = await resolveTeamPlayersCol(pool);
    const teams = (await pool.query(
      `select id, name, ${teamPlayersCol} as player_ids from teams order by name`
    )).rows.map((t:any) => ({ id: t.id, name: t.name, playerIds: t.player_ids || [] }));

    // courses — гарантируем stroke_index и читаем с учётом имени колонки
    const siCol = await resolveSiColumn(pool);
    console.error('DEBUG bootstrap: using si column =', siCol);
    const courses = (await pool.query(
      `select id, name, cr, slope, pars, ${siCol} as stroke_index
       from courses order by name`
    )).rows.map((c:any) => ({
      id: c.id,
      name: c.name,
      cr: c.cr ?? null,
      slope: c.slope ?? null,
      pars: c.pars || [],
      strokeIndex: c.stroke_index || []
    }));

    // matches — гарантируем базовую схему и читаем с учётом имени колонки дня
    await ensureMatchesSchema(pool);
    const { col: dayCol } = await resolveDayCol(pool);
    const matchRows = (await pool.query(
      `select id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id, handicap_snapshot
         from matches order by ${dayCol} nulls last`
    )).rows as any[];

    const extractPlayerIds = (side: any): string[] => {
      if (!Array.isArray(side)) return [];
      return side
        .map((item: any) => (item && typeof item === 'object' && item.type === 'player' ? String(item.id) : null))
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    };

    for (const row of matchRows) {
      const playersInMatch = new Set<string>([
        ...extractPlayerIds(row.side_a),
        ...extractPlayerIds(row.side_b),
      ]);

      const snapshotRaw = row.handicap_snapshot;
      let snapshotObj: Record<string, any> | undefined;
      if (snapshotRaw && typeof snapshotRaw === 'object' && !Array.isArray(snapshotRaw)) {
        snapshotObj = snapshotRaw as Record<string, any>;
      }

      let needsUpdate = !snapshotObj;
      if (!needsUpdate && snapshotObj) {
        for (const pid of playersInMatch) {
          if (!(pid in snapshotObj)) {
            needsUpdate = true;
            break;
          }
        }
      }

      if (needsUpdate && playersInMatch.size > 0) {
        const snapshot = await buildHandicapSnapshot(pool, Array.from(playersInMatch), hcpCol);
        row.handicap_snapshot = snapshot;
        await pool.query(
          `update matches set handicap_snapshot = $2::jsonb where id = $1`,
          [row.id, JSON.stringify(snapshot)]
        );
      } else {
        row.handicap_snapshot = snapshotObj ?? {};
      }
    }

    const holeScoresMap = new Map<string, any[]>();
    if (matchRows.length) {
      const { rows: scoreRows } = await pool.query(
        `select match_id, side, player_id, hole, gross, dash
           from hole_scores
          where match_id = any($1::text[])
          order by match_id, side, hole, coalesce(player_id,'')`,
        [matchRows.map((m) => m.id)]
      );
      for (const row of scoreRows) {
        const list = holeScoresMap.get(row.match_id) || [];
        list.push(row);
        holeScoresMap.set(row.match_id, list);
      }
    }

    const matches = matchRows.map((m:any) => ({
      id: m.id,
      name: m.name,
      day: m.day,
      format: m.format,
      courseId: m.course_id,
      sideA: m.side_a,
      sideB: m.side_b,
      sideATeamId: m.side_a_team_id || undefined,
      sideBTeamId: m.side_b_team_id || undefined,
      handicapSnapshot: (m.handicap_snapshot && typeof m.handicap_snapshot === 'object') ? m.handicap_snapshot : undefined,
      hole_scores: holeScoresMap.get(m.id) ?? [],
    }));

    return ok({ players, teams, courses, matches });
  } catch (e: any) {
    console.error('bootstrap failed', e);
    return bad(e.message || 'bootstrap failed', 500);
  }
};