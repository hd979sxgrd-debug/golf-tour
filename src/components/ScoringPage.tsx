import React, { useEffect, useMemo, useState } from 'react';
import { Course, Match, MatchSide, Player, Team } from '../types';

/* ----------------- constants & helpers ----------------- */

const ALLOWANCE_SINGLES = 0.75;
const ALLOWANCE_FOURBALL = 0.75;

function safePars(course: Course): number[] {
  const p = Array.isArray(course.pars) ? course.pars : [];
  if (p.length === 18) return p;
  return [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4];
}
function safeSI(course: Course): (number|null)[] {
  const si = Array.isArray(course.strokeIndex) ? course.strokeIndex : [];
  if (si.length === 18) return si;
  return Array(18).fill(null);
}
function coursePar(course: Course) { return safePars(course).reduce((a,b)=>a+b,0); }
function toCourseHandicap(hi: number | undefined, course: Course) {
  if (hi == null) return 0;
  const slope = course.slope ?? 113;
  const cr = course.cr ?? coursePar(course);
  const par = coursePar(course);
  return Math.round(hi * (slope / 113) + (cr - par));
}
function shotsOnHole(courseHcp: number, holeIdx: number, si?: (number|null)[]) {
  if (!si || si.length !== 18) return 0;
  const idx = si[holeIdx] ?? 99;
  let shots = 0;
  if (courseHcp >= idx) shots += 1;
  if (courseHcp > 18 && courseHcp - 18 >= idx) shots += 1;
  if (courseHcp > 36 && courseHcp - 36 >= idx) shots += 1;
  return shots;
}
function expandSide(side: MatchSide[], teams: Team[]) {
  const ids: string[] = [];
  for (const s of side) {
    if (s.type === 'player') ids.push(s.id);
    else {
      const t = teams.find(tt => tt.id === s.id);
      if (t) ids.push(...t.playerIds);
    }
  }
  return Array.from(new Set(ids));
}
function sideName(side: MatchSide[], players: Player[], teams: Team[]) {
  const ids = expandSide(side, teams);
  return ids.map(pid => players.find(p => p.id === pid)?.name ?? '—').join(' & ');
}
type HoleRes = 'A' | 'B' | 'AS';
function segScore(perHole: (HoleRes|null)[], from:number, to:number) {
  let a=0,b=0; for(let i=from;i<=to;i++){ const r=perHole[i]; if(r==='A') a++; else if(r==='B') b++; }
  if (a>b) return {A:1,B:0}; if (b>a) return {A:0,B:1}; return {A:0.5,B:0.5};
}
function totalPoints(winners: (HoleRes|null)[]) {
  const f = segScore(winners,0,8); const bk = segScore(winners,9,17);
  let a=0,b=0; winners.forEach(r=>{ if(r==='A') a++; else if(r==='B') b++; });
  const m = a>b?{A:1,B:0}: a<b?{A:0,B:1}:{A:0.5,B:0.5};
  return { A: f.A+bk.A+m.A, B: f.B+bk.B+m.B, detail:{front:f,back:bk,match:m} };
}
function starsFor(shots:number){ return shots>=2?'**': shots===1?'*':''; }
function labelUpDn(n:number){ if(n===0) return 'AS'; return n>0?`${n}UP`:`${Math.abs(n)}DN`; }

/* ----------------- small UI atoms ----------------- */

function HoleChip({ value, active, faint, star, color }:{
  value: number|string|null|undefined; active?:boolean; faint?:boolean; star?:''|'*'|'**'; color?:'red'|'blue'|'gray';
}) {
  const base='inline-flex items-center justify-center rounded-full w-8 h-8 md:w-10 md:h-10 text-[13px] md:text-base font-semibold leading-none';
  const palette = color==='red'
    ? active?'bg-red-600 text-white':'border-2 border-red-500 text-red-600 bg-white'
    : color==='blue'
    ? active?'bg-blue-600 text-white':'border-2 border-blue-500 text-blue-700 bg-white'
    : active?'bg-gray-800 text-white':'border-2 border-gray-300 text-gray-600 bg-white';
  const opacity = faint?'opacity-40':'';
  return <span className={`${base} ${palette} ${opacity}`}>{value ?? '—'}{star?<sup className="ml-0.5 text-[10px]">{star}</sup>:null}</span>;
}
function BarLabel({children}:{children:React.ReactNode}){ return <div className="px-4 py-1 rounded-2xl border text-xs md:text-sm font-semibold">{children}</div>; }

