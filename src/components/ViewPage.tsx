// src/components/ViewPage.tsx
import React from 'react'
import { Course, Match, Player, Team } from '../types'
import { calcMatchPlayStatus, calcPoints, flattenPlayerIds, outIn, sideNetOnHole, strokeStarsForPlayer } from '../utils'

export default function ViewPage({ match, course, players, teams }:{ match:Match; course:Course; players:Player[]; teams:Team[]; }){
  const res = calcMatchPlayStatus(match, players, teams, course);
  const pts = calcPoints(res.perHole);
  const oi = outIn(res.perHole);

  const idsA = flattenPlayerIds(match.sideA, teams);
  const idsB = flattenPlayerIds(match.sideB, teams);

  const labelFor = (side:'A'|'B', holeIdx:number)=>{
    const sideDef = side==='A'? match.sideA : match.sideB;
    const playerScores = side==='A'? match.playerScoresA : match.playerScoresB;
    const grossRow = side==='A'? match.scoresA : match.scoresB;
    const { net, meta } = sideNetOnHole({ format: match.format, holeIdx, side: sideDef, grossRow, playerScores, players, teams, course, match });
    let stars = '';
    if (match.format==='singles'){
      const pid = (side==='A'?idsA:idsB)[0];
      const pl = players.find(p=>p.id===pid)!;
      stars = strokeStarsForPlayer(match.format, pl, course, holeIdx, match);
    } else if (meta.usedPid){
      const pl = players.find(p=>p.id===meta.usedPid)!;
      stars = strokeStarsForPlayer(match.format, pl, course, holeIdx, match);
    }
    const text = net==null ? '–' : String(net);
    return stars ? `${text}${stars}` : text;
  };

  const Circle = ({ children, win, lose }:{ children:React.ReactNode; win?:boolean; lose?:boolean; }) => (
    <span style={{
      display:'inline-flex', justifyContent:'center', alignItems:'center',
      minWidth:32, height:32, padding:'0 6px', borderRadius:16, border:`2px solid ${win?'#b91c1c': lose?'#1e40af':'#cbd5e1'}`,
      color: win?'#b91c1c' : lose?'#1e40af':'#334155', fontWeight:700
    }}>{children}</span>
  );

  const holeBadge = (i:number)=>{
    const r = res.perHole[i];
    return (
      <div key={i} style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:10, alignItems:'center', marginBottom:6}}>
        <div style={{textAlign:'right'}}><Circle win={r==='A'} lose={r==='B'}>{labelFor('A', i)}</Circle></div>
        <div style={{textAlign:'center', color:'#64748b', fontSize:12}}>Par {course.pars[i]}</div>
        <div style={{textAlign:'left'}}><Circle win={r==='B'} lose={r==='A'}>{labelFor('B', i)}</Circle></div>
      </div>
    );
  };

  const namesA = idsA.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(', ');
  const namesB = idsB.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(', ');

  return (
    <div className="container">
      <div style={{textAlign:'center', margin:'16px 0 8px', fontSize:18, fontWeight:800}}>Матч {pts.A}:{pts.B}</div>
      <div className="card" style={{padding:16}}>
        <div style={{maxWidth:520, margin:'0 auto'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', marginBottom:8}}>
            <div style={{textAlign:'right', fontWeight:700}}>{namesA}</div>
            <div className="chip" style={{margin:'0 8px'}}>OUT {oi.out}</div>
            <div style={{textAlign:'left', fontWeight:700}}>{namesB}</div>
          </div>
          {Array.from({length:9}).map((_,i)=> holeBadge(i))}
          <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', margin:'10px 0 8px'}}>
            <div style={{textAlign:'right', fontWeight:700}}>{namesA}</div>
            <div className="chip" style={{margin:'0 8px'}}>IN {oi.in}</div>
            <div style={{textAlign:'left', fontWeight:700}}>{namesB}</div>
          </div>
          {Array.from({length:9}).map((_,k)=> holeBadge(9+k))}
          <div style={{display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', marginTop:12}}>
            <div/>
            <div className="chip">TOT {oi.tot}</div>
            <div/>
          </div>
        </div>
      </div>
    </div>
  )
}
