// src/components/PlayersStats.tsx
import React, { useMemo, useState } from 'react'
import { Course, Match, Player, Team } from '../types'
import { flattenPlayerIds, grossFromDash, grossFor, shotsOnHole, toCourseHandicap } from '../utils'

const defaultDays = ['Day 0','Day 1','Day 2','Day 3','Day 4','Day 5'];

type PlayerDaySummary = { gross: number; adjusted: number; holeCount: number };
type PlayerDayDetail = {
  holes: { hole: number; gross: number | null; adjusted: number | null }[];
  grossTotal: number;
  adjustedTotal: number;
};

export default function PlayersStats({ matches, courses, players, teams }:{ matches:Match[]; courses:Course[]; players:Player[]; teams:Team[]; }){
  const dayOrder = useMemo(() => {
    const list = [...defaultDays];
    matches.forEach(m => {
      const day = m.day ?? 'Day 1';
      if (!list.includes(day)) list.push(day);
    });
    return list;
  }, [matches]);

  const { summaries, details } = useMemo(() => {
    const courseMap = new Map<string, Course>();
    courses.forEach(c => courseMap.set(c.id, c));
    const playerMap = new Map<string, Player>();
    players.forEach(p => playerMap.set(p.id, p));

    const byPlayer: Record<string, Record<string, PlayerDaySummary>> = {};
    const detailByPlayer: Record<string, Record<string, PlayerDayDetail>> = {};

    const ensureContainers = (pid: string, day: string) => {
      if (!byPlayer[pid]) byPlayer[pid] = {};
      if (!detailByPlayer[pid]) detailByPlayer[pid] = {};
      if (!byPlayer[pid][day]) byPlayer[pid][day] = { gross: 0, adjusted: 0, holeCount: 0 };
      if (!detailByPlayer[pid][day]) {
        detailByPlayer[pid][day] = {
          holes: Array.from({ length: 18 }, (_, idx) => ({ hole: idx + 1, gross: null, adjusted: null })),
          grossTotal: 0,
          adjustedTotal: 0,
        };
      }
      return { summary: byPlayer[pid][day], detail: detailByPlayer[pid][day] };
    };

    matches.forEach(match => {
      const day = match.day ?? 'Day 1';
      const course = courseMap.get(match.courseId);
      if (!course) return;

      const accumulateSide = (sideKey: 'A' | 'B') => {
        const sideDef = sideKey === 'A' ? match.sideA : match.sideB;
        const playerScores = sideKey === 'A' ? match.playerScoresA : match.playerScoresB;
        const ids = flattenPlayerIds(sideDef, teams);
        ids.forEach(pid => {
          const player = playerMap.get(pid);
          if (!player) return;
          const { summary, detail } = ensureContainers(pid, day);
          const fullCourseHcp = toCourseHandicap(player.hcp ?? 0, course);

          for (let holeIdx = 0; holeIdx < 18; holeIdx++) {
            const grossValue = grossFor(playerScores, pid, holeIdx);
            let grossScore: number | null = null;
            if (grossValue === -1) {
              grossScore = grossFromDash(match.format, player, course, holeIdx, match);
            } else if (typeof grossValue === 'number') {
              grossScore = grossValue;
            }

            if (grossScore == null) continue;

            const par = course.pars?.[holeIdx] ?? 4;
            const strokes = shotsOnHole(fullCourseHcp, holeIdx, course.strokeIndex);
            const maxScore = par + strokes + 2;
            const adjustedScore = Math.min(grossScore, maxScore);

            summary.gross += grossScore;
            summary.adjusted += adjustedScore;
            summary.holeCount += 1;

            detail.grossTotal += grossScore;
            detail.adjustedTotal += adjustedScore;
            const holeDetail = detail.holes[holeIdx];
            holeDetail.gross = (holeDetail.gross ?? 0) + grossScore;
            holeDetail.adjusted = (holeDetail.adjusted ?? 0) + adjustedScore;
          }
        });
      };

      accumulateSide('A');
      accumulateSide('B');
    });

    return { summaries: byPlayer, details: detailByPlayer };
  }, [matches, courses, players, teams]);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) ?? null : null;
  const selectedDetails = selectedPlayerId ? details[selectedPlayerId] ?? {} : {};
  const detailDayOrder = useMemo(() => {
    const ordered: string[] = [];
    dayOrder.forEach(day => {
      if (selectedDetails[day]) ordered.push(day);
    });
    Object.keys(selectedDetails).forEach(day => {
      if (!ordered.includes(day)) ordered.push(day);
    });
    return ordered;
  }, [dayOrder, selectedDetails]);
  const detailSections = detailDayOrder.filter(day => selectedDetails[day]?.holes.some(h => h.gross != null));

  const renderScoreCell = (summary?: PlayerDaySummary) => {
    if (!summary || summary.holeCount === 0) return <span className="muted">—</span>;
    return (
      <div className="player-stat-cell">
        <div className="player-stat-main">{summary.gross}</div>
        <div className="player-stat-sub">Adj {summary.adjusted}</div>
      </div>
    );
  };

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
                {dayOrder.map(d => <th key={d}>{d}</th>)}
                <th>Итого</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const playerSummaries = summaries[player.id] ?? {};
                const totalGross = dayOrder.reduce((sum, day) => sum + (playerSummaries[day]?.gross ?? 0), 0);
                const totalAdjusted = dayOrder.reduce((sum, day) => sum + (playerSummaries[day]?.adjusted ?? 0), 0);
                const totalHoleCount = dayOrder.reduce((sum, day) => sum + (playerSummaries[day]?.holeCount ?? 0), 0);
                return (
                  <tr key={player.id}>
                    <td>
                      <button className="link-button" onClick={() => setSelectedPlayerId(player.id)}>{player.name}</button>
                    </td>
                    {dayOrder.map(day => (
                      <td key={day}>{renderScoreCell(playerSummaries[day])}</td>
                    ))}
                    <td>
                      {totalHoleCount === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="player-stat-cell">
                          <div className="player-stat-main"><b>{totalGross}</b></div>
                          <div className="player-stat-sub">Adj {totalAdjusted}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPlayer && (
        <div className="modal-backdrop" onClick={() => setSelectedPlayerId(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{selectedPlayer.name}</div>
                <div className="muted">Gross &amp; adjusted scores по лункам</div>
              </div>
              <button className="btn" onClick={() => setSelectedPlayerId(null)}>Закрыть</button>
            </div>
            <div className="modal-body">
              {detailSections.map(day => {
                const detail = selectedDetails[day]!;
                const halfIndex = Math.max(1, Math.floor(detail.holes.length / 2));
                const frontHoles = detail.holes.slice(0, halfIndex);
                const backHoles = detail.holes.slice(halfIndex);
                const frontGross = frontHoles.reduce((sum, hole) => sum + (hole.gross ?? 0), 0);
                const backGross = backHoles.reduce((sum, hole) => sum + (hole.gross ?? 0), 0);
                const frontAdjusted = frontHoles.reduce((sum, hole) => sum + (hole.adjusted ?? 0), 0);
                const backAdjusted = backHoles.reduce((sum, hole) => sum + (hole.adjusted ?? 0), 0);
                const frontSpan = Math.max(1, frontHoles.length);
                const backSpan = Math.max(1, backHoles.length);
                return (
                  <div className="modal-section" key={day}>
                    <div className="modal-section-header">
                      <div className="modal-section-title">{day}</div>
                      <div className="modal-section-subtitle">Gross {detail.grossTotal} · Adjusted {detail.adjustedTotal}</div>
                    </div>
                    <div className="scroll-x">
                      <table className="table modal-table">
                        <thead>
                          <tr>
                            <th>Лунка</th>
                            {detail.holes.map(hole => <th key={hole.hole}>{hole.hole}</th>)}
                            <th>Итого</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Gross</td>
                            {detail.holes.map(hole => <td key={hole.hole}>{hole.gross ?? '—'}</td>)}
                            <td>{detail.grossTotal}</td>
                          </tr>
                          <tr>
                            <td>Adjusted</td>
                            {detail.holes.map(hole => <td key={hole.hole}>{hole.adjusted ?? '—'}</td>)}
                            <td>{detail.adjustedTotal}</td>
                          </tr>
                          <tr>
                            <td>Front {frontHoles.length}</td>
                            <td colSpan={frontSpan}>Gross {frontGross} · Adjusted {frontAdjusted}</td>
                            <td colSpan={backSpan}>Back {backHoles.length} Gross {backGross} · Adjusted {backAdjusted}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {detailSections.length === 0 && (
                <div className="muted">Нет данных по результатам для выбранного игрока.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