/* ----------------- types for draft ----------------- */

type Draft = {
  A: { team: number|null| -1; players: Record<string, number|null| -1> };
  B: { team: number|null| -1; players: Record<string, number|null| -1> };
};

/* ----------------- main component ----------------- */

type PerHoleMeta = {
  a:{gross?:number|null; net?:number|null; star?:''|'*'|'**';};
  b:{gross?:number|null; net?:number|null; star?:''|'*'|'**';};
  winner: HoleRes|null;
};

export default function ScoringPage({
  match, course, players, teams, readOnly, focusPlayerId, onScore,
}:{
  match:Match; course:Course; players:Player[]; teams:Team[];
  readOnly:boolean; focusPlayerId?:string;
  onScore?:(p:{side:'A'|'B'; hole:number; playerId?:string|null; gross?:number|null; dash?:boolean;})=>Promise<any>|void;
}){
  const [hole,setHole]=useState(1);

  const pars = safePars(course);
  const siArr = safeSI(course);

  const aName = useMemo(()=>sideName(match.sideA, players, teams),[match,players,teams]);
  const bName = useMemo(()=>sideName(match.sideB, players, teams),[match,players,teams]);
  const aPlayerIds = expandSide(match.sideA, teams);
  const bPlayerIds = expandSide(match.sideB, teams);

  /* ---------- DERIVED: per-hole winners for view ---------- */
  const metas: PerHoleMeta[] = useMemo(()=>{
    const arr: PerHoleMeta[] = [];
    const allow = match.format==='singles'?ALLOWANCE_SINGLES:ALLOWANCE_FOURBALL;

    const playerGross = (side:'A'|'B', hIdx:number)=>{
      const store = side==='A'? match.playerScoresA : match.playerScoresB;
      if (!store) return [] as Array<{playerId:string; gross:number|null|undefined; dash?:boolean;}>;
      return Object.entries(store).map(([pid,a])=>({
        playerId: pid, gross: Array.isArray(a)? a[hIdx] ?? null : null, dash: Array.isArray(a) && a[hIdx]===-1
      }));
    };
    const pNet = (pid:string, gross:number|null|undefined, hIdx:number)=>{
      const hi = players.find(p=>p.id===pid)?.hcp ?? 0;
      const ch = Math.round(toCourseHandicap(hi, course) * allow);
      if (gross==null) return null;
      if (gross===-1) return { dash:true } as const;
      const shots = shotsOnHole(ch, hIdx, siArr as any);
      return { net: gross - shots, star: starsFor(shots) } as const;
    };

    for(let i=0;i<18;i++){
      const rowA = playerGross('A', i);
      const candsA: Array<{net:number;star:''|'*'|'**'}> = [];
      if (rowA.length){
        for(const r of rowA){
          const v = pNet(r.playerId, r.gross, i);
          if (!v) continue;
          if ('dash' in v) { if (match.format==='singles') candsA.push({net: Number.POSITIVE_INFINITY, star:''}); continue; }
          candsA.push({net:v.net, star:v.star});
        }
      } else {
        const teamGross = (match.scoresA||[])[i];
        if (teamGross!=null) candsA.push({net: teamGross, star: ''});
      }
      const rowB = playerGross('B', i);
      const candsB: Array<{net:number;star:''|'*'|'**'}> = [];
      if (rowB.length){
        for(const r of rowB){
          const v = pNet(r.playerId, r.gross, i);
          if (!v) continue;
          if ('dash' in v) { if (match.format==='singles') candsB.push({net: Number.POSITIVE_INFINITY, star:''}); continue; }
          candsB.push({net:v.net, star:v.star});
        }
      } else {
        const teamGross = (match.scoresB||[])[i];
        if (teamGross!=null) candsB.push({net: teamGross, star: ''});
      }

      const bestA = candsA.length ? candsA.reduce((m,x)=>x.net<m.net?x:m) : null;
      const bestB = candsB.length ? candsB.reduce((m,x)=>x.net<m.net?x:m) : null;

      let winner: HoleRes|null = null;
      if (bestA && bestB){
        if (bestA.net < bestB.net) winner='A';
        else if (bestB.net < bestA.net) winner='B';
        else winner='AS';
      } else if (bestA && !bestB) winner='A';
      else if (!bestA && bestB) winner='B';

      arr.push({
        a: { gross: rowA.length? undefined : (match.scoresA||[])[i] ?? null, net: bestA?.net ?? null, star: bestA?.star ?? '' },
        b: { gross: rowB.length? undefined : (match.scoresB||[])[i] ?? null, net: bestB?.net ?? null, star: bestB?.star ?? '' },
        winner
      });
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, teams, players, course.cr, course.slope]);

  const winners = metas.map(m=>m.winner);
  const upFront = winners.slice(0,9).reduce((acc,r)=> r==='A'?acc+1: r==='B'?acc-1: acc, 0);
  const upBack  = winners.slice(9).reduce((acc,r)=> r==='A'?acc+1: r==='B'?acc-1: acc, 0);
  const upTot = upFront + upBack;
  const pts = totalPoints(winners);
  const started = metas.some(m=>m.a.net!=null || m.b.net!=null);
  const finished = metas.every(m=>m.a.net!=null || m.b.net!=null);

  /* ---------- DRAFT for inputs ---------- */

  const initialDraft = (): Draft => {
    const hi = hole - 1;
    const d: Draft = { A: { team: null, players: {} }, B: { team: null, players: {} } };
    d.A.team = (match.scoresA || [])[hi] ?? null;
    d.B.team = (match.scoresB || [])[hi] ?? null;
    for (const pid of aPlayerIds) d.A.players[pid] = (match.playerScoresA?.[pid] ?? [])[hi] ?? null;
    for (const pid of bPlayerIds) d.B.players[pid] = (match.playerScoresB?.[pid] ?? [])[hi] ?? null;
    return d;
  };

  const [draft, setDraft] = useState<Draft>(initialDraft);
  useEffect(()=>{ setDraft(initialDraft()); }, [hole, match.id]);

  // сравнить черновик с исходником для текущей лунки и отправить только изменения
  const persistCurrentHole = async () => {
    if (!onScore || readOnly) return;
    const hi = hole - 1;
    const calls: Array<Promise<any>|void> = [];

    // team values
    const origATeam = (match.scoresA || [])[hi] ?? null;
    const origBTeam = (match.scoresB || [])[hi] ?? null;
    if (draft.A.team !== origATeam) {
      calls.push(onScore({ side:'A', hole, playerId:null, gross: draft.A.team === -1 ? -1 : draft.A.team, dash: draft.A.team === -1 }) as any);
    }
    if (draft.B.team !== origBTeam) {
      calls.push(onScore({ side:'B', hole, playerId:null, gross: draft.B.team === -1 ? -1 : draft.B.team, dash: draft.B.team === -1 }) as any);
    }

    // per-player values
    for (const pid of aPlayerIds) {
      const orig = (match.playerScoresA?.[pid] ?? [])[hi] ?? null;
      const val = draft.A.players[pid] ?? null;
      if (val !== orig) {
        calls.push(onScore({ side:'A', hole, playerId:pid, gross: val === -1 ? -1 : val, dash: val === -1 }) as any);
      }
    }
    for (const pid of bPlayerIds) {
      const orig = (match.playerScoresB?.[pid] ?? [])[hi] ?? null;
      const val = draft.B.players[pid] ?? null;
      if (val !== orig) {
        calls.push(onScore({ side:'B', hole, playerId:pid, gross: val === -1 ? -1 : val, dash: val === -1 }) as any);
      }
    }

    if (calls.length) await Promise.all(calls);
  };

  /* ---------- VIEW (readOnly) ---------- */

  if (readOnly){
    return (
      <div className="bg-white rounded-2xl p-3 md:p-6 shadow">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex-1"><div className="text-sm md:text-base font-semibold">{aName}</div></div>
          <div className="text-center">
            <div className="text-lg md:text-2xl font-bold">{finished?'FINAL RESULT': started?'LIVE!':'—'}</div>
            <div className="text-4xl md:text-6xl font-extrabold text-red-600">{pts.A} : {pts.B}</div>
          </div>
          <div className="flex-1 text-right"><div className="text-sm md:text-base font-semibold">{bName}</div></div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 md:gap-4 items-center">
          <div className="flex flex-wrap gap-1 md:gap-2 justify-start">
            {metas.map((m,i)=>(
              <HoleChip key={i} value={m.a.net ?? m.a.gross} active={m.winner==='A'} faint={m.a.net==null && m.a.gross==null} star={m.a.star} color="red"/>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs md:text-sm font-semibold">OUT</div><BarLabel>{labelUpDn(upFront)}</BarLabel>
            <div className="text-xs md:text-sm font-semibold mt-2">IN</div><BarLabel>{labelUpDn(upBack)}</BarLabel>
            <div className="text-xs md:text-sm font-semibold mt-2">TOT</div><BarLabel>{labelUpDn(upTot)}</BarLabel>
            <div className="mt-4 flex flex-wrap gap-1 md:gap-2 justify-center">
              {safePars(course).map((p,i)=>(<HoleChip key={i} value={p} color="gray"/>))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 md:gap-2 justify-end">
            {metas.map((m,i)=>(
              <HoleChip key={i} value={m.b.net ?? m.b.gross} active={m.winner==='B'} faint={m.b.net==null && m.b.gross==null} star={m.b.star} color="blue"/>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- INPUT (edit) ---------- */

  const [side,setSide]=useState<'A'|'B'>('A');
  const par = safePars(course)[hole-1]; const si = safeSI(course)[hole-1];

  const perPlayerEntry = match.format==='fourball' && (aPlayerIds.length>2 || bPlayerIds.length>2);
  const perSidePlayers = side==='A'? aPlayerIds : bPlayerIds;
  const focusOnly = focusPlayerId && perSidePlayers.includes(focusPlayerId);

  const updateTeam = (s:'A'|'B', v:number|null| -1) => setDraft(prev => ({ ...prev, [s]: { ...prev[s], team: v } }));
  const updatePlayer = (s:'A'|'B', pid:string, v:number|null| -1) =>
    setDraft(prev => ({ ...prev, [s]: { ...prev[s], players: { ...prev[s].players, [pid]: v } } }));

  const PlayerRow = (pid:string) => {
    const label = players.find(p=>p.id===pid)?.name ?? 'Игрок';
    const hi = players.find(p=>p.id===pid)?.hcp ?? 0;
    const ch = Math.round(toCourseHandicap(hi, course) * (match.format==='singles'?ALLOWANCE_SINGLES:ALLOWANCE_FOURBALL));
    const shots = shotsOnHole(ch, hole-1, siArr as any);
    const star = starsFor(shots);
    const v = (draft[side].players[pid] ?? null);
    const show = v === -1 ? '' : (v ?? '');

    return (
      <div key={pid} className="bg-white rounded-xl p-3 shadow flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          <div className="text-xs text-gray-500">Par {par} • SI {si ?? '—'} {star && <span className="ml-1">({star})</span>}</div>
        </div>
        <button className="px-2 py-1 rounded-l-lg border" onClick={()=>updatePlayer(side,pid, Math.max(1, (typeof v==='number' && v>0 ? v : 1)-1))}>−</button>
        <input className="w-14 text-center border-y"
          inputMode="numeric"
          value={show as any}
          placeholder="-"
          onChange={(e)=>{
            const t = e.target.value.trim();
            updatePlayer(side,pid, t===''? null : Number.isNaN(parseInt(t,10)) ? null : parseInt(t,10));
          }}
        />
        <button className="px-2 py-1 rounded-r-lg border" onClick={()=>updatePlayer(side,pid, (typeof v==='number' && v>0 ? v : 0)+1)}>+</button>
        <button className={`ml-2 px-2 py-1 rounded-lg border ${v===-1?'bg-gray-200':''}`} title="Прочерк" onClick={()=>updatePlayer(side,pid, -1)}>—</button>
      </div>
    );
  };

  const TeamBox = (s:'A'|'B') => {
    const label = s==='A'? aName||'Сторона A' : bName||'Сторона B';
    const v = draft[s].team;
    const show = v === -1 ? '' : (v ?? '');
    return (
      <div className="p-3 rounded-xl border">
        <div className="text-sm font-medium mb-1">{label}</div>
        <div className="flex items-center gap-2 justify-center">
          <button className="px-2 py-1 rounded-l-lg border" onClick={()=>updateTeam(s, Math.max(1, (typeof v==='number' && v>0 ? v : 1)-1))}>−</button>
          <input className="w-20 text-center border-y text-xl" inputMode="numeric"
            value={show as any}
            onChange={(e)=>{
              const t = e.target.value.trim();
              updateTeam(s, t===''? null : Number.isNaN(parseInt(t,10)) ? null : parseInt(t,10));
            }}
          />
          <button className="px-2 py-1 rounded-r-lg border" onClick={()=>updateTeam(s, (typeof v==='number' && v>0 ? v : 0)+1)}>+</button>
          <button className={`ml-2 px-2 py-1 rounded-lg border ${v===-1?'bg-gray-200':''}`} onClick={()=>updateTeam(s, -1)}>—</button>
        </div>
      </div>
    );
  };

  // навигация со сохранением
  const goPrev = async () => {
    await persistCurrentHole();
    setHole(h => Math.max(1, h-1));
  };
  const goNext = async () => {
    await persistCurrentHole();
    setHole(h => Math.min(18, h+1));
  };

  return (
    <div className="bg-white rounded-2xl p-3 md:p-6 shadow">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="font-semibold">{match.name} — {course.name}</div>
      </div>

      {/* навигация по лункам (сохранение на клике) */}
      <div className="flex items-center justify-between mb-3">
        <button className="px-3 py-2 rounded border" onClick={goPrev} disabled={hole===1}>Назад</button>
        <div className="text-center">
          <div className="text-xs text-gray-500">Лунка</div>
          <div className="text-2xl font-bold">{hole}</div>
          <div className="text-xs text-gray-500">Par {safePars(course)[hole-1]} • SI {safeSI(course)[hole-1] ?? '—'}</div>
        </div>
        <button className="px-3 py-2 rounded border" onClick={goNext} disabled={hole===18}>Далее</button>
      </div>

      {/* выбор стороны */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button className={`px-3 py-2 rounded border ${side==='A'?'bg-red-50 border-red-400':''}`} onClick={()=>setSide('A')}>{aName||'Сторона A'}</button>
        <button className={`px-3 py-2 rounded border ${side==='B'?'bg-blue-50 border-blue-400':''}`} onClick={()=>setSide('B')}>{bName||'Сторона B'}</button>
      </div>

      {/* режим ввода */}
      { (match.format==='fourball' && (aPlayerIds.length>2 || bPlayerIds.length>2)) ? (
        <div className="grid gap-2">
          {((focusPlayerId && (side==='A'?aPlayerIds:bPlayerIds).includes(focusPlayerId)) ? [focusPlayerId] : (side==='A'? aPlayerIds : bPlayerIds)).map(pid => PlayerRow(pid))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {TeamBox('A')}
          {TeamBox('B')}
        </div>
      )}

      {/* индикаторы и par центр */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] gap-2 md:gap-4 items-center">
        <div className="flex flex-wrap gap-1 md:gap-2 justify-start">
          {metas.map((m,i)=>(
            <HoleChip key={i} value={m.a.net ?? m.a.gross} active={m.winner==='A'} faint={m.a.net==null && m.a.gross==null} star={m.a.star} color="red"/>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs md:text-sm font-semibold">OUT</div><BarLabel>{labelUpDn(upFront)}</BarLabel>
          <div className="text-xs md:text-sm font-semibold mt-2">IN</div><BarLabel>{labelUpDn(upBack)}</BarLabel>
          <div className="text-xs md:text-sm font-semibold mt-2">TOT</div><BarLabel>{labelUpDn(upTot)}</BarLabel>
          <div className="mt-4 flex flex-wrap gap-1 md:gap-2 justify-center">
            {safePars(course).map((p,i)=>(<HoleChip key={i} value={p} color="gray"/>))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 md:gap-2 justify-end">
          {metas.map((m,i)=>(
            <HoleChip key={i} value={m.b.net ?? m.b.gross} active={m.winner==='B'} faint={m.b.net==null && m.b.gross==null} star={m.b.star} color="blue"/>
          ))}
        </div>
      </div>
    </div>
  );
}
