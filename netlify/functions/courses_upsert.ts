// netlify/functions/courses_upsert.ts
import type { Handler } from '@netlify/functions';
import { getPool } from './_shared/db';
import { ok, bad, methodNotAllowed, handleOptions, readJson } from './_shared/http';
import type { Pool } from 'pg';

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

async function resolveSiColumn(pool: Pool): Promise<'stroke_index' | 'si' | 'strokeindex'> {
  const { rows } = await pool.query(
    `select column_name 
     from information_schema.columns 
     where table_name = 'courses' and column_name in ('stroke_index','si','strokeindex')`
  );
  if (rows.length > 0) {
    const name = rows[0].column_name as 'stroke_index' | 'si' | 'strokeindex';
    return name;
  }
  // ни одной подходящей — создаём стандартную
  await pool.query(`alter table courses add column if not exists stroke_index int[]`);
  return 'stroke_index';
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

    const pool = getPool();
    const siCol = await resolveSiColumn(pool); // 'stroke_index' | 'si' | 'strokeindex'
    // Безопасно используем только whitelisted имя колонки:
    const sql = `
      insert into courses (id, name, cr, slope, pars, ${siCol})
      values ($1, $2, $3, $4, $5, $6)
      on conflict (id) do update set
        name = excluded.name,
        cr = excluded.cr,
        slope = excluded.slope,
        pars = excluded.pars,
        ${siCol} = excluded.${siCol}
      returning id, name, cr, slope, pars, ${siCol} as stroke_index
    `;
    const { rows } = await pool.query(sql, [id, name, cr, slope, pars, strokeIndex]);

    // Возвращаем в camelCase для фронта
    return ok({
      course: {
        id: rows[0].id,
        name: rows[0].name,
        cr: rows[0].cr,
        slope: rows[0].slope,
        pars: rows[0].pars,
        strokeIndex: rows[0].stroke_index
      }
    });
  } catch (e: any) {
    console.error(e);
    return bad(e.message || 'courses_upsert failed', 500);
  }
};
