// src/api.ts
import { Course, Match, Player, Team } from './types';

const base = '/.netlify/functions';

export type BootstrapPayload = {
  players: Player[];
  teams: (Team & { playerIds: string[] })[];
  courses: Course[];
  matches: Match[];
};

export async function apiBootstrap(): Promise<BootstrapPayload> {
  const r = await fetch(`${base}/bootstrap`, { credentials: 'omit' });
  if (!r.ok) throw new Error('bootstrap failed');
  return r.json();
}

export async function apiGetMatch(id: string): Promise<{ match: Match; course: Course }> {
  const r = await fetch(`${base}/match?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error('match not found');
  return r.json();
}

export async function apiSubmitScore(input: {
  matchId: string; side: 'A'|'B'; hole: number; playerId?: string|null; gross?: number|null; dash?: boolean;
}) {
  const r = await fetch(`${base}/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(`score failed: ${msg}`);
  }
  return r.json();
}

export async function apiCreateMatch(payload: {
  id: string; name: string; day: string; format: 'singles'|'fourball'; courseId: string;
  sideATeamId?: string; sideBTeamId?: string; sideAPlayerIds: string[]; sideBPlayerIds: string[];
}) {
  const r = await fetch(`${base}/match_create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': '1' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('create match failed');
  return r.json();
}

export async function apiDeleteMatch(id: string) {
  const r = await fetch(`${base}/match_delete?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': '1' }
  });
  if (!r.ok) throw new Error('delete match failed');
  return r.json();
}
