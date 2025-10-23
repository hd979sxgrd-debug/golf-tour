import type { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';

type Payload = {
  id?: string;
  name: string;
  cr?: number | null;
  slope?: number | null;
  pars: number[];
  strokeIndex: number[];
};

function isIntArray(arr: unknown, len: number) {
  return Array.isArray(arr) && arr.length === len && arr.every(n => Number.isInteger(n));
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  try {
    const body = await readJson<Payload>(event.body);
    const id = body.id ?? crypto.randomUUID();
    const name = (body.name || '').trim();
    const cr = body.cr ?? null;
    const slope = body.slope ?? null;
    const pars = body.pars;
    const strokeIndex = body.strokeIndex;

    if (!name) return bad('name is required');
    if (!isIntArray(pars, 18)) return bad('pars must be int[18]');
    if (!isIntArray(strokeIndex, 18)) return bad('strokeIndex must be int[18]');

    const sql = `
      INSERT INTO courses (id, name, cr, slope, pars, stroke_index)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        cr = EXCLUDED.cr,
        slope = EXCLUDED.slope,
        pars = EXCLUDED.pars,
        stroke_index = EXCLUDED.stroke_index
      RETURNING id, name, cr, slope, pars, stroke_index
    `;
    const pool = getPool();
    const { rows } = await pool.query(sql, [id, name, cr, slope, pars, strokeIndex]);

    return ok({ course: { ...rows[0], strokeIndex: rows[0].stroke_index } });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'courses_upsert failed', 500);
  }
};
