// netlify/functions/score.ts
import { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, cors } from './_shared/http';

type Body = {
  matchId: string;
  side: 'A'|'B';
  hole: number;             // 1..18
  playerId?: string|null;   // null => командный gross
  gross?: number|null;      // если dash=true, gross игнорим
  dash?: boolean;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors();
  if (event.httpMethod !== 'POST') return bad('POST only', 405);

  let body: Body;
  try { body = JSON.parse(event.body || '{}'); } catch { return bad('Invalid JSON'); }

  const { matchId, side, hole, playerId } = body;
  if (!matchId || !side || !hole) return bad('matchId, side, hole are required');
  if (hole < 1 || hole > 18) return bad('hole must be 1..18');

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO hole_scores (match_id, side, player_id, hole, gross, dash)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (match_id, side, player_key, hole)
       DO UPDATE SET gross = EXCLUDED.gross, dash = EXCLUDED.dash`,
      [
        matchId,
        side,
        playerId ?? null,
        hole,
        body.dash ? null : (typeof body.gross === 'number' ? body.gross : null),
        !!body.dash
      ]
    );

    return ok({ ok: true });
  } catch (e:any) {
    return bad(e.message, 500);
  }
};
