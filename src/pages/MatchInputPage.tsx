import React, { useEffect, useMemo, useState } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";

/* ---------- helpers ---------- */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75; // по вашему требованию

const safePars = (c: Course) => (Array.isArray(c.pars) && c.pars.length === 18 ? c.pars : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4]);
const safeSI   = (c: Course) => (Array.isArray(c.strokeIndex) && c.strokeIndex.length === 18 ? c.strokeIndex : Array(18).fill(null));
const coursePar = (c: Course) => safePars(c).reduce((a,b)=>a+b,0);
const toCourseHcp = (hi: number|undefined, c: Course) => {
  if (hi == null) return 0;
  const slope = c.slope ?? 113, cr = c.cr ?? coursePar(c), par = coursePar(c);
  return Math.round(hi * (slope/113) + (cr - par));
};
const shotsOnHole = (ch:number, holeIdx:number, si?: (number|null)[]) => {
  if (!si || si.length !== 18) return 0;
  const idx = si[holeIdx] ?? 99;
  let s = 0; if (ch >= idx) s++; if (ch>18 && ch-18>=idx) s++; if (ch>36 && ch-36>=idx) s++;
  return s;
};
const stars = (n:number) => (n>=2?'**': n===1?'*':'');
const expandSide = (side: MatchSide[], teams: Team[]) => {
  const ids: string[] = [];
  for (const s of side) {
    if (s.type === "player") ids.push(s.id);
    else { const t = teams.find(tt=>tt.id===s.id); if (t) ids.push(...t.playerIds); }
  }
  return Array.from(new Set(ids));
};
const nameOfSide = (side: MatchSide[], players: Player[], teams: Team[]) =>
  expandSide(side, teams).map(id => players.find(p=>p.id===id)?.name ?? "—").join(" & ");

type Draft = {
  A: { team: number|null| -1; players: Record<string, number|null| -1> };
  B: { team: number|null| -1; players: Record<string, number|null| -1> };
};

/** Собираем playerScoresA/B и командные scoresA/B из ответа БД (hole_scores) */
function normalizeMatchScores(m: Match): Match {
  const anyM: any = m as any;
  const table: Array<{side:'A'|'B'; player_id: string|null; hole:number; gross:number|null; dash?:boolean}>
    = anyM.hole_scores || anyM.holeScores || [];

  if (!table.length) return m; // уже есть разложенные поля — используем как есть

  const scoresA = Array(18).fill(null) as (number|null)[];
  const scoresB = Array(18).fill(null) as (number|null)[];
  const pA: Record<string,(number|null)[]> = {};
  const pB: Record<string,(number|null)[]> = {};

  for (const row of table) {
    const i = Math.max(1, Math.min(18, row.hole)) - 1;
    const val: number|null = row.gross;              // dash=true => gross=null
    if (row.side === 'A') {
      if (row.player_id) {
        if (!pA[row.player_id]) pA[row.player_id] = Array(18).fill(undefined) as any;
        pA[row.player_id][i] = val;
      } else {
        scoresA[i] = val;
      }
    } else {
      if (row.player_id) {
        if (!pB[row.player_id]) pB[row.player_id] = Array(18).fill(undefined) as any;
        pB[row.player_id][i] = val;
      } else {
        scoresB[i] = val;
      }
    }
  }
  return { ...m, scoresA, scoresB, playerScoresA: pA, playerScoresB: pB };
}

/* ---------- component ---------- */
type Props = {
  match: Match;
  course: Course;
  players: Player[];
  teams: Team[];
  onScore: (p:{ side:'A'|'B'; hole:number; playerId:string|null; gross:number|null; dash:boolean; }) => Promise<any>;
  refetch: () => Promise<void>;
  focusPlayerId?: string;
};

