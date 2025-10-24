export type Player = { id: string; name: string; hcp?: number };
export type Team = { id: string; name: string; playerIds: string[] };
export type Course = { id: string; name: string; pars: number[]; strokeIndex?: number[]; cr?: number|null; slope?: number|null };
export type MatchSide = { type: "player" | "team"; id: string };
export type MatchFormat = "singles" | "fourball";

export type Match = {
  id: string;
  name: string;
  day?: string;
  format: MatchFormat;
  courseId: string;
  /** команда-владалец стороны (для фильтрации списков) */
  sideATeamId?: string;
  sideBTeamId?: string;
  sideA: MatchSide[];
  sideB: MatchSide[];
  /** командные gross (можно не использовать при поигровочном вводе) */
  scoresA: (number | null | undefined)[];
  scoresB: (number | null | undefined)[];
  /** поигровочные gross: значение -1 = ПРОЧЕРК */
  playerScoresA?: Record<string, (number | null | undefined)[]>;
  playerScoresB?: Record<string, (number | null | undefined)[]>;
  notes?: string;
};
