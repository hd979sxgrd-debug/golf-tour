// src/utils.ts
import { Course, Match, MatchSide, Player, Team } from './types'

export const LS_KEY = 'golf-mini-site-state-v6';
export const uid = (prefix='id') => `${prefix}_${Math.random().toString(36).slice(2,9)}`;
export const defaultPars = () => [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4];
export const sum = (arr:(number|null)[]) => arr.reduce((a,v)=> a + (typeof v==='number'? v:0), 0);
export const coursePar = (course: Course) => (course.pars?.reduce((a,b)=>a+b,0)) || 72;

type HoleRow = {
  side?: string;
  hole?: number | string;
  gross?: number | string | null;
  score?: number | string | null;
  dash?: boolean;
  player_id?: string | null;
  playerId?: string | null;
  player_key?: string | null;
  playerKey?: string | null;
};

const emptyGrossRow = () => Array(18).fill(undefined) as (number | null | undefined)[];

const normalizeValue = (val: any): number | null | undefined => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};

const extractPlayerId = (row: HoleRow): string | null => {
  return (
    row.player_id ??
    row.playerId ??
    row.player_key ??
    row.playerKey ??
    null
  );
};

export function extractHoleTable(anyM: any): HoleRow[] {
  if (!anyM) return [];
  if (Array.isArray(anyM.hole_scores)) return anyM.hole_scores as HoleRow[];
  if (Array.isArray(anyM.holeScores)) return anyM.holeScores as HoleRow[];
  if (Array.isArray(anyM.scores)) return anyM.scores as HoleRow[];
  if (Array.isArray(anyM.rows)) return anyM.rows as HoleRow[];
  for (const key of Object.keys(anyM)) {
    const value = (anyM as any)[key];
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (first && typeof first === 'object' && 'hole' in first && 'side' in first) {
        return value as HoleRow[];
      }
    }
  }
  return [];
}

const cloneSide = (side?: MatchSide[] | null): MatchSide[] => {
  if (!Array.isArray(side)) return [];
  return side.map(item => ({ ...item }));
};

const clonePlayerScores = (src: Record<string, any> | undefined | null) => {
  const result: Record<string, (number | null | undefined)[]> = {};
  if (!src || typeof src !== 'object') return result;
  for (const [pid, arr] of Object.entries(src)) {
    const target = emptyGrossRow();
    if (Array.isArray(arr)) {
      arr.forEach((value, index) => {
        if (index < 18) target[index] = normalizeValue(value);
      });
    }
    result[pid] = target;
  }
  return result;
};

