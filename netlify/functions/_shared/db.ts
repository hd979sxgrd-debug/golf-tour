import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool() {
  if (_pool) return _pool;

  const connStr =
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED;

  if (!connStr) {
    throw new Error(
      'DATABASE_URL is not set (also tried NETLIFY_DATABASE_URL / NETLIFY_DATABASE_URL_UNPOOLED)'
    );
  }

  _pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL
    max: 5,
  });

  return _pool;
}
