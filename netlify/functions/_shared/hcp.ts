import type { Pool } from 'pg';

const HCP_COLUMNS = ['hcp', 'hi', 'handicap'] as const;
export type PlayerHcpColumn = typeof HCP_COLUMNS[number];

export async function resolvePlayerHcpColumn(pool: Pool): Promise<PlayerHcpColumn> {
  const { rows } = await pool.query(
    `select column_name
       from information_schema.columns
      where table_name = 'players'
        and column_name = any($1::text[])
      order by case column_name
                 when 'hcp' then 1
                 when 'hi' then 2
                 when 'handicap' then 3
               end asc
      limit 1`,
    [HCP_COLUMNS]
  );
  if (rows.length > 0) return rows[0].column_name as PlayerHcpColumn;

  await pool.query(`alter table players add column if not exists hcp real`);
  return 'hcp';
}

export async function buildHandicapSnapshot(
  pool: Pool,
  playerIds: string[],
  hcpColumn?: PlayerHcpColumn,
): Promise<Record<string, number | null>> {
  const unique = Array.from(new Set(playerIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const column = hcpColumn ?? (await resolvePlayerHcpColumn(pool));
  const { rows } = await pool.query(
    `select id, ${column} as hcp from players where id = any($1::text[])`,
    [unique]
  );

  const snapshot: Record<string, number | null> = {};
  rows.forEach((row: any) => {
    snapshot[row.id] = row.hcp ?? null;
  });
  // гарантируем наличие ключа даже если игрок был удалён
  unique.forEach((pid) => {
    if (!(pid in snapshot)) snapshot[pid] = null;
  });
  return snapshot;
}