export default function MatchInputPage({ match: rawMatch, course, players, teams, onScore, refetch, focusPlayerId }: Props){
  const match = useMemo(()=>normalizeMatchScores(rawMatch), [rawMatch]);

  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);
  const perPlayerMode = match.format === "fourball" && (aIds.length > 2 || bIds.length > 2);

  // ——— первая НЕЗАПОЛНЕННАЯ лунка: undefined = пусто; null = прочерк (считаем ЗАПОЛНЕНО)
  const firstUnfilledHole = useMemo(() => {
    for (let i=0;i<18;i++){
      if (perPlayerMode){
        const aEmpty = aIds.some(pid => (match.playerScoresA?.[pid] ?? [])[i] === undefined);
        const bEmpty = bIds.some(pid => (match.playerScoresB?.[pid] ?? [])[i] === undefined);
        if (aEmpty || bEmpty) return i+1;
      } else {
        const a = (match.scoresA || [])[i];
        const b = (match.scoresB || [])[i];
        if (a === undefined || b === undefined) return i+1;
      }
    }
    return 1;
  }, [match.id, JSON.stringify(match.playerScoresA), JSON.stringify(match.playerScoresB), JSON.stringify(match.scoresA), JSON.stringify(match.scoresB)]);

  const [hole, setHole] = useState<number>(firstUnfilledHole);
  useEffect(()=>{ setHole(firstUnfilledHole); }, [firstUnfilledHole]);

  const aName = nameOfSide(match.sideA, players, teams);
  const bName = nameOfSide(match.sideB, players, teams);
  const pars = safePars(course); const sis = safeSI(course);
  const par = pars[hole-1]; const si = sis[hole-1];

  // черновик текущей лунки
  const buildDraft = (h:number): Draft => {
    const i = h-1;
    const d: Draft = { A:{team: (match.scoresA||[])[i] ?? null, players: {}}, B:{team: (match.scoresB||[])[i] ?? null, players: {}} };
    aIds.forEach(pid => d.A.players[pid] = (match.playerScoresA?.[pid] ?? [])[i] ?? null);
    bIds.forEach(pid => d.B.players[pid] = (match.playerScoresB?.[pid] ?? [])[i] ?? null);
    return d;
  };
  const [draft, setDraft] = useState<Draft>(buildDraft(hole));
  useEffect(()=>{ setDraft(buildDraft(hole)); }, [hole, rawMatch]); // rawMatch — чтобы реагировать на refetch

  // side toggle для 5v5
  const [side, setSide] = useState<'A'|'B'>('A');

  const updateTeam = (s:'A'|'B', v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], team: v }}));
  const updatePlayer = (s:'A'|'B', pid:string, v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], players: { ...prev[s].players, [pid]: v } }}));

  // ——— сохранение текущей лунки
  const persistHole = async () => {
    const i = hole-1;
    const tasks: Promise<any>[] = [];

    const send = (side:'A'|'B', playerId:string|null, v:number|null| -1) => {
      const gross = v===-1 ? null : (v==null ? null : v);
      const dash  = v===-1;
      // ВАЖНО: всегда передаём playerId (строка | null), НИКОГДА undefined
      return onScore({ side, hole, playerId, gross, dash });
    };

    if (perPlayerMode){
      for (const pid of aIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresA?.[pid] ?? [])[i];
        const curr = draft.A.players[pid];
        if (curr !== prev) tasks.push(send('A', pid, curr));
      }
      for (const pid of bIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresB?.[pid] ?? [])[i];
        const curr = draft.B.players[pid];
        if (curr !== prev) tasks.push(send('B', pid, curr));
      }
    } else {
      const prevA = (match.scoresA || [])[i];
      const prevB = (match.scoresB || [])[i];
      if (draft.A.team !== prevA) tasks.push(send('A', null, draft.A.team));
      if (draft.B.team !== prevB) tasks.push(send('B', null, draft.B.team));
    }

    if (tasks.length) await Promise.all(tasks);
    await refetch(); // подтянуть сохранённые значения
  };

  const go = async (dir:-1|1) => {
    await persistHole();
    setHole(h => Math.max(1, Math.min(18, h + dir)));
  };

  // UI

  const renderPerPlayer = (s:'A'|'B') => {
    const ids = s==='A' ? aIds : bIds;
    const rows = (focusPlayerId && ids.includes(focusPlayerId)) ? [focusPlayerId] : ids;

    return (
      <div className="grid gap-2">
        {rows.map(pid=>{
          const pl = players.find(p=>p.id===pid);
          const hi = toCourseHcp(pl?.hcp, course);
          const allow = match.format==='singles'?ALLOW_SINGLES:ALLOW_FOURBALL;
          const sh = shotsOnHole(Math.round(hi*allow), hole-1, sis);
          const v = draft[s].players[pid] ?? null;
          return (
            <div key={pid} className="flex items-center gap-2">
              <div className="w-36 text-sm truncate">{pl?.name ?? 'Игрок'} <span className="text-xs text-gray-500">{stars(sh)}</span></div>
              <button className="px-3 py-2 border rounded" onClick={()=>updatePlayer(s,pid, typeof v==='number' && v>1 ? v-1 : 1)}>−</button>
              <input className="w-16 text-center border rounded py-2"
                inputMode="numeric"
                value={v===-1? '' : (v ?? '')}
                placeholder="-"
                onChange={(e)=>{
                  const t = e.target.value.trim();
                  if (t==='') { updatePlayer(s,pid, null); return; }
                  const n = parseInt(t,10); if (!Number.isNaN(n)) updatePlayer(s,pid, n);
                }}
              />
              <button className="px-3 py-2 border rounded" onClick={()=>updatePlayer(s,pid, typeof v==='number' ? v+1 : 1)}>+</button>
              <button className={`px-3 py-2 border rounded ${v===-1?'bg-gray-100':''}`} onClick={()=>updatePlayer(s,pid, -1)} title="Прочерк">—</button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTeam = () => (
    <div className="grid grid-cols-2 gap-8">
      {(['A','B'] as const).map(s=>{
        const label = s==='A'?aName:bName;
        const v = draft[s].team;
        return (
          <div key={s}>
            <div className="mb-2 font-semibold">{label}</div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 border rounded" onClick={()=>updateTeam(s, typeof v==='number' && v>1 ? v-1 : 1)}>−</button>
              <input className="w-16 text-center border rounded py-2"
                inputMode="numeric"
                value={v===-1? '' : (v ?? '')}
                placeholder="-"
                onChange={(e)=>{
                  const t=e.target.value.trim();
                  if (t==='') { updateTeam(s, null); return; }
                  const n=parseInt(t,10); if(!Number.isNaN(n)) updateTeam(s, n);
                }}
              />
              <button className="px-3 py-2 border rounded" onClick={()=>updateTeam(s, typeof v==='number' ? v+1 : 1)}>+</button>
              <button className={`px-3 py-2 border rounded ${v===-1?'bg-gray-100':''}`} onClick={()=>updateTeam(s,-1)} title="Прочерк">—</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-[680px] mx-auto p-3">
      <div className="text-sm text-gray-600">{match.name} — {course.name}</div>

      <div className="flex items-center justify-between my-2">
        <button className="px-4 py-2 border rounded" disabled={hole===1} onClick={()=>go(-1)}>Назад</button>
        <div className="text-center">
          <div className="text-xs text-gray-500">Лунка</div>
          <div className="text-2xl font-bold">{hole}</div>
          <div className="text-xs text-gray-500">Par {par} • SI {si ?? '—'}</div>
        </div>
        <button className="px-4 py-2 border rounded" disabled={hole===18} onClick={()=>go(1)}>Далее</button>
      </div>

      {perPlayerMode ? (
        <>
          {!focusPlayerId && (
            <div className="flex gap-2 mb-3">
              <button className={`px-3 py-1 border rounded ${side==='A'?'bg-red-50 border-red-400':''}`} onClick={()=>setSide('A')}>A</button>
              <button className={`px-3 py-1 border rounded ${side==='B'?'bg-blue-50 border-blue-400':''}`} onClick={()=>setSide('B')}>B</button>
            </div>
          )}
          {renderPerPlayer(side)}
        </>
      ) : renderTeam()}

      <div className="mt-4 text-xs text-gray-500">Подсказка: «—» — прочерк (в бэстболле игрок не учитывается, в сингле — лунка проиграна). Значения сохраняются при нажатии «Назад/Далее».</div>
    </div>
  );
}
