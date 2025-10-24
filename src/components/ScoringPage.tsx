// src/components/ScoringPage.tsx
import React, { useMemo } from 'react';
import { Course, Match, Player, Team } from '../types';
import MatchInputPage from '../pages/MatchInputPage';
import MatchViewPage from '../pages/MatchViewPage';
import { normalizeMatch } from '../utils';

type CommonProps = {
  match: Match;
  course: Course;
  players: Player[];
  teams: Team[];
};

type InputProps = {
  readOnly?: false;
  focusPlayerId?: string;
  onScore?: (p: {
    side: 'A' | 'B';
    hole: number;
    playerId: string | null;
    gross: number | null;
    dash: boolean;
  }) => Promise<any>;
  refetch?: () => Promise<void>;
};

type ViewProps = {
  readOnly: true;
};

export default function ScoringPage(
  props: CommonProps & (InputProps | ViewProps)
) {
  const { match, course, players, teams } = props;
  const normalizedMatch = useMemo(() => normalizeMatch(match), [match]);

  // Если readOnly=true — это страница просмотра
  if ('readOnly' in props && props.readOnly) {
    return (
      <MatchViewPage
        match={normalizedMatch}
        course={course}
        players={players}
        teams={teams}
      />
    );
  }

  // Иначе — страница ввода результатов
  const {
    focusPlayerId,
    onScore,
    refetch,
  } = props as CommonProps & InputProps;

  const safeOnScore =
    onScore ||
    (async () => {
      /* no-op */
    });
  const safeRefetch =
    refetch ||
    (async () => {
      /* no-op */
    });

  return (
    <MatchInputPage
      match={normalizedMatch}
      course={course}
      players={players}
      teams={teams}
      focusPlayerId={focusPlayerId}
      onScore={safeOnScore}
      refetch={safeRefetch}
    />
  );
}
