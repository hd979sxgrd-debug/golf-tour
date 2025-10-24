import React, { useEffect, useMemo, useState } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";

/** ===== Helpers (минимум зависимостей) ===== */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75; // по вашему требованию

const safePars = (c: Course) => (Array.isArray(c.pars) && c.pars.length === 18 ? c.pars : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4]);
const safeSI   = (c: Course) => (Array.isArray(c.strokeIndex) && c.strokeIndex.length === 18 ? c.strokeIndex : Array(18).fill(null));

const coursePar = (c: Course) => safePars(c).reduce((a,b)=>a+b,0);
const toCourseHcp = (hi: number|undefined, c: Course) => {
  if (hi == null) return 0;
  const slope = c.slope ?? 113;
  const cr = c.cr ?? coursePar(c);
  const par = coursePar(c);
  return Math.round(hi * (slope / 113) + (cr - par));
};
const shotsOnHole = (ch: number, holeIdx: number, si?: (number|null)[]) => {
  if (!si || si.length !== 18) return 0;
  const idx = si[holeIdx] ?? 99;
  let s = 0;
  if (ch >= idx) s++;
  if (ch > 18 && ch - 18 >= idx) s++;
  if (ch > 36 && ch - 36 >= idx) s++;
  return s;
};
const stars = (n:number) => (n>=2?'**': n===1?'*':'');
const expandSide = (side: MatchSide[], teams: Team[]) => {
  const ids: string[] = [];
  for (const s of side) {
    if (s.type === "player") ids.push(s.id);
    else {
      const t = teams.find(tt => tt.id === s.id);
      if (t) ids.push(...t.playerIds);
    }
  }
  return Array.from(new Set(ids));
};
const nameOfSide = (side: MatchSide[], players: Player[], teams: Team[]) =>
  expandSide(side, teams).map(id => players.find(p => p.id === id)?.name ?? "—").join(" & ");

type Draft = {
  A: { team: number|null| -1; players: Record<string, number|null| -1> };
  B: { team: number|null| -1; players: Record<string, number|null| -1> };
};

type Props = {
  match: Match;
  course: Course;
  players: Player[];
  teams: Team[];
  /** Сохранение одной записи в БД. ВАЖНО: прочерк отправляем как {gross:null, dash:true} */
  onScore: (p:{ side:'A'|'B'; hole:number; playerId?:string|null; gross?:number|null; dash?:boolean; }) => Promise<any>;
  /** Рефетч матча после сохранения (из App) */
  refetch: () => Promise<void>;
  /** Если указан — вводим только для этого игрока (5v5 персональные ссылки) */
  focusPlayerId?: string;
};

