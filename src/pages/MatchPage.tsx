import React, { useEffect, useState } from 'react';
import { apiGetMatch, apiSubmitScore } from '../api';
import { Course, Match, Player, Team } from '../types';
import ScoringPage from '../components/ScoringPage';
import { useStore } from '../store';

export default function MatchPage({ matchId, readOnlyParam }: { matchId: string; readOnlyParam?: boolean }) {
  const { players, teams } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

  const readOnly = !!readOnlyParam || (new URLSearchParams(window.location.search).get('view') === 'public');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoaded(false); setError(null);
      try {
        const { match, course } = await apiGetMatch(matchId);
        if (!alive) return;
        setMatch(match); setCourse(course); setLoaded(true);
      } catch (e: any) {
        if (!alive) return;
        setError(e.message || String(e)); setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [matchId]);

  const onScore = async (p: { side: 'A' | 'B'; hole: number; playerId?: string | null; gross?: number | null; dash?: boolean; }) => {
    if (!match) return;
    // оптимистичное обновление
    const copy: Match = JSON.parse(JSON.stringify(match));
    const hi = p.hole - 1;
    if (p.playerId) {
      const key = p.side === 'A' ? 'playerScoresA' : 'playerScoresB';
      copy[key] = copy[key] || {};
      const arr = copy[key]![p.playerId] || Array(18).fill(null);
      arr[hi] = p.dash ? -1 : (p.gross ?? null);
      copy[key]![p.playerId] = arr;
    } else {
      const key = p.side === 'A' ? 'scoresA' : 'scoresB';
      const arr = copy[key] || Array(18).fill(null);
      arr[hi] = p.dash ? -1 : (p.gross ?? null);
      (copy as any)[key] = arr;
    }
    setMatch(copy);

    try {
      await apiSubmitScore({ matchId, side: p.side, hole: p.hole, playerId: p.playerId ?? null, gross: p.gross ?? null, dash: !!p.dash });
      const { match: fresh, course: freshCourse } = await apiGetMatch(matchId);
      setMatch(fresh); setCourse(freshCourse);
    } catch (e) {
      console.error(e);
    }
  };

  if (!loaded) return <div className="p-4">Загрузка матча…</div>;
  if (error) return <div className="p-4 text-red-700">Ошибка: {error}</div>;
  if (!match || !course) return <div className="p-4">Матч не найден.</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="max-w-5xl mx-auto">
        <ScoringPage
          match={match}
          course={course}
          players={players as Player[]}
          teams={teams as Team[]}
          readOnly={readOnly}
          onScore={readOnly ? undefined : onScore}
        />
      </div>
    </div>
  );
}
