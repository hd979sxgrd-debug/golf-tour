import React, { useEffect, useMemo, useState } from "react";
import { Course, Match, MatchSide, Player, Team } from "../types";
import { normalizeMatch } from "../utils";

/* ---------- helpers ---------- */
const ALLOW_SINGLES = 0.75;
const ALLOW_FOURBALL = 0.75;

const safePars = (c: Course) =>
  Array.isArray(c.pars) && c.pars.length === 18
    ? c.pars
    : [4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
const safeSI = (c: Course) =>
  Array.isArray(c.strokeIndex) && c.strokeIndex.length === 18
    ? c.strokeIndex
    : Array(18).fill(null);
const coursePar = (c: Course) => safePars(c).reduce((a, b) => a + b, 0);
const toCourseHcp = (hi: number|undefined, c: Course) => {
  if (hi == null) return 0;
  const slope = c.slope ?? 113, cr = c.cr ?? coursePar(c), par = coursePar(c);
  return Math.round(hi * (slope/113) + (cr - par));
};
const shotsOnHole = (ch: number, holeIdx: number, si?: (number | null)[]) => {
  if (!si || si.length !== 18) return 0;
  const idx = si[holeIdx] ?? 99;
  let s = 0;
  if (ch >= idx) s++;
  if (ch > 18 && ch - 18 >= idx) s++;
  if (ch > 36 && ch - 36 >= idx) s++;
  return s;
};
const stars = (n: number) => (n >= 2 ? "**" : n === 1 ? "*" : "");
const expandSide = (side: MatchSide[], teams: Team[]) => {
  const ids: string[] = [];
  for (const s of side) {
    if (s.type === "player") ids.push(s.id);
    else { const t = teams.find(tt=>tt.id===s.id); if (t) ids.push(...t.playerIds); }
  }
  return Array.from(new Set(ids));
};
const nameOfSide = (side: MatchSide[], players: Player[], teams: Team[]) =>
  expandSide(side, teams)
    .map((id) => players.find((p) => p.id === id)?.name ?? "—")
    .join(" & ");

const pluralPlayers = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} игрок`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} игрока`;
  return `${count} игроков`;
};

/* ---------- component ---------- */
type Props = {
  match: Match;
  course: Course;
  players: Player[];
  teams: Team[];
  onScore: (p:{ side:'A'|'B'; hole:number; playerId:string|null; gross:number|null; dash:boolean; }) => Promise<any>;
  refetch: () => Promise<void>;
  focusPlayerId?: string;
};

