import React, { useMemo } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";
import { normalizeMatch } from "../utils";

/* ——— helpers ——— */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75;
const safePars = (c: Course) => (Array.isArray(c.pars) && c.pars.length===18 ? c.pars : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4]);
const safeSI   = (c: Course) => (Array.isArray(c.strokeIndex) && c.strokeIndex.length===18 ? c.strokeIndex : Array(18).fill(null));
const coursePar = (c: Course) => safePars(c).reduce((a,b)=>a+b,0);
const toCourseHcp = (hi:number|undefined, c:Course)=>{ if(hi==null) return 0; const slope=c.slope??113, cr=c.cr??coursePar(c), par=coursePar(c); return Math.round(hi*(slope/113)+(cr-par)); };
const shotsOnHole = (ch:number, holeIdx:number, si?: (number|null)[])=>{ if(!si||si.length!==18) return 0; const idx=si[holeIdx]??99; let s=0; if(ch>=idx)s++; if(ch>18&&ch-18>=idx)s++; if(ch>36&&ch-36>=idx)s++; return s; };
const stars=(n:number)=> (n>=2?'**': n===1?'*':'');
const expandSide=(side:MatchSide[], teams:Team[])=>{ const ids:string[]=[]; for(const s of side){ if(s.type==='player') ids.push(s.id); else { const t=teams.find(tt=>tt.id===s.id); if(t) ids.push(...t.playerIds);} } return Array.from(new Set(ids)); };
const sideName=(side:MatchSide[], players:Player[], teams:Team[])=> expandSide(side,teams).map(id=>players.find(p=>p.id===id)?.name??'—').join(' & ');
type HoleRes='A'|'B'|'AS'|null;
const labelUpDn=(n:number)=> (n===0?'AS': n>0?`${n}UP`:`${Math.abs(n)}DN`);

/* маленькие атомы */
function Chip({value,color,win,star}:{value:number|string|null|undefined;color:'red'|'blue'|'gray';win?:boolean;star?:''|'*'|'**';}){
  return <span className={`chip chip-${color} ${win?'win':''}`}>{value ?? '—'}{star?<sup className="chip-star">{star}</sup>:null}</span>;
}

