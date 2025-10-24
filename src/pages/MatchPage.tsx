import React, { useEffect, useState } from 'react';
import { apiBootstrap, apiGetMatch, apiSubmitScore } from '../api';
import { Course, Match, Player, Team } from '../types';
import ScoringPage from '../components/ScoringPage';

export default function MatchPage({ matchId, readOnlyParam, focusPlayerId }: { matchId: string; readOnlyParam?: boolean; focusPlayerId?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<Match | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const readOnly =
    !!readOnlyParam || new URLSearchParams(window.location.search).get('view') === 'public';

  const refetch = async () => {
    const { match, course } = await apiGetMatch(matchId);
    setMatch(match); setCourse(course);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoaded(false);
      setError(null);
      try {
        const boot = await apiBootstrap();
        if (!alive) return;
        setPlayers(boot.players || []);
        setTeams(boot.teams || []);

        await refetch();
        if (!alive) return;
        setLoaded(true);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || String(e));
        setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [matchId]);

  // единичная запись удара (без рефетча — он будет один раз после навигации)
  const onScore = async (p: { side: 'A'|'B'; hole: number; playerId?: string|null; gross?: number|null; dash?: boolean; }) => {
    if (!match) return;

    // оптимистично патчим локальную копию
    const m: Match = JSON.parse(JSON.stringify(match));
    const hi = p.hole - 1;
    if (p.playerId) {
      const key = p.side === 'A' ? 'playerScoresA' : 'playerScoresB';
      (m as any)[key] = (m as any)[key] || {};
      const arr: (number|null)[] = ((m as any)[key][p.playerId] as (number|null)[]) || Array(18).fill(null);
      arr[hi] = p.dash ? -1 : (p.gross ?? null);
      (m as any)[key][p.playerId] = arr;
    } else {
      const key = p.side === 'A' ? 'scoresA' : 'scoresB';
      const arr: (number|null)[] = ((m as any)[key] as (number|null)[]) || Array(18).fill(null);
      arr[hi] = p.dash ? -1 : (p.gross ?? null);
      (m as any)[key] = arr;
    }
    setMatch(m);

    // network
    await apiSubmitScore({
      matchId,
      side: p.side,
      hole: p.hole,
      playerId: p.playerId ?? null,
      gross: p.gross ?? null,
      dash: !!p.dash,
    });
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
          players={players}
          teams={teams}
          readOnly={readOnly}
          focusPlayerId={focusPlayerId}
          onScore={readOnly ? undefined : onScore}
          refetch={readOnly ? undefined : refetch}
        />
      </div>
    </div>
  );
}
