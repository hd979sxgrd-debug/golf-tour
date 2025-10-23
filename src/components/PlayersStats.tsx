// src/components/PlayersStats.tsx
import React from 'react'
import { Course, Match, Player, Team } from '../types'
import { flattenPlayerIds, grossFromDash, grossFor, playerCourseHcpWithAllowance, shotsOnHole } from '../utils'

const days = ['Day 1','Day 2','Day 3','Day 4','Day 5'];

export default function PlayersStats({ matches, courses, players, teams }:{ matches:Match[]; courses:Course[]; players:Player[]; teams:Team[]; }){
  const courseOf=(id:string)=> courses.find(c=>c.id===id)!;

  // суммарный gross игрока по каждому дню
  const byPlayer: Record<string, Record<string, number>> = {};
  players.forEach(p=> byPlayer[p.id] = Object.fromEntries(days.map(d=>[d,0])));

  matches.forEach(m=>{
    const day = m.day ?? 'Day 1';
    const course = courseOf(m.courseId);

    const accSide = (side:'A'|'B')=>{
      const sideDef = side==='A' ? m.sideA : m.sideB;
      const ps = side==='A' ? m.playerScoresA : m.playerScoresB;
      const ids = flattenPlayerIds(sideDef, teams);
      ids.forEach(pid=>{
        for (let i=0;i<18;i++){
          const v = grossFor(ps, pid, i);
          if (v === -1){
            // прочерк
            const pl = players.find(x=>x.id===pid)!;
            const g = grossFromDash(m.format, pl, course, i);
            byPlayer[pid][day] += g;
          } else if (typeof v === 'number'){
            byPlayer[pid][day] += v;
          }
        }
      });
    };
    accSide('A'); accSide('B');
  });

  return (
    <div className="container">
      <div className="header">
        <div className="title">Игроки — суммарный gross по дням</div>
        <a className="btn" href="#/public">← Назад</a>
      </div>
      <div className="card">
        <div className="content scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Игрок</th>
                {days.map(d=><th key={d}>{d}</th>)}
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p=>{
                const total = days.reduce((s,d)=> s + (byPlayer[p.id][d]||0), 0);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    {days.map(d=> <td key={d}>{byPlayer[p.id][d] || 0}</td>)}
                    <td><b>{total}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
