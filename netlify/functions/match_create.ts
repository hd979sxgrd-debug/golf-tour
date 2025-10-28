import type { Handler } from '@netlify/functions';
import type { Pool } from 'pg';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson, requireAdmin } from './_shared/http';
import { ensureMatchesSchema } from './_shared/schema';
import { buildHandicapSnapshot, resolvePlayerHcpColumn } from './_shared/hcp';

type Payload = {
  id: string;
  name: string;
  day?: string;           // допускаем разные ключи
  dayLabel?: string;
  match_day?: string;
  format: 'singles' | 'fourball';
  courseId: string;
  sideATeamId?: string | null;
  sideBTeamId?: string | null;
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
  handicapSnapshot?: Record<string, number | null | undefined>;
};

const normalizeSnapshotInput = (raw: any): Record<string, number | null> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const snapshot: Record<string, number | null> = {};
  for (const [pid, value] of Object.entries(raw)) {
    if (!pid) continue;
    if (value === null) {
      snapshot[pid] = null;
      continue;
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) {
      snapshot[pid] = num;
    }
  }
  return Object.keys(snapshot).length ? snapshot : undefined;
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

    const id = body.id?.trim();
    const name = (body.name || '').trim();
    const rawDay = (body.day ?? body.dayLabel ?? (body as any)?.day_label ?? body.match_day ?? '').toString().trim();
    const format = body.format;
    const courseId = body.courseId;
    const sideATeamId = body.sideATeamId ?? null;
    const sideBTeamId = body.sideBTeamId ?? null;

    if (!id || !name || !format || !courseId) return bad('id, name, format, courseId are required');

    // side_a / side_b как JSONB-массив объектов {type:'player', id:'...'}
    const sideA = (body.sideAPlayerIds || []).map(pid => ({ type: 'player', id: pid }));
    const sideB = (body.sideBPlayerIds || []).map(pid => ({ type: 'player', id: pid }));
    const playerIds = Array.from(new Set([...sideA, ...sideB].map((s) => s.id).filter(Boolean)));
    const providedSnapshot = normalizeSnapshotInput(body.handicapSnapshot ?? (body as any)?.handicap_snapshot);

    const pool = getPool();
    await ensureMatchesSchema(pool);

    const { col: dayCol, notNull } = await resolveDayCol(pool);
    const hcpCol = await resolvePlayerHcpColumn(pool);
    const computedSnapshot = await buildHandicapSnapshot(pool, playerIds, hcpCol);
    const handicapSnapshot: Record<string, number | null> = {};
    playerIds.forEach((pid) => {
      if (providedSnapshot && pid in providedSnapshot) {
        handicapSnapshot[pid] = providedSnapshot[pid]!;
      } else if (pid in computedSnapshot) {
        handicapSnapshot[pid] = computedSnapshot[pid]!;
      } else {
        handicapSnapshot[pid] = null;
      }
    });

    // ЖЁСТКАЯ гарантия непустого значения дня:
    // rawDay может быть пустой строкой, поэтому используем fallback 'Day 1'
    const dayValue = rawDay || 'Day 1';

    // дополнительно: если колонка отмечена NOT NULL — никогда не передавать NULL
    const dayParam: string | null = dayValue ?? (notNull ? 'Day 1' : null);

    // DEBUG: логируем значения, которые пойдут в запрос (попадёт в логи Netlify)
    console.error('DEBUG match_create:', {
      id, name, dayCol, rawDay, dayValue, dayParam, notNull, format, courseId, sideACount: sideA.length, sideBCount: sideB.length
    });

    const sql = `
      insert into matches (id, name, ${dayCol}, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id, handicap_snapshot, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, now())
      on conflict (id) do update set
        name = excluded.name,
        ${dayCol} = excluded.${dayCol},
        format = excluded.format,
        course_id = excluded.course_id,
        side_a = excluded.side_a,
        side_b = excluded.side_b,
        side_a_team_id = excluded.side_a_team_id,
        side_b_team_id = excluded.side_b_team_id,
        handicap_snapshot = excluded.handicap_snapshot
      returning id, name, ${dayCol} as day, format, course_id, side_a, side_b, side_a_team_id, side_b_team_id, handicap_snapshot
    `;

    const { rows } = await pool.query(sql, [
      id, name, dayParam, format, courseId,
      JSON.stringify(sideA), JSON.stringify(sideB),
      sideATeamId, sideBTeamId,
      JSON.stringify(handicapSnapshot)
    ]);

    return ok({ match: rows[0] });
  } catch (e: any) {
    console.error('match_create error:', e);
    return bad(e.message || 'match_create failed', 500);
  }
};