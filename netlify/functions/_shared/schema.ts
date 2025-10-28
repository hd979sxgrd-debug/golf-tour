// netlify/functions/_shared/schema.ts
import type { Pool } from 'pg';

/**
 * Гарантирует стандартную схему matches:
 *  id text PK,
 *  name text,
 *  day text,
 *  format text,
 *  course_id text,
 *  side_a jsonb,
 *  side_b jsonb,
 *  side_a_team_id text,
 *  side_b_team_id text,
 *  created_at timestamptz
 *
 * Кроме того выполняет миграцию day_label -> day если нужно,
 * и сливает/копирует значения из day_label в day при наличии обеих колонок.
 */
export async function ensureMatchesSchema(pool: Pool) {
  // ----- миграция имён колонок day_label -> day -----
  try {
    const { rows } = await pool.query(`
      select column_name
        from information_schema.columns
       where table_name = 'matches'
         and column_name in ('day','day_label')
    `);
    const cols = rows.map((r: any) => r.column_name);

    // если есть day_label, но нет day — переименовать
    if (cols.includes('day_label') && !cols.includes('day')) {
      await pool.query(`alter table matches rename column day_label to day`);
    } else if (cols.includes('day_label') && cols.includes('day')) {
      // если есть обе — перенести значения из day_label в пустые day и удалить day_label
      await pool.query(`update matches set day = day_label where day is null and day_label is not null`);
      await pool.query(`alter table matches drop column if exists day_label`);
    }
  } catch (e) {
    // не фатально — логируем, но продолжаем гарантировать базовую схему
    console.error('ensureMatchesSchema: day_label -> day migration error:', e);
  }

  // ----- гарантируем базовую схему -----
  await pool.query(`
    alter table matches
      add column if not exists name text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists day text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists format text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists course_id text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists side_a jsonb default '[]'::jsonb;
  `);
  await pool.query(`
    alter table matches
      add column if not exists side_b jsonb default '[]'::jsonb;
  `);
  await pool.query(`
    alter table matches
      add column if not exists side_a_team_id text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists side_b_team_id text;
  `);
  await pool.query(`
    alter table matches
      add column if not exists handicap_snapshot jsonb default '{}'::jsonb;
  `);
  await pool.query(`
    alter table matches
      add column if not exists created_at timestamptz default now();
  `);
}