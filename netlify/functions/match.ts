// netlify/functions/match.ts
import { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, cors } from './_shared/http';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const id = event.queryStringParameters?.id;
  if (!id) return bad('id is required');

  const pool = getPool();
  try {
    const { rows: mRows } = await pool.query(
      `SELECT id, name, day_label as "day", format, course_id as "courseId",
              side_a_team_id as "sideATeamId", side_b_team_id as "sideBTeamId"
       FROM matches WHERE id=$1`, [id]
    );
    if (mRows.length === 0) return bad('Match not found', 404);
    const match = mRows[0];

    const { rows: courseRows } = await pool.query(
      `SELECT id, name, cr, slope, pars, stroke_idx as "strokeIndex"
       FROM courses WHERE id=$1`, [match.courseId]
    );
    const course = courseRows[0];

    const { rows: sides } = await pool.query(
      `SELECT side, player_id FROM match_sides WHERE match_id=$1`, [id]
    );

    const sideA = sides.filter(s => s.side === 'A').map(s => ({ type: 'player', id: s.player_id }));
    const sideB = sides.filter(s => s.side === 'B').map(s => ({ type: 'player', id: s.player_id }));

    const { rows: scores } = await pool.query(
      `SELECT side, player_id, hole, gross, dash
       FROM hole_scores WHERE match_id=$1
       ORDER BY side, player_id NULLS FIRST, hole`, [id]
    );

    // Соберём playerScoresA/B: Record<playerId, number[]>, dash=-1
    const playerScoresA: Record<string, (number|null)[]> = {};
    const playerScoresB: Record<string, (number|null)[]> = {};
    const scoresA = Array(18).fill(null);
    const scoresB = Array(18).fill(null);

    for (const r of scores) {
      const idx = (r.hole as number) - 1;
      const val = r.dash ? -1 : (typeof r.gross === 'number' ? r.gross : null);
      if (!r.player_id) {
        if (r.side === 'A') scoresA[idx] = val;
        else scoresB[idx] = val;
      } else {
        const map = r.side === 'A' ? playerScoresA : playerScoresB;
        if (!map[r.player_id]) map[r.player_id] = Array(18).fill(null);
        map[r.player_id][idx] = val;
      }
    }

    return ok({
      match: { ...match, sideA, sideB, scoresA, scoresB, playerScoresA, playerScoresB },
      course
    });
  } catch (e: any) {
    return bad(e.message, 500);
  }
};
