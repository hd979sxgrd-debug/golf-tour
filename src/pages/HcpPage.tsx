import React, { useMemo } from 'react';
import { Course, Match, Player, Team } from '../types';
import {
  coursePar,
  flattenPlayerIds,
  grossFor,
  grossFromDash,
  shotsOnHole,
  toCourseHandicap,
} from '../utils';

type Props = {
  matches: Match[];
  courses: Course[];
  players: Player[];
  teams: Team[];
};

type PlayerRound = {
  gross: number;
  adjusted: number;
  holeCount: number;
  courseRating: number;
  slope: number;
};

const defaultDays = ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'];

const manualDayZeroScores: { name: string; score: number }[] = [
  { name: 'Касперович', score: 96 },
  { name: 'Пилецкий', score: 106 },
  { name: 'Прокорим', score: 85 },
  { name: 'Вашкевич', score: 105 },
  { name: 'Зенько', score: 98 },
  { name: 'Вашков', score: 101 },
  { name: 'Алес', score: 103 },
  { name: 'Сафин', score: 92 },
  { name: 'Фетисов', score: 82 },
  { name: 'Хмелев', score: 90 },
];

function ensureDay(list: string[], day: string) {
  if (!list.includes(day)) list.push(day);
}

function computeRoundDifferential(round: PlayerRound): number | null {
  if (!round || round.holeCount === 0) return null;
  const slope = round.slope || 113;
  if (!Number.isFinite(slope) || slope === 0) return null;
  const normalizedAdjusted = round.holeCount === 18
    ? round.adjusted
    : round.adjusted * (18 / round.holeCount);
  const diff = ((normalizedAdjusted - round.courseRating) * 113) / slope;
  return Number.isFinite(diff) ? diff : null;
}

const formatDiff = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
};

const roundsLabel = (count: number) => {
  if (count === 1) return '1 раунд';
  if (count === 2 || count === 3 || count === 4) return `${count} раунда`;
  return `${count} раундов`;
};

export default function HcpPage({ matches, courses, players, teams }: Props) {
  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);

  const nameToPlayerId = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => map.set(p.name.trim().toLowerCase(), p.id));
    return map;
  }, [players]);

  const { dayOrder, roundsByPlayer } = useMemo(() => {
    const dayOrder = [...defaultDays];
    const courseMap = new Map<string, Course>();
    courses.forEach((c) => courseMap.set(c.id, c));

    const byPlayer: Record<string, Record<string, PlayerRound[]>> = {};
    const ensureContainer = (pid: string, day: string) => {
      if (!byPlayer[pid]) byPlayer[pid] = {};
      if (!byPlayer[pid][day]) byPlayer[pid][day] = [];
      return byPlayer[pid][day];
    };

    const accumulateSide = (
      match: Match,
      sideDef: Match['sideA'],
      playerScores: Match['playerScoresA'],
    ) => {
      const ids = flattenPlayerIds(sideDef, teams);
      const course = courseMap.get(match.courseId);
      if (!course) return;
      const rating = course.cr ?? coursePar(course);
      const slope = course.slope ?? 113;
      const scoreMap = playerScores as Record<string, (number | null | undefined)[]> | undefined;
      const dayLabel = match.day ?? 'Day 1';

      ids.forEach((pid) => {
        const player = playerById.get(pid);
        if (!player) return;
        let grossTotal = 0;
        let adjustedTotal = 0;
        let holeCount = 0;
        for (let holeIdx = 0; holeIdx < 18; holeIdx++) {
          const grossValue = grossFor(scoreMap as any, pid, holeIdx);
          let grossScore: number | null = null;
          if (grossValue === -1) {
            grossScore = grossFromDash(match.format, player, course, holeIdx);
          } else if (typeof grossValue === 'number') {
            grossScore = grossValue;
          }
          if (grossScore == null) continue;
          grossTotal += grossScore;
          holeCount += 1;

          const par = course.pars?.[holeIdx] ?? 4;
          const strokes = shotsOnHole(
            toCourseHandicap(player.hcp ?? 0, course),
            holeIdx,
            course.strokeIndex,
          );
          const maxScore = par + strokes + 2;
          const adjustedScore = Math.min(grossScore, maxScore);
          adjustedTotal += adjustedScore;
        }

        if (holeCount > 0) {
          ensureContainer(pid, dayLabel).push({
            gross: grossTotal,
            adjusted: adjustedTotal,
            holeCount,
            courseRating: rating,
            slope,
          });
        }
      });
    };

    matches.forEach((match) => {
      const day = match.day ?? 'Day 1';
      ensureDay(dayOrder, day);
      accumulateSide(match, match.sideA, match.playerScoresA);
      accumulateSide(match, match.sideB, match.playerScoresB);
    });

    const gloriaCourse = courses.find(
      (c) => c.name && c.name.trim().toLowerCase() === 'gloria new course',
    );
    if (gloriaCourse) {
      const rating = gloriaCourse.cr ?? coursePar(gloriaCourse);
      const slope = gloriaCourse.slope ?? 113;
      const day = 'Day 0';
      manualDayZeroScores.forEach(({ name, score }) => {
        const pid = nameToPlayerId.get(name.trim().toLowerCase());
        if (!pid) return;
        ensureContainer(pid, day).push({
          gross: score,
          adjusted: score,
          holeCount: 18,
          courseRating: rating,
          slope,
        });
      });
    }

    if (!dayOrder.includes('Day 0')) {
      dayOrder.unshift('Day 0');
    }

    return { dayOrder, roundsByPlayer: byPlayer };
  }, [courses, matches, nameToPlayerId, playerById, teams]);

  const renderCell = (rounds: PlayerRound[] | undefined) => {
    if (!rounds || rounds.length === 0) return <span className="muted">—</span>;
    const diffs = rounds
      .map((round) => computeRoundDifferential(round))
      .filter((value): value is number => value != null);
    if (diffs.length === 0) return <span className="muted">—</span>;
    const avg = diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
    return (
      <div className="player-stat-cell">
        <div className="player-stat-main">{formatDiff(avg)}</div>
        <div className="player-stat-sub">{roundsLabel(diffs.length)}</div>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">Гандикапные дифференциалы по дням</div>
          <div className="muted">Включая Day 0 (Gloria New Course)</div>
        </div>
        <a className="btn" href="#/public">← Назад</a>
      </div>
      <div className="card">
        <div className="content scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Игрок</th>
                {dayOrder.map((day) => (
                  <th key={day}>{day}</th>
                ))}
                <th>Средний дифф.</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const perDay = roundsByPlayer[player.id] ?? {};
                const diffs: number[] = [];
                dayOrder.forEach((day) => {
                  const rounds = perDay[day];
                  if (!rounds || rounds.length === 0) return;
                  const dayDiffs = rounds
                    .map((round) => computeRoundDifferential(round))
                    .filter((value): value is number => value != null);
                  diffs.push(...dayDiffs);
                });
                const overallAvg = diffs.length
                  ? diffs.reduce((sum, v) => sum + v, 0) / diffs.length
                  : null;

                return (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    {dayOrder.map((day) => (
                      <td key={day}>{renderCell(perDay[day])}</td>
                    ))}
                    <td>
                      {overallAvg == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="player-stat-cell">
                          <div className="player-stat-main">{formatDiff(overallAvg)}</div>
                          <div className="player-stat-sub">{roundsLabel(diffs.length)}</div>
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
    </div>
  );
}

