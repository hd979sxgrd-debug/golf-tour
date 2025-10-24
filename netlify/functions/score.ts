// netlify/functions/score.ts
import type { Handler } from '@netlify/functions';
import { Pool } from 'pg';

// ---- DB pool ----
const pool = new Pool({
  connectionString: process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---- helpers ----
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (code: number, body: any) => ({
  statusCode: code,
  headers: { 'content-type': 'application/json', ...corsHeaders },
  body: JSON.stringify(body),
});

const text = (code: number, body: string) => ({
  statusCode: code,
  headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders },
  body,
});

// ---- GET: вернуть список лунок ----
// ---- POST: upsert одной лунки ----
export const handler: Handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod === 'GET') {
      const matchId =
        (event.queryStringParameters?.matchId ||
          event.queryStringParameters?.id ||
          '').trim();

      if (!matchId) return json(400, { error: 'matchId is required' });

      const client = await pool.connect();
      try {
        // Возьмём все строки для матча, отсортированные по side/hole/player
        const { rows } = await client.query(
          `
          SELECT match_id, side, player_id, hole, gross, dash
          FROM hole_scores
          WHERE match_id = $1
          ORDER BY side, hole, COALESCE(player_id,'')
        `,
          [matchId]
        );

        // Возвращаем в универсальном формате (фронт подхватывает любые из этих ключей)
        return json(200, {
          matchId,
          rows,                // ← фронт умеет читать rows
          hole_scores: rows,   // ← и hole_scores
        });
      } finally {
        client.release();
      }
    }

    if (event.httpMethod === 'POST') {
      if (!event.body) return json(400, { error: 'empty body' });
      const payload = JSON.parse(event.body);

      const matchId: string = (payload.matchId ?? payload.match_id ?? '').trim();
      const side: 'A' | 'B' = String(payload.side || 'A').toUpperCase() === 'B' ? 'B' : 'A';
      const hole: number = Number(payload.hole);
      const playerId: string | null =
        payload.playerId === null || payload.playerId === undefined
          ? null
          : String(payload.playerId);
      const dash: boolean = Boolean(payload.dash);
      // если dash=true, gross принудительно null
      const gross: number | null = dash
        ? null
        : payload.gross === null || payload.gross === undefined
          ? null
          : Number(payload.gross);

      if (!matchId || !hole || hole < 1 || hole > 18) {
        return json(400, { error: 'matchId and hole (1..18) are required' });
      }

      const client = await pool.connect();
      try {
        // Вариант 1: если у вас есть уникальный индекс по (match_id, side, hole, player_id),
        // то используем ON CONFLICT по нему. Если player_id допускается NULL и у индекса
        // есть выражение COALESCE(player_id,'*'), поменяйте соответствующе target.
        //
        // Ниже — наиболее совместимый способ: сначала DELETE, затем INSERT (имитируем upsert).
        // Работает независимо от наличия/отсутствия уникального индекса.
        await client.query('BEGIN');

        // Удаляем предыдущую запись того же ключа (side,hole,player_id)
        await client.query(
          `
          DELETE FROM hole_scores
          WHERE match_id = $1
            AND side = $2
            AND hole = $3
            AND (
              (player_id IS NULL AND $4::text IS NULL)
              OR (player_id = $4::text)
            )
        `,
          [matchId, side, hole, playerId]
        );

        // Вставляем новую (или "прочерк" gross = null, dash = true/false)
        await client.query(
          `
          INSERT INTO hole_scores (match_id, side, player_id, hole, gross, dash)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [matchId, side, playerId, hole, gross, dash]
        );

        await client.query('COMMIT');

        return json(200, { ok: true });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // unknown method
    return text(405, 'Method Not Allowed');
  } catch (e: any) {
    console.error('[score] error:', e);
    return json(500, { error: e?.message || String(e) });
  }
};
