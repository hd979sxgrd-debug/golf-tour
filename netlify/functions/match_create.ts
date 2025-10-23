// netlify/functions/match_create.ts
import { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, cors, requireAdmin } from './_shared/http';

type Body = {
  id: string;
  name: string;
  day: string;                      // 'Day 1'..'Day 5'
  format: 'singles'|'fourball';
  courseId: string;
  sideATeamId?: string;
  sideBTeamId?: string;
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return bad('POST only', 405);
  if (!requireAdmin(event)) return bad('unauthorized', 401);

  let body: Body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad('Invalid JSON'); }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO matches (id, name, day_label, format, course_id, side_a_team_id, side_b_team_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [body.id, body.name, body.day, body.format, body.courseId, body.sideATeamId ?? null, body.sideBTeamId ?? null]
    );

    for (const pid of body.sideAPlayerIds) {
      await client.query(
        `INSERT INTO match_sides (match_id, side, player_id) VALUES ($1,'A',$2)`,
        [body.id, pid]
      );
    }
    for (const pid of body.sideBPlayerIds) {
      await client.query(
        `INSERT INTO match_sides (match_id, side, player_id) VALUES ($1,'B',$2)`,
        [body.id, pid]
      );
    }

    await client.query('COMMIT');
    return ok({ ok: true, id: body.id });
  } catch (e:any) {
    await client.query('ROLLBACK');
    return bad(e.message, 500);
  } finally {
    client.release();
  }
};