const compactPlayerScores = (src: Record<string, (number | null | undefined)[]>) => {
  const result: Record<string, (number | null | undefined)[]> = {};
  for (const [pid, arr] of Object.entries(src)) {
    if (arr.some(value => value !== undefined)) {
      result[pid] = arr;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

const normalizeHandicapSnapshot = (raw: any): Record<string, number | null | undefined> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const snapshot: Record<string, number | null | undefined> = {};
  for (const [pid, value] of Object.entries(raw)) {
    if (!pid) continue;
    if (value === null) {
      snapshot[pid] = null;
      continue;
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) {
      snapshot[pid] = num;
    }
  }
  return Object.keys(snapshot).length ? snapshot : undefined;
};

const handicapFromSnapshot = (match: Match | undefined, playerId: string): number | undefined => {
  const raw = match?.handicapSnapshot?.[playerId];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw != null) {
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
};

export function normalizeMatch(raw: any): Match {
  const table = extractHoleTable(raw);

  const baseScoresA = emptyGrossRow();
  const baseScoresB = emptyGrossRow();

  const match: Match = {
    id: raw.id,
    name: raw.name,
    day: raw.day ?? raw.day_label ?? raw.match_day ?? undefined,
    format: raw.format,
    courseId: raw.courseId ?? raw.course_id,
    sideATeamId: raw.sideATeamId ?? raw.side_a_team_id ?? undefined,
    sideBTeamId: raw.sideBTeamId ?? raw.side_b_team_id ?? undefined,
    sideA: cloneSide(raw.sideA ?? raw.side_a),
    sideB: cloneSide(raw.sideB ?? raw.side_b),
    scoresA: baseScoresA,
    scoresB: baseScoresB,
    playerScoresA: undefined,
    playerScoresB: undefined,
    handicapSnapshot: normalizeHandicapSnapshot(raw.handicapSnapshot ?? raw.handicap_snapshot),
    notes: raw.notes,
  };

  if (Array.isArray(raw.scoresA)) {
    raw.scoresA.forEach((value: any, index: number) => {
      if (index < 18) match.scoresA[index] = normalizeValue(value);
    });
  }
  if (Array.isArray(raw.scoresB)) {
    raw.scoresB.forEach((value: any, index: number) => {
      if (index < 18) match.scoresB[index] = normalizeValue(value);
    });
  }

  const initialPlayerScoresA = clonePlayerScores(raw.playerScoresA ?? raw.player_scores_a);
  const initialPlayerScoresB = clonePlayerScores(raw.playerScoresB ?? raw.player_scores_b);

  let perPlayerA = initialPlayerScoresA;
  let perPlayerB = initialPlayerScoresB;

  const ensurePlayerRow = (
    container: Record<string, (number | null | undefined)[]>,
    pid: string,
  ) => {
    if (!container[pid]) {
      container[pid] = emptyGrossRow();
    }
    return container[pid];
  };

  if (table.length > 0) {
    perPlayerA = { ...perPlayerA };
    perPlayerB = { ...perPlayerB };

    table.forEach((row) => {
      const side = String(row.side || 'A').toUpperCase() === 'B' ? 'B' : 'A';
      const holeIndex = Math.min(
        17,
        Math.max(0, parseInt(String(row.hole ?? 0), 10) - 1)
      );
      const dash = Boolean(row.dash);
      const rawGross = row.gross ?? row.score ?? null;
      const value = dash ? -1 : normalizeValue(rawGross);
      const pid = extractPlayerId(row);

      if (side === 'A') {
        if (pid) {
          ensurePlayerRow(perPlayerA, pid)[holeIndex] = value;
        } else {
          match.scoresA[holeIndex] = value;
        }
      } else {
        if (pid) {
          ensurePlayerRow(perPlayerB, pid)[holeIndex] = value;
        } else {
          match.scoresB[holeIndex] = value;
        }
      }
    });
  }

  match.playerScoresA = compactPlayerScores(perPlayerA);
  match.playerScoresB = compactPlayerScores(perPlayerB);

  return match;
}

export function normalizeMatches(rawMatches: any[]): Match[] {
  return Array.isArray(rawMatches) ? rawMatches.map(normalizeMatch) : [];
}

export function toCourseHandicap(hi: number|undefined, course: Course): number{
  if(!hi) return 0;
  const slope = course.slope ?? 113;
  const cr = course.cr ?? coursePar(course);
  const par = coursePar(course);
  return Math.round(hi*(slope/113) + (cr - par));
}

/** По требованию — и для singles, и для best ball используем 75% */
export const allowanceFor = (_fmt: Match['format']) => 0.75;

export function shotsOnHole(courseHcp:number, holeIdx:number, si?:number[]){
  if(!si || si.length!==18) return 0;
  const idx = si[holeIdx];
  let s = 0;
  if (courseHcp >= idx) s++;
  if (courseHcp > 18 && (courseHcp-18) >= idx) s++;
  if (courseHcp > 36 && (courseHcp-36) >= idx) s++;
  return s;
}

export function flattenPlayerIds(side: MatchSide[], teams: Team[]): string[] {
  return side.flatMap(s => s.type==='player' ? [s.id] : (teams.find(t=>t.id===s.id)?.playerIds ?? []));
}
export function nameOfSide(side: MatchSide[], players: Player[], teams: Team[]){
  const ids = flattenPlayerIds(side, teams);
  return ids.map(id => players.find(p=>p.id===id)?.name ?? '?').join(' & ');
}

export function playerCourseHcpWithAllowance(fmt: Match['format'], player: Player, course: Course, match?: Match){
  const snapshotHi = handicapFromSnapshot(match, player.id);
  const hi = (snapshotHi ?? player.hcp) ?? 0;
  const ch = toCourseHandicap(hi, course);
  return Math.round(ch * allowanceFor(fmt));
}
export function strokeCountForPlayer(fmt: Match['format'], player: Player, course: Course, holeIdx:number, match?: Match){
  const chA = playerCourseHcpWithAllowance(fmt, player, course, match);
  return shotsOnHole(chA, holeIdx, course.strokeIndex);
}
export function strokeStarsForPlayer(fmt: Match['format'], player: Player, course: Course, holeIdx:number, match?: Match){
  const n = strokeCountForPlayer(fmt, player, course, holeIdx, match);
  return n<=0 ? '' : (n===1 ? '*' : '**');
}
export function grossFromDash(fmt: Match['format'], player: Player, course: Course, holeIdx:number, match?: Match){
  const par = course.pars?.[holeIdx] ?? 4;
  const shots = strokeCountForPlayer(fmt, player, course, holeIdx, match);
  return par + shots + 2;
}
export function grossFor(playerScores: Record<string,(number|null)[]>|undefined, pid:string, holeIdx:number): number|null {
  const v = playerScores?.[pid]?.[holeIdx];
  if (v === -1) return -1;
  return (typeof v === 'number') ? v : null;
}

export function sideNetOnHole(params:{
  format: Match['format']; holeIdx: number; side: MatchSide[];
  grossRow?: (number|null)[]; playerScores?: Record<string,(number|null)[]>;
  players: Player[]; teams: Team[]; course: Course; match?: Match;
}): {net:number|null, meta:{usedPid?:string, forfeit?:boolean}} {
  const { format, holeIdx, side, grossRow, playerScores, players, teams, course, match } = params;
  const si = course.strokeIndex;
  const ids = flattenPlayerIds(side, teams);

  const playerNet = (pid:string): number|null => {
    const p = players.find(q=>q.id===pid);
    if (!p) return null;
    const g = grossFor(playerScores, pid, holeIdx);
    if (g === -1) return null; // dash
    if (g == null) return null;
    const chA = playerCourseHcpWithAllowance(format, p, course, match);
    return g - shotsOnHole(chA, holeIdx, si);
  };

  if (format==='singles'){
    const pid = ids[0];
    if (!pid){
      const g = grossRow?.[holeIdx];
      return { net: (typeof g==='number'? g:null), meta:{} };
    }
    const net = playerNet(pid);
    if (net == null){
      const g = playerScores?.[pid]?.[holeIdx];
      if (g === -1) return { net:null, meta:{ forfeit:true } };
    }
    return { net, meta:{} };
  }

  let best: {net:number, pid:string} | null = null;
  for (const pid of ids){
    const net = playerNet(pid);
    if (net==null) continue;
    if (!best || net < best.net) best = { net, pid };
  }
  if (best) return { net: best.net, meta:{ usedPid: best.pid } };

  const g = grossRow?.[holeIdx];
  return { net: (typeof g==='number'? g:null), meta:{} };
}

export function holeResultSingles(a:{net:number|null,forfeit?:boolean}, b:{net:number|null,forfeit?:boolean}): 'A'|'B'|'AS'|null {
  if (a.forfeit && b.forfeit) return 'AS';
  if (a.forfeit) return 'B';
  if (b.forfeit) return 'A';
  if (a.net==null || b.net==null) return null;
  if (a.net < b.net) return 'A';
  if (b.net < a.net) return 'B';
  return 'AS';
}
export function holeResultGeneric(a:number|null, b:number|null): 'A'|'B'|'AS'|null {
  if (a==null || b==null) return null; if (a<b) return 'A'; if (b<a) return 'B'; return 'AS';
}

export function calcMatchPlayStatus(match:Match, players:Player[], teams:Team[], course:Course){
  let up = 0; const perHole: ('A'|'B'|'AS'|null)[] = [];
  for (let i=0;i<18;i++){
    const a = sideNetOnHole({ format: match.format, holeIdx:i, side: match.sideA, grossRow: match.scoresA, playerScores: match.playerScoresA, players, teams, course, match });
    const b = sideNetOnHole({ format: match.format, holeIdx:i, side: match.sideB, grossRow: match.scoresB, playerScores: match.playerScoresB, players, teams, course, match });
    const r = (match.format==='singles')
      ? holeResultSingles({ net:a.net, forfeit: a.meta.forfeit }, { net:b.net, forfeit: b.meta.forfeit })
      : holeResultGeneric(a.net, b.net);
    perHole.push(r);
    if (r==='A') up++; else if (r==='B') up--;
  }
  let status = 'All square'; if (up>0) status = `A ${up} up`; if (up<0) status = `B ${Math.abs(up)} up`;
  return { up, status, perHole };
}

export function calcPoints(perHole:('A'|'B'|'AS'|null)[]){
  const seg = (from:number,to:number)=>{ let a=0,b=0; for(let i=from;i<=to;i++){ const r=perHole[i]; if(r==='A') a++; else if(r==='B') b++; } if(a>b) return {A:1,B:0}; if(b>a) return {A:0,B:1}; return {A:0.5,B:0.5}; };
  const f = seg(0,8), bk = seg(9,17);
  let a=0,b=0; perHole.forEach(r=>{ if(r==='A') a++; else if(r==='B') b++; });
  const m = a>b?{A:1,B:0}: a<b?{A:0,B:1}:{A:0.5,B:0.5};
  return { A:f.A+bk.A+m.A, B:f.B+bk.B+m.B, detail:{frontA:f.A,frontB:f.B,backA:bk.A,backB:bk.B,matchA:m.A,matchB:m.B} };
}

/** OUT/IN/TOT статус с разницей очков */
export function outIn(perHole:('A'|'B'|'AS'|null)[]){
  let outA=0,outB=0,inA=0,inB=0;
  perHole.slice(0,9).forEach(r=>{ if(r==='A') outA++; else if(r==='B') outB++; });
  perHole.slice(9).forEach(r=>{ if(r==='A') inA++; else if(r==='B') inB++; });

  const label = (a:number,b:number)=>{
    if (a===b) return 'AS';
    const diff = Math.abs(a-b);
    return a>b ? `${diff} UP` : `${diff} DN`;
  };

  return {
    out: label(outA, outB),
    in:  label(inA, inB),
    tot: label(outA+inA, outB+inB),
  };
}

/** Прогресс матча: started/finished на основе рассчитанных лунок */
export function matchProgress(match:Match, players:Player[], teams:Team[], course:Course){
  const { perHole } = calcMatchPlayStatus(match, players, teams, course);
  const done = perHole.filter(r => r !== null).length;
  return {
    started: done > 0,
    finished: done === 18,
    holesDone: done
  };
}
