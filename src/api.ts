// src/api.ts
export type ApiMatchResp = {
  match: any;
  course: any;
  hole_scores?: any[];
  holeScores?: any[];
};

const base = '/.netlify/functions';

async function http<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'omit', ...init });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return undefined as unknown as T;
}

/* ---------- bootstrap / matches ---------- */

export async function apiBootstrap() {
  return http<{ players:any[]; teams:any[]; courses:any[]; matches:any[] }>(
    `${base}/bootstrap`
  );
}

export async function apiCreateMatch(payload: any) {
  return http(`${base}/match_create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteMatch(id: string) {
  return http(`${base}/match_delete?id=${encodeURIComponent(id)}`, { method: 'POST' });
}

export async function apiSubmitScore(payload: {
  matchId: string;
  hole: number;
  side: 'A' | 'B';
  playerId: string | null; // важно: не undefined
  gross: number | null;
  dash: boolean;
}) {
  return http(`${base}/score`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Получить матч + курс + гарантированно hole_scores.
 * Даже если /match не отдаёт лунки, подтянем их отдельным запросом /score?matchId=...
 */
export async function apiGetMatchWithScores(matchId: string): Promise<{
  match: any & { hole_scores?: any[] };
  course: any;
}> {
  const basic = await http<ApiMatchResp>(`${base}/match?id=${encodeURIComponent(matchId)}`);

  const hasTable =
    (Array.isArray((basic as any).hole_scores) && (basic as any).hole_scores.length > 0) ||
    (Array.isArray((basic as any).holeScores) && (basic as any).holeScores.length > 0);

  if (hasTable) {
    const hole_scores = (basic as any).hole_scores ?? (basic as any).holeScores;
    return {
      match: { ...basic.match, hole_scores },
      course: basic.course,
    };
  }

  // fallback: дотягиваем /score
  let hole_scores: any[] = [];
  try {
    const scorePayload = await http<{ rows?: any[]; hole_scores?: any[]; data?: any[] }>(
      `${base}/score?matchId=${encodeURIComponent(matchId)}`
    );
    if (Array.isArray((scorePayload as any).hole_scores)) {
      hole_scores = (scorePayload as any).hole_scores!;
    } else if (Array.isArray((scorePayload as any).rows)) {
      hole_scores = (scorePayload as any).rows!;
    } else if (Array.isArray((scorePayload as any).data)) {
      hole_scores = (scorePayload as any).data!;
    }
  } catch {
    // ок — значит публичного списка лунок нет
  }

  return {
    match: { ...basic.match, hole_scores },
    course: basic.course,
  };
}

/** Обёртка для совместимости: старый код импортирует apiGetMatch */
export async function apiGetMatch(matchId: string) {
  return apiGetMatchWithScores(matchId);
}

/* ---------- admin upserts ---------- */

export async function apiUpsertPlayer(payload: any) {
  return http(`${base}/players_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function apiUpsertTeam(payload: any) {
  return http(`${base}/teams_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function apiUpsertCourse(payload: any) {
  // вы переименовали функцию на courses_upsert — используем правильный путь
  return http(`${base}/courses_upsert`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
