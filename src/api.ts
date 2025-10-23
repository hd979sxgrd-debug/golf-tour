import { Course, Match, MatchFormat, Player, Team } from './types';

const base = '';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

/** Если залогинен админ – добавляем Basic auth admin:belek2025! */
function adminAuthHeaders(): Record<string, string> {
  try {
    const role = localStorage.getItem('role');
    if (role === 'admin') {
      const token = btoa('admin:belek2025!');
      return { Authorization: `Basic ${token}` };
    }
  } catch {}
  return {};
}

export async function apiBootstrap() {
  return json<{ players: Player[]; teams: Team[]; courses: Course[]; matches: Match[] }>(
    await fetch(`${base}/.netlify/functions/bootstrap`, { method: 'GET' })
  );
}

export async function apiCreateMatch(payload: {
  id: string; name: string; day: string; format: MatchFormat; courseId: string;
  sideATeamId?: string; sideBTeamId?: string; sideAPlayerIds: string[]; sideBPlayerIds: string[];
}) {
  return json(await fetch(`${base}/.netlify/functions/match_create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify(payload)
  }));
}

export async function apiDeleteMatch(id: string) {
  return json(await fetch(`${base}/.netlify/functions/match_delete?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { ...adminAuthHeaders() }
  }));
}

export async function apiGetMatch(id: string) {
  return json<{ match: Match; course: Course }>(
    await fetch(`${base}/.netlify/functions/match?id=${encodeURIComponent(id)}`)
  );
}

export async function apiSubmitScore(payload: {
  matchId: string; side: 'A'|'B'; hole: number; playerId?: string | null; gross?: number | null; dash?: boolean;
}) {
  return json(await fetch(`${base}/.netlify/functions/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

/* --------- upsert для игроков/команд/полей --------- */

export async function apiUpsertPlayer(p: { id?: string; name: string; hcp?: number }) {
  return json(await fetch(`${base}/.netlify/functions/players_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify(p),
  }));
}

export async function apiUpsertTeam(t: { id?: string; name: string; playerIds: string[] }) {
  return json(await fetch(`${base}/.netlify/functions/teams_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify(t),
  }));
}

export async function apiUpsertCourse(c: Course) {
  return json(await fetch(`${base}/.netlify/functions/courses_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders() },
    body: JSON.stringify(c),
  }));
}
