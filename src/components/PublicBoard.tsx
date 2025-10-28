// src/components/PublicBoard.tsx
import React, { useMemo } from 'react'
import { Match, Player, Team, Course } from '../types'
import { calcMatchPlayStatus, calcPoints, matchProgress, normalizeMatch } from '../utils'

type Props = {
  matches: Match[];
  courses: Course[];
  players: Player[];
  teams: Team[];
}

const SCORING_DAYS = ['Day 1','Day 2','Day 3','Day 4','Day 5'];

export default function PublicBoard({ matches, courses, players, teams }: Props){
  const normalizedMatches = useMemo(() => matches.map(normalizeMatch), [matches]);

  const courseOf = (id: string) => courses.find(c=>c.id===id);
  const teamName = (id?: string) => teams.find(t=>t.id===id)?.name ?? (id ? id : '—');

  // --- Очки по дням и командам ---
  const totalsByDay: Record<string, Record<string, number>> = {};
  SCORING_DAYS.forEach(d => (totalsByDay[d] = {}));
  const overallTotals: Record<string, number> = {};
  const participating = new Set<string>();

  const pushPoints = (day: string, teamId: string, pts: number) => {
    if (!teamId) return;
    if (!SCORING_DAYS.includes(day)) return;
    if (!totalsByDay[day]) totalsByDay[day] = {};
    totalsByDay[day][teamId] = (totalsByDay[day][teamId] ?? 0) + pts;
    overallTotals[teamId] = (overallTotals[teamId] ?? 0) + pts;
    participating.add(teamId);
  };

  normalizedMatches.forEach(m => {
    const day = m.day ?? 'Day 1';
    if (!SCORING_DAYS.includes(day)) return;
    const c = courseOf(m.courseId);
    if (!c) return;
    const res = calcMatchPlayStatus(m, players, teams, c);
    const pts = calcPoints(res.perHole);
    if (m.sideATeamId) pushPoints(day, m.sideATeamId, pts.A);
    if (m.sideBTeamId) pushPoints(day, m.sideBTeamId, pts.B);
  });

  const rankedTeams = Array.from(participating).sort((a, b) => {
    const diff = (overallTotals[b] ?? 0) - (overallTotals[a] ?? 0);
    if (diff !== 0) return diff;
    const nameA = teamName(a);
    const nameB = teamName(b);
    return nameA.localeCompare(nameB);
  });

  const fallbackTeams = teams.slice(0, 2).map(t => t.id);
  while (rankedTeams.length < 2 && fallbackTeams.length) {
    const next = fallbackTeams.shift();
    if (next && !participating.has(next)) rankedTeams.push(next);
  }

  const teamAId = rankedTeams[0];
  const teamBId = rankedTeams[1];
  const teamAName = teamName(teamAId) || 'Team A';
  const teamBName = teamName(teamBId) || 'Team B';

  // Подсчёт тоталов
  let grandA = 0, grandB = 0;
  const rows = SCORING_DAYS.map(day => {
    const a = teamAId ? (totalsByDay[day]?.[teamAId] ?? 0) : 0;
    const b = teamBId ? (totalsByDay[day]?.[teamBId] ?? 0) : 0;
    grandA += a; grandB += b;
    return { day, a, b };
  });

  // Группировка матчей по дням для списков
  const matchesByDay: Record<string, Match[]> = {};
  SCORING_DAYS.forEach(d => matchesByDay[d] = []);
  normalizedMatches.forEach(m => {
    const d = m.day ?? 'Day 1';
    if (SCORING_DAYS.includes(d)) matchesByDay[d].push(m);
  });

  // --- UI helpers ---
  const centerWrap: React.CSSProperties = { display:'flex', justifyContent:'center', width:'100%' };
  const tableWrap: React.CSSProperties = { overflowX:'auto', maxWidth:'100%', display:'inline-block' };
  const thTd: React.CSSProperties = { padding:'10px 14px', textAlign:'center', whiteSpace:'nowrap' };
  const dayScoreStyle: React.CSSProperties = { fontSize:20, fontWeight:800 };
  const totalScoreStyle: React.CSSProperties = { fontSize:24, fontWeight:900 };
  const red = '#dc2626';

  const colorByLead = (a:number, b:number): {a:React.CSSProperties; b:React.CSSProperties} => {
    if (a === b) return { a:{}, b:{} };
    return a > b ? ({ a:{ color:red }, b:{} }) : ({ a:{}, b:{ color:red } });
  };

  return (
    <div className="container">
      <div className="header" style={{alignItems:'center', gap:8}}>
        <div className="title">Счёт матчей</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <a className="btn" href="#/players">Игроки (итоги по дням)</a>
          <a className="btn" href="#/hcp">Гандикап (дифференциалы)</a>
        </div>
      </div>

      {/* --- ИТОГОВАЯ ТАБЛИЦА КОМАНД ЗА 5 ДНЕЙ (центр, крупные цифры, красный лидер) --- */}
      <div className="card" style={{marginBottom:16}}>
        <div className="header" style={{justifyContent:'center'}}>
          <div className="title" style={{textAlign:'center'}}>Командный зачёт (5 дней)</div>
        </div>
        <div className="content" style={centerWrap}>
          <div style={tableWrap}>
            <table className="min-w-full text-sm" style={{ borderCollapse:'separate', borderSpacing:0 }}>
              <thead>
                <tr>
                  <th style={{...thTd, textAlign:'left'}}>День</th>
                  <th style={thTd}>{teamAName}</th>
                  <th style={thTd}>{teamBName}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const lead = colorByLead(r.a, r.b);
                  return (
                    <tr key={r.day} className="border-t">
                      <td style={{...thTd, textAlign:'left'}}>{r.day}</td>
                      <td style={{...thTd, ...dayScoreStyle, ...lead.a}}>{r.a}</td>
                      <td style={{...thTd, ...dayScoreStyle, ...lead.b}}>{r.b}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const lead = colorByLead(grandA, grandB);
                  return (
                    <tr className="border-t">
                      <td style={{...thTd, textAlign:'left', fontWeight:900}}>Итого</td>
                      <td style={{...thTd, ...totalScoreStyle, ...lead.a}}>{grandA}</td>
                      <td style={{...thTd, ...totalScoreStyle, ...lead.b}}>{grandB}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- Списки матчей по дням с бейджами LIVE!/FINAL RESULT --- */}
      {SCORING_DAYS.map(day => {
        const list = (matchesByDay[day] || []).filter(m => courseOf(m.courseId));
        const dayRow = rows.find(r => r.day===day);
        const dayTotalsA = dayRow?.a ?? 0;
        const dayTotalsB = dayRow?.b ?? 0;
        const dayLead = colorByLead(dayTotalsA, dayTotalsB);

        return (
          <div key={day} className="card" style={{marginBottom:14}}>
            <div className="header" style={{justifyContent:'center', flexDirection:'column', gap:6}}>
              <div className="title" style={{textAlign:'center'}}>{day}</div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', alignItems:'baseline' }}>
                <span style={{...dayScoreStyle, ...dayLead.a}}>{dayTotalsA}</span>
                <span className="muted" style={{fontWeight:700}}>:</span>
                <span style={{...dayScoreStyle, ...dayLead.b}}>{dayTotalsB}</span>
              </div>
            </div>
            <div className="content grid">
              {list.length===0 && <div className="muted">Нет матчей</div>}
              {list.map(m => {
                const c = courseOf(m.courseId)!;
                const res = calcMatchPlayStatus(m, players, teams, c);
                const pts = calcPoints(res.perHole);
                const prog = matchProgress(m, players, teams, c);
                return (
                  <div key={m.id} className="row card" style={{padding:10, alignItems:'center', gap:8}}>
                    <div>
                      <b>{m.name}</b> — <span className="muted">{c?.name}</span> <span className="chip">[{m.format}]</span>
                      <div className="muted">
                        Матч-плей: <b>{res.status}</b> • Очки A/B: <b>{pts.A}</b> : <b>{pts.B}</b>
                      </div>
                    </div>
                    {prog.finished ? (
                      <span className="chip" style={{background:'#111827', color:'#fff'}}>FINAL RESULT</span>
                    ) : prog.started ? (
                      <span className="chip" style={{background:'#dc2626', color:'#fff'}}>LIVE!</span>
                    ) : null}
                    <a className="btn" href={`#/view/${m.id}`}>Смотреть</a>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
