// src/pages/MatchViewPage.tsx
import React, { useMemo } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";

/** ===== calc helpers ===== */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75; // по вашему требованию

const safePars = (c: Course) =>
  Array.isArray(c.pars) && c.pars.length === 18
    ? c.pars
    : [4,4,3,5,4,4,5,3,4, 4,5,3,4,4,5,3,4,4];

const safeSI = (c: Course) =>
  Array.isArray(c.strokeIndex) && c.strokeIndex.length === 18
    ? c.strokeIndex
    : Array(18).fill(null);

const coursePar = (c: Course) => safePars(c).reduce((a,b)=>a+b,0);

const toCourseHcp = (hi: number | undefined, c: Course) => {
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

const sideName = (side: MatchSide[], players: Player[], teams: Team[]) =>
  expandSide(side, teams).map(id => players.find(p=>p.id===id)?.name ?? '—').join(' & ');

type HoleRes = 'A'|'B'|'AS'|null;
const labelUpDn = (n:number) => (n===0?'AS': n>0?`${n}UP`:`${Math.abs(n)}DN`);

/** ===== small UI atoms (без Tailwind) ===== */

function HoleChip({
  value,
  winner,
  color,
  star
}:{
  value: number|string|null|undefined;
  winner?: boolean;
  color: 'red'|'blue'|'gray';
  star?: ''|'*'|'**';
}){
  return (
    <span className={`chip chip-${color} ${winner?'chip-win':''}`}>
      {value ?? '—'}{star ? <sup className="chip-star">{star}</sup> : null}
    </span>
  );
}

/** ===== main component ===== */

export default function MatchViewPage({
  match, course, players, teams
}:{
  match: Match;
  course: Course;
  players: Player[];
  teams: Team[];
}) {

  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);

  // перерасчёт нетто/лучшего на клиенте, если бэкенд не прислал готовые bestA/bestB
  const { winners, aNet, bNet, aStars, bStars } = useMemo(() => {
    const res: HoleRes[] = [];
    const A: (number|null)[] = [];
    const B: (number|null)[] = [];
    const Astar: (''|'*'|'**')[] = [];
    const Bstar: (''|'*'|'**')[] = [];

    const siArr = safeSI(course);
    const allow = match.format === 'singles' ? ALLOW_SINGLES : ALLOW_FOURBALL;

    for (let i = 0; i < 18; i++) {
      // собрать кандидатов по стороне (персональные gross, прочерки пропускаем)
      const sideBest = (ids: string[], store?: Record<string,(number|null)[]>, teamGross?: (number|null)[]) => {
        const cands: Array<{net:number; star:''|'*'|'**'}> = [];
        if (store && Object.keys(store).length) {
          for (const pid of ids) {
            const arr = store[pid];
            const gross = Array.isArray(arr) ? arr[i] : null;
            if (gross == null) continue;          // пусто/прочерк — не участвует
            const hi = players.find(p=>p.id===pid)?.hcp ?? 0;
            const ch = Math.round(toCourseHcp(hi, course) * allow);
            const sh = shotsOnHole(ch, i, siArr);
            cands.push({ net: gross - sh, star: stars(sh) });
          }
        } else if (teamGross) {
          const g = teamGross[i];
          if (g != null) cands.push({ net: g, star: '' });
        }
        if (!cands.length) return { best:null as number|null, star:'' as ''|'*'|'**' };
        const best = cands.reduce((m,x)=> x.net<m.net?x:m);
        return { best: best.net, star: best.star };
      };

      const Ares = sideBest(aIds, match.playerScoresA, match.scoresA);
      const Bres = sideBest(bIds, match.playerScoresB, match.scoresB);

      A.push(Ares.best); B.push(Bres.best);
      Astar.push(Ares.star); Bstar.push(Bres.star);

      if (Ares.best==null && Bres.best==null) res.push(null);
      else if (Bres.best==null || (Ares.best!=null && Ares.best < Bres.best)) res.push('A');
      else if (Ares.best==null || (Bres.best!=null && Bres.best < Ares.best)) res.push('B');
      else res.push('AS');
    }

    return { winners: res, aNet: A, bNet: B, aStars: Astar, bStars: Bstar };
  }, [match.id, JSON.stringify(match.playerScoresA), JSON.stringify(match.playerScoresB), JSON.stringify(match.scoresA), JSON.stringify(match.scoresB), course.cr, course.slope]);

  const upFront = winners.slice(0,9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upBack  = winners.slice(9).reduce((n,r)=> r==='A'?n+1: r==='B'?n-1:n, 0);
  const upTot   = upFront + upBack;

  const started  = winners.some(w=>w!==null);
  const finished = winners.every(w=>w!==null);

  const aName = sideName(match.sideA, players, teams);
  const bName = sideName(match.sideB, players, teams);
  const pars   = safePars(course);

  return (
    <div className="view-wrap">
      {/* локальные стили */}
      <style>{`
        .view-wrap{max-width:1060px;margin:0 auto;padding:12px;}
        .hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;}
        .hdr-col{width:33.33%;}
        .hdr-title{font-weight:700;font-size:14px;line-height:1.2}
        .hdr-center{text-align:center}
        .hdr-status{font-weight:800;font-size:18px;margin-bottom:4px}
        .live{color:#b91c1c}
        .final{color:#111827}
        .grid3{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px}
        .lane{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-start}
        .lane.r{justify-content:flex-end}
        .mid-col{display:flex;flex-direction:column;align-items:center;gap:8px}
        .badge{border:1px solid #D1D5DB;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px}
        .par-lane{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
        .chip{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;font-weight:700;font-size:14px;line-height:1}
        .chip-star{font-size:10px;margin-left:2px}
        .chip-gray{border:2px solid #D1D5DB;color:#6B7280;background:#fff}
        .chip-red{border:2px solid #DC2626;color:#B91C1C;background:#fff}
        .chip-blue{border:2px solid #2563EB;color:#1D4ED8;background:#fff}
        .chip-win.chip-red{background:#DC2626;color:#fff}
        .chip-win.chip-blue{background:#2563EB;color:#fff}
        @media (min-width: 768px){
          .hdr-title{font-size:18px}
          .hdr-status{font-size:22px}
          .chip{width:42px;height:42px;font-size:16px}
        }
      `}</style>

      {/* верхняя строка с названиями и статусом */}
      <div className="hdr">
        <div className="hdr-col"><div className="hdr-title">{aName}</div></div>
        <div className="hdr-col hdr-center">
          <div className={`hdr-status ${finished?'final': started?'live':''}`}>
            {finished ? 'FINAL RESULT' : (started ? 'LIVE!' : '—')}
          </div>
        </div>
        <div className="hdr-col" style={{textAlign:'right'}}><div className="hdr-title">{bName}</div></div>
      </div>

      {/* три колонки: левая дорожка A, центр OUT/IN/TOT + par, правая дорожка B */}
      <div className="grid3">
        {/* A */}
        <div className="lane">
          {aNet.map((v,i)=>(
            <HoleChip key={i} value={v} winner={winners[i]==='A'} color="red" star={aStars[i]} />
          ))}
        </div>

        {/* CENTER */}
        <div className="mid-col">
          <div>OUT</div>
          <div className="badge">{labelUpDn(upFront)}</div>
          <div style={{marginTop:6}}>IN</div>
          <div className="badge">{labelUpDn(upBack)}</div>
          <div style={{marginTop:6}}>TOT</div>
          <div className="badge">{labelUpDn(upTot)}</div>

          <div className="par-lane">
            {pars.map((p,i)=> <HoleChip key={i} value={p} color="gray" />)}
          </div>
        </div>

        {/* B */}
        <div className="lane r">
          {bNet.map((v,i)=>(
            <HoleChip key={i} value={v} winner={winners[i]==='B'} color="blue" star={bStars[i]} />
          ))}
        </div>
      </div>
    </div>
  );
}
