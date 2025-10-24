import React, { useMemo } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";

/** Мини-вью в стиле ваших референсов (крупные чипы + OUT/IN/TOT) */

const safePars = (c: Course) => (Array.isArray(c.pars) && c.pars.length===18 ? c.pars : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4]);

const expandSide = (side: MatchSide[], teams: Team[]) => {
  const ids: string[] = [];
  for (const s of side){ if (s.type==='player') ids.push(s.id); else { const t = teams.find(tt=>tt.id===s.id); if (t) ids.push(...t.playerIds); } }
  return Array.from(new Set(ids));
};
const sideName = (side: MatchSide[], players: Player[], teams: Team[]) =>
  expandSide(side, teams).map(id => players.find(p=>p.id===id)?.name ?? "—").join(" & ");

type HoleRes = 'A'|'B'|'AS'|null;

const Hole = ({value, active, color}:{value:number|string|null|undefined; active?:boolean; color:'red'|'blue'|'gray'})=>{
  const base = "inline-flex items-center justify-center rounded-full w-9 h-9 md:w-10 md:h-10 text-[13px] md:text-base font-semibold";
  const pal = color==='red'
    ? active?'bg-red-600 text-white':'border-2 border-red-500 text-red-600 bg-white'
    : color==='blue'
    ? active?'bg-blue-600 text-white':'border-2 border-blue-500 text-blue-700 bg-white'
    : active?'bg-gray-800 text-white':'border-2 border-gray-300 text-gray-600 bg-white';
  return <span className={`${base} ${pal}`}>{value ?? '—'}</span>;
};

function label(n:number){ if(n===0) return 'AS'; return n>0? `${n}UP` : `${Math.abs(n)}DN`; }

export default function MatchViewPage({ match, course, players, teams }:{
  match:Match; course:Course; players:Player[]; teams:Team[];
}){
  const pars = safePars(course);
  const aName = sideName(match.sideA, players, teams);
  const bName = sideName(match.sideB, players, teams);

  // Простейшая логика победителей по лункам:
  // если есть поигровочные — выбираем лучший нетто по стороне (с учётом того, что прочерк хранится как null на сервере)
  // здесь показываем только итоговые победители (без детального */**), как на вью
  const winners: HoleRes[] = useMemo(()=>{
    const arr:(HoleRes)[] = [];
    for(let i=0;i<18;i++){
      const a = (match.bestA ?? [])[i]; // предполагается, что бэк уже считает нетто-лидера; если нет — можно дополнить на клиенте
      const b = (match.bestB ?? [])[i];
      if (a==null && b==null) arr.push(null);
      else if (b==null || (a!=null && a<b)) arr.push('A');
      else if (a==null || (b!=null && b<a)) arr.push('B');
      else arr.push('AS');
    }
    return arr;
  }, [JSON.stringify(match.bestA), JSON.stringify(match.bestB)]);

  const upF = winners.slice(0,9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upB = winners.slice(9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upT = upF + upB;

  const started = winners.some(w=>w!==null);
  const finished = winners.every(w=>w!==null);

  return (
    <div className="max-w-[980px] mx-auto p-3">
      <div className="flex items-start justify-between mb-3">
        <div className="w-1/3 pr-2">
          <div className="text-sm md:text-base font-semibold">{aName}</div>
        </div>
        <div className="w-1/3 text-center">
          <div className="text-lg md:text-2xl font-bold">{finished?'FINAL RESULT': started?'LIVE!':'—'}</div>
          {/* итоговые очки матча рисуются отдельно на публичной странице; здесь — статус по девяткам */}
        </div>
        <div className="w-1/3 pl-2 text-right">
          <div className="text-sm md:text-base font-semibold">{bName}</div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 md:gap-4 items-center">
        <div className="flex flex-wrap gap-1 md:gap-2 justify-start">
          {Array.from({length:18}).map((_,i)=>(
            <Hole key={i} value={(match.sideANet ?? [])[i] ?? (match.scoresA ?? [])[i]} active={winners[i]==='A'} color="red"/>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="text-xs md:text-sm font-semibold">OUT</div>
          <div className="px-4 py-1 rounded-2xl border text-sm font-semibold">{label(upF)}</div>
          <div className="text-xs md:text-sm font-semibold mt-2">IN</div>
          <div className="px-4 py-1 rounded-2xl border text-sm font-semibold">{label(upB)}</div>
          <div className="text-xs md:text-sm font-semibold mt-2">TOT</div>
          <div className="px-4 py-1 rounded-2xl border text-sm font-semibold">{label(upT)}</div>

          <div className="mt-4 flex flex-wrap gap-1 md:gap-2 justify-center">
            {pars.map((p,i)=>(<Hole key={i} value={p} color="gray"/>))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 md:gap-2 justify-end">
          {Array.from({length:18}).map((_,i)=>(
            <Hole key={i} value={(match.sideBNet ?? [])[i] ?? (match.scoresB ?? [])[i]} active={winners[i]==='B'} color="blue"/>
          ))}
        </div>
      </div>
    </div>
  );
}