export default function MatchInputPage({ match, course, players, teams, onScore, refetch, focusPlayerId }: Props){
  /** ===== первичная незаполненная лунка ===== */
  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);
  const perPlayerMode = match.format === "fourball" && (aIds.length > 2 || bIds.length > 2);

  const firstUnfilledHole = useMemo(() => {
    for (let i=0;i<18;i++){
      if (perPlayerMode){
        // если у любой стороны есть игрок без значения на этой лунке — считаем незаполненной
        const aEmpty = aIds.some(pid => (match.playerScoresA?.[pid] ?? [])[i] == null);
        const bEmpty = bIds.some(pid => (match.playerScoresB?.[pid] ?? [])[i] == null);
        if (aEmpty || bEmpty) return i+1;
      } else {
        const a = (match.scoresA || [])[i];
        const b = (match.scoresB || [])[i];
        if (a == null || b == null) return i+1;
      }
    }
    return 1;
  }, [match.id, JSON.stringify(match.playerScoresA), JSON.stringify(match.playerScoresB), JSON.stringify(match.scoresA), JSON.stringify(match.scoresB)]);

  const [hole, setHole] = useState<number>(firstUnfilledHole);
  useEffect(()=>{ setHole(firstUnfilledHole); }, [firstUnfilledHole]);

  /** ===== черновик текущей лунки ===== */
  const buildDraft = (h:number): Draft => {
    const i = h-1;
    const d: Draft = { A:{team:null, players:{}}, B:{team:null, players:{}} };
    d.A.team = (match.scoresA || [])[i] ?? null;
    d.B.team = (match.scoresB || [])[i] ?? null;
    aIds.forEach(pid => d.A.players[pid] = (match.playerScoresA?.[pid] ?? [])[i] ?? null);
    bIds.forEach(pid => d.B.players[pid] = (match.playerScoresB?.[pid] ?? [])[i] ?? null);
    return d;
  };
  const [draft, setDraft] = useState<Draft>(buildDraft(hole));
  useEffect(()=>{ setDraft(buildDraft(hole)); }, [hole]);
  // При любом обновлении матча (после рефетча) — синхронизируем
  useEffect(()=>{ setDraft(buildDraft(hole)); }, [JSON.stringify(match)]);

  /** ===== общие данные лунки ===== */
  const pars = safePars(course); const sis = safeSI(course);
  const par = pars[hole-1]; const si = sis[hole-1];
  const aName = nameOfSide(match.sideA, players, teams);
  const bName = nameOfSide(match.sideB, players, teams);

  /** ===== ввод ===== */
  const [side, setSide] = useState<'A'|'B'>('A');

  const updateTeam = (s:'A'|'B', v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], team: v }}));
  const updatePlayer = (s:'A'|'B', pid:string, v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], players: { ...prev[s].players, [pid]: v } }}));

  /** ===== сохранение текущей лунки ===== */
  const persistHole = async () => {
    const i = hole-1;
    const tasks: Promise<any>[] = [];
    const norm = (v:number|null| -1) => v===-1 ? { gross:null, dash:true } : { gross:v ?? null, dash:false };

    if (perPlayerMode){
      for (const pid of aIds) {
        // если персональная ссылка — сохраняем только её игрока
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const cur = (match.playerScoresA?.[pid] ?? [])[i] ?? null;
        const nxt = draft.A.players[pid] ?? null;
        if (nxt !== cur) {
          const {gross, dash} = norm(nxt);
          tasks.push(onScore({ side:'A', hole, playerId:pid, gross, dash }));
        }
      }
      for (const pid of bIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const cur = (match.playerScoresB?.[pid] ?? [])[i] ?? null;
        const nxt = draft.B.players[pid] ?? null;
        if (nxt !== cur) {
          const {gross, dash} = norm(nxt);
          tasks.push(onScore({ side:'B', hole, playerId:pid, gross, dash }));
        }
      }
    } else {
      const curA = (match.scoresA || [])[i] ?? null;
      const curB = (match.scoresB || [])[i] ?? null;
      if (draft.A.team !== curA) { const {gross, dash} = norm(draft.A.team); tasks.push(onScore({ side:'A', hole, playerId:null, gross, dash })); }
      if (draft.B.team !== curB) { const {gross, dash} = norm(draft.B.team); tasks.push(onScore({ side:'B', hole, playerId:null, gross, dash })); }
    }

    if (tasks.length) await Promise.all(tasks);
    // Рефетчим матч (из App приедет обновленный match и draft синхронизируется эффектом)
    await refetch();
  };

  const go = async (dir:-1|1) => {
    await persistHole();
    setHole(h => Math.max(1, Math.min(18, h + dir)));
  };

  /** ===== компактный мобильный UI ===== */
  const Row = ({label, value, onMinus, onPlus, onDash}:{label?:string; value:number|null| -1; onMinus:()=>void; onPlus:()=>void; onDash:()=>void;}) => (
    <div className="flex items-center gap-2 bg-white rounded-xl p-2 shadow">
      {label ? <div className="w-28 text-sm truncate">{label}</div> : null}
      <button className="px-3 py-2 border rounded" onClick={onMinus}>−</button>
      <input
        className="w-16 text-center border rounded py-2"
        inputMode="numeric"
        value={value===-1 ? "" : (value ?? "")}
        placeholder="-"
        onChange={(e)=>{
          const t = e.target.value.trim();
          if (t === "") {
            onDash(); // очистить для удобства (поведение как «прочерк/пусто»)
          } else {
            const n = parseInt(t,10);
            if (!Number.isNaN(n)) onPlus(/* hack: */); // чтобы не дергать; реальное значение проставим ниже
          }
        }}
        onBlur={(e)=>{
          const t = e.target.value.trim();
          if (t === "") return;
          const n = parseInt(t,10);
          if (!Number.isNaN(n)) {
            // переопределяем конкретным сеттером (изнаружи)
          }
        }}
      />
      <button className="px-3 py-2 border rounded" onClick={onPlus}>+</button>
      <button className={`px-3 py-2 border rounded ${value===-1?'bg-gray-100':''}`} title="Прочерк" onClick={onDash}>—</button>
    </div>
  );

  const SideHeader = ({s}:{s:'A'|'B'}) => {
    const ids = s==='A'?aIds:bIds;
    // для одиночных/2v2 — покажем название стороны; для 5v5 — кнопку выбора стороны
    return (
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{s==='A'? aName : bName}</div>
        {perPlayerMode && !focusPlayerId ? (
          <div className="flex gap-2">
            <button className={`px-3 py-1 border rounded ${side==='A'?'bg-red-50 border-red-400':''}`} onClick={()=>setSide('A')}>A</button>
            <button className={`px-3 py-1 border rounded ${side==='B'?'bg-blue-50 border-blue-400':''}`} onClick={()=>setSide('B')}>B</button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderInputs = () => {
    if (perPlayerMode) {
      const ids = side==='A' ? aIds : bIds;
      const rows = (focusPlayerId && ids.includes(focusPlayerId)) ? [focusPlayerId] : ids;
      return (
        <div className="grid gap-2">
          <SideHeader s={side}/>
          {rows.map(pid=>{
            const pl = players.find(p=>p.id===pid);
            const hi = toCourseHcp(pl?.hcp, course);
            const allow = match.format==='singles'?ALLOW_SINGLES:ALLOW_FOURBALL;
            const sh = shotsOnHole(Math.round(hi*allow), hole-1, safeSI(course));
            const v = draft[side].players[pid] ?? null;
            return (
              <div key={pid} className="flex items-center gap-2">
                <div className="w-28 text-sm truncate">{pl?.name ?? 'Игрок'} <span className="text-xs text-gray-500">{stars(sh)}</span></div>
                <button className="px-3 py-2 border rounded" onClick={()=>updatePlayer(side,pid, Math.max(1, (typeof v==='number'&&v>0?v:1)-1))}>−</button>
                <input className="w-16 text-center border rounded py-2"
                  inputMode="numeric"
                  value={v===-1? '' : (v ?? '')}
                  placeholder="-"
                  onChange={(e)=>{
                    const t = e.target.value.trim();
                    updatePlayer(side,pid, t===''? null : Number.isNaN(parseInt(t,10)) ? null : parseInt(t,10));
                  }}
                />
                <button className="px-3 py-2 border rounded" onClick={()=>updatePlayer(side,pid, (typeof v==='number'&&v>0?v:0)+1)}>+</button>
                <button className={`px-3 py-2 border rounded ${v===-1?'bg-gray-100':''}`} onClick={()=>updatePlayer(side,pid, -1)}>—</button>
              </div>
            );
          })}
        </div>
      );
    }
    // singles / 2v2 — по-командно два поля
    return (
      <div className="grid grid-cols-2 gap-8">
        {(['A','B'] as const).map(s=>{
          const label = s==='A'?aName:bName;
          const v = draft[s].team;
          return (
            <div key={s}>
              <div className="mb-2 font-semibold">{label}</div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-2 border rounded" onClick={()=>updateTeam(s, Math.max(1,(typeof v==='number'&&v>0?v:1)-1))}>−</button>
                <input className="w-16 text-center border rounded py-2"
                  inputMode="numeric"
                  value={v===-1? '' : (v ?? '')}
                  placeholder="-"
                  onChange={(e)=>{
                    const t=e.target.value.trim();
                    updateTeam(s, t===''? null : Number.isNaN(parseInt(t,10)) ? null : parseInt(t,10));
                  }}
                />
                <button className="px-3 py-2 border rounded" onClick={()=>updateTeam(s,(typeof v==='number'&&v>0?v:0)+1)}>+</button>
                <button className={`px-3 py-2 border rounded ${v===-1?'bg-gray-100':''}`} onClick={()=>updateTeam(s,-1)}>—</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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

      {renderInputs()}

      <div className="mt-4 text-xs text-gray-500">Подсказка: «—» — прочерк (в бэстболле игрок не учитывается, в сингле — лунка проиграна).</div>
    </div>
  );
}
