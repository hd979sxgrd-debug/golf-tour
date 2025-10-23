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
 */
export async function ensureMatchesSchema(pool: Pool) {
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
      add column if not exists created_at timestamptz default now();
  `);
}
