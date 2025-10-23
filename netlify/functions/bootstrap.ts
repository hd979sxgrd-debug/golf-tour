// netlify/functions/bootstrap.ts
import { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, cors } from './_shared/http';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();

  const pool = getPool();
  try {
    const { rows: players } = await pool.query(
      `SELECT id, name, whs_hcp as "hcp" FROM players ORDER BY name`
    );
    const { rows: teams } = await pool.query(`SELECT id, name FROM teams ORDER BY name`);
    const { rows: teamPlayers } = await pool.query(
      `SELECT team_id, player_id FROM team_players`
    );

    const teamsWithMembers = teams.map((t: any) => ({
      ...t,
      playerIds: teamPlayers.filter((tp: any) => tp.team_id === t.id).map((tp: any) => tp.player_id),
    }));

    const { rows: courses } = await pool.query(
      `SELECT id, name, cr, slope, pars, stroke_idx as "strokeIndex" FROM courses ORDER BY name`
    );

    const { rows: matches } = await pool.query(
      `SELECT id, name, day_label as "day", format, course_id as "courseId",
              side_a_team_id as "sideATeamId", side_b_team_id as "sideBTeamId"
       FROM matches
       ORDER BY created_at DESC`
    );

    return ok({ players, teams: teamsWithMembers, courses, matches });
  } catch (e: any) {
    return bad(e.message, 500);
  }
};