export default function MatchViewPage({ match: rawMatch, course, players, teams }:{
  match:Match; course:Course; players:Player[]; teams:Team[];
}){
  const match = useMemo(()=>normalizeMatch(rawMatch), [rawMatch]);

  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);
  const aName = sideName(match.sideA, players, teams);
  const bName = sideName(match.sideB, players, teams);
  const pars = safePars(course); const siArr = safeSI(course);
  const allow = match.format==='singles'? ALLOW_SINGLES : ALLOW_FOURBALL;

  const { aNet, bNet, aStars, bStars, winners } = useMemo(()=>{
    const A:(number|null)[]=[]; const B:(number|null)[]=[];
    const Astar:(''|'*'|'**')[]=[]; const Bstar:(''|'*'|'**')[]=[];
    const res:HoleRes[]=[];
    const pickBest = (i:number, ids:string[], per?:Record<string,(number|null)[]>, team?:(number|null)[])=>{
      const list:Array<{net:number; star:''|'*'|'**'}>=[];
      if (per && Object.keys(per).length){
        for(const pid of ids){
          const g=per[pid]?.[i] ?? null; if(g==null) continue;
          const hi=players.find(p=>p.id===pid)?.hcp ?? 0;
          const ch=Math.round(toCourseHcp(hi,course)*allow);
          const sh=shotsOnHole(ch,i,siArr);
          list.push({net:g-sh, star:stars(sh)});
        }
      } else if (team){ const g=team[i]; if(g!=null) list.push({net:g, star:''}); }
      if(!list.length) return {best:null as number|null, star:'' as ''|'*'|'**'};
      const best=list.reduce((m,x)=> x.net<m.net?x:m);
      return {best:best.net, star:best.star};
    };
    for(let i=0;i<18;i++){
      const Ares=pickBest(i,aIds,match.playerScoresA,match.scoresA);
      const Bres=pickBest(i,bIds,match.playerScoresB,match.scoresB);
      A.push(Ares.best); B.push(Bres.best); Astar.push(Ares.star); Bstar.push(Bres.star);
      if (Ares.best==null && Bres.best==null) res.push(null);
      else if (Bres.best==null || (Ares.best!=null && Ares.best<Bres.best)) res.push('A');
      else if (Ares.best==null || (Bres.best!=null && Bres.best<Ares.best)) res.push('B');
      else res.push('AS');
    }
    return { aNet:A, bNet:B, aStars:Astar, bStars:Bstar, winners:res };
  }, [JSON.stringify(match)]);

  const upF = winners.slice(0,9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upB = winners.slice(9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upT = upF + upB;
  const started = winners.some(w=>w!==null);
  const finished = winners.every(w=>w!==null);

  return (
    <div className="vw">
      <style>{`
        .vw{max-width:860px;margin:0 auto;padding:12px}
        .hdr{display:flex;align-items:flex-start;justify-content:space-between;margin:8px 0 12px}
        .hdr .name{font-weight:700}
        .centerStatus{text-align:center;font-weight:800}
        .centerStatus .live{color:#b91c1c}
        .centerStatus .final{color:#111827}
        .rows{display:grid;grid-template-columns:1fr auto 1fr;gap:10px}
        .midCell{display:flex;justify-content:center;align-items:center}
        .midCell-left{justify-content:flex-start}
        .midCell-right{justify-content:flex-end}
        .chip{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:999px;font-weight:700;font-size:15px;line-height:1}
        .chip-star{font-size:10px;margin-left:2px}
        .chip-gray{border:2px solid #D1D5DB;color:#6B7280;background:#fff}
        .chip-red{border:2px solid #DC2626;color:#B91C1C;background:#fff}
        .chip-blue{border:2px solid #2563EB;color:#1D4ED8;background:#fff}
        .chip.win.chip-red{background:#DC2626;color:#fff}
        .chip.win.chip-blue{background:#2563EB;color:#fff}
        .divider{grid-column:1/-1;display:flex;justify-content:center;align-items:center;margin:6px 0}
        .badge{border:1px solid #D1D5DB;border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px;margin:2px auto}
        @media (min-width:768px){ .chip{width:42px;height:42px;font-size:16px} }
        @media (max-width:640px){
          .vw{padding:8px}
          .hdr{flex-direction:column;align-items:center;text-align:center;gap:6px}
          .hdr .name{text-align:center}
          .rows{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
          .midCell-left,.midCell-right{justify-content:center}
          .chip{width:34px;height:34px;font-size:13px}
          .badge{font-size:12px;padding:4px 12px}
        }
      `}</style>

      <div className="hdr">
        <div className="name">{sideName(match.sideA, players, teams)}</div>
        <div className="centerStatus"><div className={finished?'final': started?'live':''}>{finished?'FINAL RESULT': started?'LIVE!':'—'}</div></div>
        <div className="name" style={{textAlign:'right'}}>{sideName(match.sideB, players, teams)}</div>
      </div>

      <div className="rows">
        {Array.from({length:9}).map((_,i)=>(
          <React.Fragment key={i}>
            <div className="midCell midCell-left"><Chip value={aNet[i]} color="red" win={winners[i]==='A'} star={aStars[i]}/></div>
            <div className="midCell"><Chip value={safePars(course)[i]} color="gray"/></div>
            <div className="midCell midCell-right"><Chip value={bNet[i]} color="blue" win={winners[i]==='B'} star={bStars[i]}/></div>
          </React.Fragment>
        ))}

        <div className="divider"><div style={{textAlign:'center'}}><div>OUT</div><div className="badge">{labelUpDn(upF)}</div></div></div>

        {Array.from({length:9}).map((_,k)=>{
          const i=9+k;
          return (
            <React.Fragment key={i}>
              <div className="midCell midCell-left"><Chip value={aNet[i]} color="red" win={winners[i]==='A'} star={aStars[i]}/></div>
              <div className="midCell"><Chip value={safePars(course)[i]} color="gray"/></div>
              <div className="midCell midCell-right"><Chip value={bNet[i]} color="blue" win={winners[i]==='B'} star={bStars[i]}/></div>
            </React.Fragment>
          );
        })}

        <div className="divider">
          <div style={{textAlign:'center'}}>
            <div>IN</div><div className="badge">{labelUpDn(upB)}</div>
            <div style={{marginTop:6}}>TOT</div><div className="badge">{labelUpDn(upT)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