export default function MatchInputPage({
  match: rawMatch, course, players, teams, onScore, refetch, focusPlayerId
}: Props){
  const match = useMemo(()=>normalizeMatch(rawMatch), [rawMatch]);

  const aIds = expandSide(match.sideA, teams);
  const bIds = expandSide(match.sideB, teams);

  // singles — ВСЕГДА поигровочно; fourball — поигровочно, если >2 игроков на стороне
  const perPlayerMode =
    match.format === "singles" ||
    (match.format === "fourball" && (aIds.length > 2 || bIds.length > 2));

  // первая НЕЗАПОЛНЕННАЯ лунка (undefined — пусто; null — прочерк = заполнено)
  const firstUnfilledHole = useMemo(() => {
    for (let i=0;i<18;i++){
      if (perPlayerMode){
        const aEmpty = aIds.some(pid => {
          const val = (match.playerScoresA?.[pid] ?? [])[i];
          return val == null;
        });
        const bEmpty = bIds.some(pid => {
          const val = (match.playerScoresB?.[pid] ?? [])[i];
          return val == null;
        });
        if (aEmpty || bEmpty) return i+1;
      } else {
        const a = (match.scoresA || [])[i];
        const b = (match.scoresB || [])[i];
        if (a == null || b == null) return i+1;
      }
    }
    return 18;
  }, [
    perPlayerMode,
    aIds.join(','),
    bIds.join(','),
    match.playerScoresA,
    match.playerScoresB,
    match.scoresA,
    match.scoresB,
  ]);

  const [hole, setHole] = useState<number>(firstUnfilledHole);
  useEffect(()=>{ setHole(firstUnfilledHole); }, [firstUnfilledHole]);

  const aName = nameOfSide(match.sideA, players, teams);
  const bName = nameOfSide(match.sideB, players, teams);
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((p) => map.set(p.id, p));
    return map;
  }, [players]);
  const pars = useMemo(() => safePars(course), [course]);
  const sis = useMemo(() => safeSI(course), [course]);
  const par = pars[hole - 1];
  const si = sis[hole - 1];
  const allowance = match.format === "singles" ? ALLOW_SINGLES : ALLOW_FOURBALL;
  const sideNames: Record<'A' | 'B', string> = {
    A: aName || "Сторона A",
    B: bName || "Сторона B",
  };

  // черновик текущей лунки
  type Draft = {
    A: { team: number|null| -1; players: Record<string, number|null| -1> };
    B: { team: number|null| -1; players: Record<string, number|null| -1> };
  };
  const buildDraft = (h:number): Draft => {
    const i = h-1;
    const d: Draft = { A:{team: (match.scoresA||[])[i] ?? null, players: {}}, B:{team: (match.scoresB||[])[i] ?? null, players: {}} };
    aIds.forEach(pid => d.A.players[pid] = (match.playerScoresA?.[pid] ?? [])[i] ?? null);
    bIds.forEach(pid => d.B.players[pid] = (match.playerScoresB?.[pid] ?? [])[i] ?? null);
    return d;
  };
  const [draft, setDraft] = useState<Draft>(buildDraft(hole));
  useEffect(() => { setDraft(buildDraft(hole)); }, [hole, match, aIds.join(','), bIds.join(',')]);

  const updateTeam = (s: 'A' | 'B', v: number | null | -1) =>
    setDraft((prev) => ({ ...prev, [s]: { ...prev[s], team: v } }));

  const setPlayerValue = (s: 'A' | 'B', pid: string, v: number | null | -1) =>
    setDraft((prev) => ({
      ...prev,
      [s]: { ...prev[s], players: { ...prev[s].players, [pid]: v } },
    }));

  const [saving, setSaving] = useState(false);

  const strokeSummary = useMemo(() => {
    const list: { side: 'A' | 'B'; playerId: string; name: string; strokes: number }[] = [];
    const collect = (ids: string[], side: 'A' | 'B') => {
      ids.forEach((pid) => {
        const player = playerMap.get(pid);
        if (!player) return;
        const courseHcp = toCourseHcp(player.hcp, course);
        const playing = Math.round(courseHcp * allowance);
        const strokes = shotsOnHole(playing, hole - 1, sis);
        if (strokes > 0) {
          list.push({ side, playerId: pid, name: player.name, strokes });
        }
      });
    };
    collect(aIds, 'A');
    collect(bIds, 'B');
    return list;
  }, [aIds.join(','), bIds.join(','), allowance, course, hole, playerMap, sis]);

  // ——— сохранение текущей лунки
  const persistHole = async () => {
    const i = hole-1;
    const tasks: Promise<any>[] = [];

    const send = (side:'A'|'B', playerId:string|null, v:number|null| -1) => {
      const gross = v===-1 ? null : (v==null ? null : v);
      const dash  = v===-1;
      // ВАЖНО: всегда передаём playerId (строка | null), НИКОГДА undefined
      return onScore({ side, hole, playerId, gross, dash });
    };

    const sameValue = (a: number|null|undefined| -1, b: number|null|undefined| -1) => {
      const norm = (val: number|null|undefined| -1) => (val === undefined ? null : val);
      return norm(a) === norm(b);
    };

    if (perPlayerMode){
      for (const pid of aIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresA?.[pid] ?? [])[i];
        const curr = draft.A.players[pid];
        if (!sameValue(curr, prev)) tasks.push(send('A', pid, curr));
      }
      for (const pid of bIds) {
        if (focusPlayerId && pid !== focusPlayerId) continue;
        const prev = (match.playerScoresB?.[pid] ?? [])[i];
        const curr = draft.B.players[pid];
        if (!sameValue(curr, prev)) tasks.push(send('B', pid, curr));
      }
    } else {
      const prevA = (match.scoresA || [])[i];
      const prevB = (match.scoresB || [])[i];
      if (!sameValue(draft.A.team, prevA)) tasks.push(send('A', null, draft.A.team));
      if (!sameValue(draft.B.team, prevB)) tasks.push(send('B', null, draft.B.team));
    }

    setSaving(true);
    try {
      if (tasks.length) await Promise.all(tasks);
      await refetch(); // подтянуть сохранённые значения
    } finally {
      setSaving(false);
    }
  };

  const go = async (dir:-1|1) => {
    await persistHole();
    setHole(h => Math.max(1, Math.min(18, h + dir)));
  };

  const saveCurrentHole = async () => {
    await persistHole();
  };

  const isFirstHole = hole === 1;
  const isLastHole = hole === 18;

  // UI
  const renderPerPlayer = (s:'A'|'B') => {
    const ids = s==='A' ? aIds : bIds;
    if (!ids.length) return null;
    const rows = focusPlayerId && ids.includes(focusPlayerId) ? [focusPlayerId] : ids;
    const note = focusPlayerId && rows.length === 1 ? 'Индивидуальный ввод' : pluralPlayers(ids.length);
    return (
      <section key={s} className="score-side">
        <div className="score-side-header">
          <div className="score-side-title">{sideNames[s]}</div>
          <div className="score-side-note">{note}</div>
        </div>
        <div className="score-side-body">
          {rows.map((pid) => {
            const player = playerMap.get(pid);
            const courseHcp = toCourseHcp(player?.hcp, course);
            const playing = Math.round(courseHcp * allowance);
            const strokeCount = shotsOnHole(playing, hole - 1, sis);
            const hasStroke = strokeCount > 0;
            const v = draft[s].players[pid] ?? null;
            return (
              <div key={pid} className="score-player-row">
                <div className="score-player-info">
                  <div className="score-player-name">{player?.name ?? 'Игрок'}</div>
                  <div className="score-player-meta">
                    {playing !== 0 ? (
                      <span className="hcp-badge">Игр. HCP {playing}</span>
                    ) : null}
                    {hasStroke ? (
                      <span className={`stroke-badge${strokeCount >= 2 ? ' strong' : ''}`}>
                        +{strokeCount} {strokeCount === 1 ? 'удар' : 'удара'}
                      </span>
                    ) : null}
                    {hasStroke ? <span className="stroke-marker">{stars(strokeCount)}</span> : null}
                  </div>
                </div>
                <div className="score-player-controls">
                  <button
                    type="button"
                    onClick={() => setPlayerValue(s, pid, typeof v === 'number' && v > 1 ? v - 1 : 1)}
                    disabled={saving}
                  >
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    value={v === -1 ? '' : v ?? ''}
                    placeholder="-"
                    onChange={(e) => {
                      const t = e.target.value.trim();
                      if (t === '') { setPlayerValue(s, pid, null); return; }
                      const n = parseInt(t, 10);
                      if (!Number.isNaN(n)) setPlayerValue(s, pid, n);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPlayerValue(s, pid, typeof v === 'number' ? v + 1 : 1)}
                    disabled={saving}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={v === -1 ? 'dash-active' : undefined}
                    onClick={() => setPlayerValue(s, pid, -1)}
                    title="Прочерк"
                    disabled={saving}
                  >
                    —
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderTeam = () => (
    (['A', 'B'] as const).map((s) => {
      const v = draft[s].team;
      return (
        <section key={s} className="score-side">
          <div className="score-side-header">
            <div className="score-side-title">{sideNames[s]}</div>
            <div className="score-side-note">Командный gross</div>
          </div>
          <div className="score-side-body">
            <div className="score-player-row">
              <div className="score-player-info">
                <div className="score-player-name">Счёт лунки</div>
                <div className="score-player-meta">
                  <span>Введите общий gross команды.</span>
                </div>
              </div>
              <div className="score-player-controls">
                <button
                  type="button"
                  onClick={() => updateTeam(s, typeof v === 'number' && v > 1 ? v - 1 : 1)}
                  disabled={saving}
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  value={v === -1 ? '' : v ?? ''}
                  placeholder="-"
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    if (t === '') { updateTeam(s, null); return; }
                    const n = parseInt(t, 10);
                    if (!Number.isNaN(n)) updateTeam(s, n);
                  }}
                />
                <button
                  type="button"
                  onClick={() => updateTeam(s, typeof v === 'number' ? v + 1 : 1)}
                  disabled={saving}
                >
                  +
                </button>
                <button
                  type="button"
                  className={v === -1 ? 'dash-active' : undefined}
                  onClick={() => updateTeam(s, -1)}
                  title="Прочерк"
                  disabled={saving}
                >
                  —
                </button>
              </div>
            </div>
          </div>
        </section>
      );
    })
  );

  return (
    <div className="score-input-page">
      <div className="hole-header">
        <div className="hole-header-top">
          <div className="hole-chip">{match.name}</div>
          <div className="hole-course">{course.name}</div>
        </div>
        <div className="hole-meta">
          <div className="hole-count">Лунка {hole} из 18</div>
          <div className="hole-info">
            <span>Par {par}</span>
            <span>SI {si ?? '—'}</span>
          </div>
        </div>
      </div>

      {strokeSummary.length ? (
        <div className="stroke-summary-card">
          <div className="stroke-summary-title">Фора на этой лунке</div>
          <ul className="stroke-summary-list">
            {strokeSummary.map((item) => (
              <li key={`${item.side}-${item.playerId}`}>
                <strong>{item.name}</strong>
                <span className="stroke-summary-side">{sideNames[item.side]}</span>
                <span className="stroke-summary-value">+{item.strokes}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`score-card ${perPlayerMode ? 'per-player' : 'team-mode'}`}>
        {perPlayerMode ? (
          <>
            {renderPerPlayer('A')}
            {renderPerPlayer('B')}
          </>
        ) : (
          renderTeam()
        )}
      </div>

      <div className="score-input-nav">
        <button type="button" onClick={() => go(-1)} disabled={isFirstHole || saving}>
          Назад
        </button>
        <button type="button" onClick={saveCurrentHole} disabled={saving}>
          Сохранить
        </button>
        <button type="button" className="primary" onClick={() => go(1)} disabled={isLastHole || saving}>
          Далее
        </button>
      </div>

      <div className="score-hint">
        «—» — прочерк (в бэстболле игрок не учитывается, в сингле — лунка проиграна). Значения сохраняются кнопками ниже.
      </div>
    </div>
  );
}
