import React, { useEffect, useMemo, useState } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";
import { normalizeMatch } from "../utils";

/* ---------- helpers ---------- */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75;

const safePars = (c: Course) =>
  Array.isArray(c.pars) && c.pars.length === 18
    ? c.pars
    : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4];
const safeSI   = (c: Course) =>
  Array.isArray(c.strokeIndex) && c.strokeIndex.length === 18
    ? c.strokeIndex
    : Array(18).fill(null);
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

export default function MatchInputPage({
  match: rawMatch, course, players, teams, onScore, refetch, focusPlayerId
}: Props){
  const match = useMemo(()=>normalizeMatch(rawMatch), [rawMatch]);

  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);

  // singles — ВСЕГДА поигровочно; fourball — поигровочно, если >2 игроков на стороне
  const perPlayerMode =
    match.format === "singles" ||
    (match.format === "fourball" && (aIds.length > 2 || bIds.length > 2));

  // первая НЕЗАПОЛНЕННАЯ лунка (undefined — пусто; null — прочерк = заполнено)
  const firstUnfilledHole = useMemo(() => {
    for (let i=0;i<18;i++){
      if (perPlayerMode){
        const aEmpty = aIds.some(pid => {
          const val = (match.playerScoresA?.[pid] ?? [])[i];
          return val == null;
        });
        const bEmpty = bIds.some(pid => {
          const val = (match.playerScoresB?.[pid] ?? [])[i];
          return val == null;
        });
        if (aEmpty || bEmpty) return i+1;
      } else {
        const a = (match.scoresA || [])[i];
        const b = (match.scoresB || [])[i];
        if (a == null || b == null) return i+1;
      }
    }
    return 18;
  }, [
    perPlayerMode,
    aIds.join(','),
    bIds.join(','),
    match.playerScoresA,
    match.playerScoresB,
    match.scoresA,
    match.scoresB,
  ]);

  const [hole, setHole] = useState<number>(firstUnfilledHole);
  useEffect(()=>{ setHole(firstUnfilledHole); }, [firstUnfilledHole]);

  const aName = nameOfSide(match.sideA, players, teams);
  const bName = nameOfSide(match.sideB, players, teams);
  const pars = safePars(course); const sis = safeSI(course);
  const par = pars[hole-1]; const si = sis[hole-1];

  // черновик текущей лунки
  type Draft = {
    A: { team: number|null| -1; players: Record<string, number|null| -1> };
    B: { team: number|null| -1; players: Record<string, number|null| -1> };
  };
  const buildDraft = (h:number): Draft => {
    const i = h-1;
    const d: Draft = { A:{team: (match.scoresA||[])[i] ?? null, players: {}}, B:{team: (match.scoresB||[])[i] ?? null, players: {}} };
    aIds.forEach(pid => d.A.players[pid] = (match.playerScoresA?.[pid] ?? [])[i] ?? null);
    bIds.forEach(pid => d.B.players[pid] = (match.playerScoresB?.[pid] ?? [])[i] ?? null);
    return d;
  };
  const [draft, setDraft] = useState<Draft>(buildDraft(hole));
  useEffect(()=>{ setDraft(buildDraft(hole)); }, [hole, match]);

  // side toggle для 5v5
  const [side, setSide] = useState<'A'|'B'>('A');

  const updateTeam = (s:'A'|'B', v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], team: v }}));
  const updatePlayer = (s:'A'|'B', pid:string, v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s].players, [pid]: v }, players: { ...prev[s].players, [pid]: v }} as any));

  // аккуратно: не использовать setDraft с неправильным ключом
  const updatePlayerSafe = (s:'A'|'B', pid:string, v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], players: { ...prev[s].players, [pid]: v }}}));

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

    const sameValue = (a: number|null|undefined| -1, b: number|null|undefined| -1) => {
      const norm = (val: number|null|undefined| -1) => (val === undefined ? null : val);
      return norm(a) === norm(b);
    };

    if (perPlayerMode){
      for (const pid of aIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresA?.[pid] ?? [])[i];
        const curr = draft.A.players[pid];
        if (!sameValue(curr, prev)) tasks.push(send('A', pid, curr));
      }
      for (const pid of bIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresB?.[pid] ?? [])[i];
        const curr = draft.B.players[pid];
        if (!sameValue(curr, prev)) tasks.push(send('B', pid, curr));
      }
    } else {
      const prevA = (match.scoresA || [])[i];
      const prevB = (match.scoresB || [])[i];
      if (!sameValue(draft.A.team, prevA)) tasks.push(send('A', null, draft.A.team));
      if (!sameValue(draft.B.team, prevB)) tasks.push(send('B', null, draft.B.team));
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
          const sh = shotsOnHole(Math.round(hi*allow), hole-1, safeSI(course));
          const v = draft[s].players[pid] ?? null;
          const starLabel = stars(sh);
          return (
            <div key={pid} className="score-input-row">
              <div className="score-input-label">
                <div className="text-sm truncate">{pl?.name ?? 'Игрок'}</div>
                {starLabel ? <div className="muted" style={{ fontSize: 11 }}>{starLabel}</div> : null}
              </div>
              <div className="score-input-controls">
                <button className="px-3 py-2 border rounded" onClick={()=>updatePlayerSafe(s,pid, typeof v==='number' && v>1 ? v-1 : 1)}>−</button>
                <input className="text-center border rounded py-2"
                  inputMode="numeric"
                  value={v===-1? '' : (v ?? '')}
                  placeholder="-"
                  onChange={(e)=>{
                    const t = e.target.value.trim();
                    if (t==='') { updatePlayerSafe(s,pid, null); return; }
                    const n = parseInt(t,10); if (!Number.isNaN(n)) updatePlayerSafe(s,pid, n);
                  }}
                />
                <button className="px-3 py-2 border rounded" onClick={()=>updatePlayerSafe(s,pid, typeof v==='number' ? v+1 : 1)}>+</button>
                <button className={`px-3 py-2 border rounded ${v===-1?'bg-gray-100':''}`} onClick={()=>updatePlayerSafe(s,pid, -1)} title="Прочерк">—</button>
              </div>
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
          <div key={s} className="score-input-row">
            <div className="score-input-label" style={{ fontWeight: 600 }}>{label}</div>
            <div className="score-input-controls">
              <button className="px-3 py-2 border rounded" onClick={()=>updateTeam(s, typeof v==='number' && v>1 ? v-1 : 1)}>−</button>
              <input className="text-center border rounded py-2"
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

      <div className="flex items-center justify-between my-2" style={{ flexWrap: 'wrap', gap: 8 }}>
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
          {renderPerPlayer('A')}
          <div className="my-2" />
          {renderPerPlayer('B')}
        </>
      ) : renderTeam()}

      <div className="mt-4 text-xs text-gray-500">Подсказка: «—» — прочерк (в бэстболле игрок не учитывается, в сингле — лунка проиграна). Значения сохраняются при нажатии «Назад/Далее».</div>
    </div>
  );
}
