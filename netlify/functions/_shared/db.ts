// netlify/functions/_shared/db.ts
import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool() {
  if (_pool) return _pool;
  const connStr = process.env.DATABASE_URL!;
  if (!connStr) throw new Error('DATABASE_URL is not set');
  _pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  return _pool;
}