import React, { useMemo, useState } from 'react';
import { Course, Match, Player, Team } from '../types';
import {
  calcMatchPlayStatus,
  strokeStarsForPlayer,
  flattenPlayerIds,
  sideNetOnHole,
  outIn
} from '../utils';

type Props = {
  match: Match & {
    // для детальной страницы матча (ответ функции /match)
    playerScoresA?: Record<string, (number | null)[]>;
    playerScoresB?: Record<string, (number | null)[]>;
    scoresA?: (number | null)[];
    scoresB?: (number | null)[];
  };
  course: Course;
  players: Player[];
  teams: Team[];
  readOnly: boolean;
  focusPlayerId?: string; // персональная ссылка: показываем ввод только для своего игрока (сторона A)
  onScore?: (p: { side: 'A' | 'B'; hole: number; playerId?: string | null; gross?: number | null; dash?: boolean }) => Promise<any>;
};

export default function ScoringPage({ match, course, players, teams, readOnly, focusPlayerId, onScore }: Props) {
  const [hole, setHole] = useState(1);
  const goto = (h: number) => setHole(Math.min(18, Math.max(1, h)));
  const holeIdx = hole - 1;
  const par = course.pars?.[holeIdx] ?? 4;
  const si = course.strokeIndex?.[holeIdx];

  const sideAIds = useMemo(() => flattenPlayerIds(match.sideA ?? [], teams), [match, teams]);
  const sideBIds = useMemo(() => flattenPlayerIds(match.sideB ?? [], teams), [match, teams]);
  const isSingles = match.format === 'singles';
  const showOnlyAForPersonal = !!focusPlayerId;

  const mps = calcMatchPlayStatus(match as any, players, teams, course);
  const nine = outIn(mps.perHole);

  const starFor = (pid: string, hIdx: number) => strokeStarsForPlayer(match.format, players.find(p => p.id === pid)!, course, hIdx);

  const setGross = (side: 'A' | 'B', holeIdx: number, v: number | null, playerId?: string | null, dash?: boolean) => {
    if (!onScore) return;
    onScore({ side, hole: holeIdx + 1, playerId: playerId ?? null, gross: v, dash: !!dash }).catch(console.error);
  };

  // best ball: для вью подсвечиваем игрока, чей нетто использован
  const bestMetaA = sideNetOnHole({
    format: match.format, holeIdx,
    side: match.sideA ?? [],
    grossRow: match.scoresA ?? [],
    playerScores: match.playerScoresA ?? {},
    players, teams, course
  });
  const bestMetaB = sideNetOnHole({
    format: match.format, holeIdx,
    side: match.sideB ?? [],
    grossRow: match.scoresB ?? [],
    playerScores: match.playerScoresB ?? {},
    players, teams, course
  });
  const usedPidA = (bestMetaA.meta as any).usedPid as string | undefined;
  const usedPidB = (bestMetaB.meta as any).usedPid as string | undefined;

  return (
    <div className="min-h-screen p-4 bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <a href="#/public" className="underline">← Публичная</a>
          <div className="flex items-center gap-2 text-sm">
            <span className="chip">Front: <b>{nine.out}</b></span>
            <span className="chip">Back: <b>{nine.in}</b></span>
            <span className="chip">Total: <b>{nine.tot}</b></span>
            <span className="chip">Матч-плей: <b>{mps.status}</b></span>
          </div>
        </div>

        <div className="card">
          <div className="header">
            <div className="title">
              {match.name} — <span className="muted">{course.name}</span> <span className="chip">[{match.format}]</span>
            </div>
          </div>

          <div className="content">
            {/* Навигация по лункам */}
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <button className="btn" onClick={() => goto(hole - 1)} disabled={hole === 1}>Назад</button>
              <div className="text-center">
                <div className="muted" style={{ fontSize: 12 }}>Лунка</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{hole}</div>
                <div className="muted" style={{ fontSize: 12 }}>Par {par} • SI {si ?? '-'}</div>
              </div>
              <button className="btn" onClick={() => goto(hole + 1)} disabled={hole === 18}>Далее</button>
            </div>

            {/* Сторона A */}
            {!showOnlyAForPersonal && (
              <SidePanel
                label="Сторона A"
                side="A"
                holeIdx={holeIdx}
                par={par}
                isSingles={isSingles}
                sideIds={sideAIds}
                match={match}
                players={players}
                bestUsedPid={usedPidA}
                readOnly={readOnly}
                starFor={starFor}
                onSet={(v, pid, dash) => setGross('A', holeIdx, v, pid, dash)}
              />
            )}

            {/* Сторона B (в персональной ссылке скрываем) */}
            {!focusPlayerId && (
              <SidePanel
                label="Сторона B"
                side="B"
                holeIdx={holeIdx}
                par={par}
                isSingles={isSingles}
                sideIds={sideBIds}
                match={match}
                players={players}
                bestUsedPid={usedPidB}
                readOnly={readOnly}
                starFor={starFor}
                onSet={(v, pid, dash) => setGross('B', holeIdx, v, pid, dash)}
              />
            )}

            {/* Персональная ссылка: ввод только для одного игрока на стороне A */}
            {focusPlayerId && (
              <PersonalInput
                playerId={focusPlayerId}
                side="A"
                holeIdx={holeIdx}
                par={par}
                match={match}
                players={players}
                readOnly={readOnly}
                starFor={starFor}
                onSet={(v, dash) => setGross('A', holeIdx, v, focusPlayerId, dash)}
              />
            )}

            {/* Таблица по всем лункам */}
            <AllHolesTable
              match={match}
              course={course}
              players={players}
              teams={teams}
              focusPlayerId={focusPlayerId}
              readOnly={readOnly}
              onSet={(side, idx, pid, v, dash) => setGross(side, idx, v, pid, dash)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Вспомогательные компоненты ================= */

function SidePanel(props: {
  label: string;
  side: 'A' | 'B';
  holeIdx: number;
  par: number;
  isSingles: boolean;
  sideIds: string[];
  match: Match & { playerScoresA?: Record<string, (number | null)[]>; playerScoresB?: Record<string, (number | null)[]>; scoresA?: (number | null)[]; scoresB?: (number | null)[]; };
  players: Player[];
  bestUsedPid?: string;
  readOnly: boolean;
  starFor: (pid: string, holeIdx: number) => string;
  onSet: (v: number | null, pid?: string | null, dash?: boolean) => void;
}) {
  const { label, side, holeIdx, par, isSingles, sideIds, match, players, bestUsedPid, readOnly, starFor, onSet } = props;
  const ids = isSingles ? sideIds.slice(0, 1) : sideIds;

  return (
    <div className="p-3 rounded-xl border" style={{ marginBottom: 12 }}>
      <div className="text-sm font-medium mb-2">{label}</div>

      <div className="grid" style={{ gap: 8 }}>
        {ids.map(pid => {
          const p = players.find(x => x.id === pid);
          const scoresMap = side === 'A' ? (match.playerScoresA ?? {}) : (match.playerScoresB ?? {});
          const val = scoresMap[pid]?.[holeIdx] ?? null;
          const isDash = val === -1;
          const asInput = (v: string) => {
            if (readOnly) return;
            if (v === '') onSet(null, pid, false);
            else {
              const num = parseInt(v, 10);
              if (!Number.isNaN(num)) onSet(num, pid, false);
            }
          };
          const setDash = () => !readOnly && onSet(null, pid, true);
          const star = starFor(pid, holeIdx);

          return (
            <div key={pid} className="row" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 140 }}>{p?.name ?? pid} <span className="muted">{star}</span></div>
              <input
                className="input"
                inputMode="numeric"
                style={{ width: 100, textAlign: 'center' }}
                value={isDash ? '—' : (val ?? '')}
                onChange={e => asInput(e.target.value.replace(/[^\d]/g, ''))}
                disabled={readOnly}
                placeholder={`${par}`}
              />
              <button className="btn" onClick={setDash} disabled={readOnly}>Прочерк</button>
              {bestUsedPid && bestUsedPid === pid && <span className="chip" title="Лучший нетто на лунке">best</span>}
            </div>
          );
        })}

        {/* Командный ввод (если нет поигровочного) */}
        {ids.length === 0 && (
          <div className="row" style={{ gap: 8 }}>
            <div className="muted">Командный gross</div>
            <input
              className="input"
              inputMode="numeric"
              style={{ width: 100, textAlign: 'center' }}
              value={(side === 'A' ? match.scoresA?.[holeIdx] : match.scoresB?.[holeIdx]) ?? ''}
              onChange={e => {
                if (readOnly) return;
                const v = e.target.value;
                const num = v === '' ? null : parseInt(v, 10);
                props.onSet(num, null, false);
              }}
              disabled={readOnly}
              placeholder={`${par}`}
            />
            <button className="btn" onClick={() => props.onSet(null, null, true)} disabled={readOnly}>Прочерк</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalInput(props: {
  playerId: string; side: 'A' | 'B'; holeIdx: number; par: number;
  match: Match & { playerScoresA?: Record<string, (number | null)[]>; };
  players: Player[]; readOnly: boolean;
  starFor: (pid: string, holeIdx: number) => string;
  onSet: (v: number | null, dash?: boolean) => void;
}) {
  const { playerId, holeIdx, par, match, players, readOnly, starFor, onSet } = props;
  const p = players.find(x => x.id === playerId);
  const val = (match.playerScoresA?.[playerId]?.[holeIdx] ?? null);
  const isDash = val === -1;
  const star = starFor(playerId, holeIdx);

  return (
    <div className="p-3 rounded-xl border" style={{ marginBottom: 12 }}>
      <div className="text-sm font-medium mb-2">Ваш ввод</div>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <div style={{ minWidth: 140 }}>{p?.name ?? playerId} <span className="muted">{star}</span></div>
        <input
          className="input"
          inputMode="numeric"
          style={{ width: 120, textAlign: 'center' }}
          value={isDash ? '—' : (val ?? '')}
          onChange={e => {
            if (readOnly) return;
            const v = e.target.value.replace(/[^\d]/g, '');
            if (v === '') onSet(null, false);
            else {
              const num = parseInt(v, 10);
              if (!Number.isNaN(num)) onSet(num, false);
            }
          }}
          disabled={readOnly}
          placeholder={`${par}`}
        />
        <button className="btn" onClick={() => !readOnly && onSet(null, true)} disabled={readOnly}>Прочерк</button>
      </div>
    </div>
  );
}

function AllHolesTable(props: {
  match: Match & { playerScoresA?: Record<string, (number | null)[]>; playerScoresB?: Record<string, (number | null)[]>; scoresA?: (number | null)[]; scoresB?: (number | null)[]; };
  course: Course; players: Player[]; teams: Team[];
  focusPlayerId?: string; readOnly: boolean;
  onSet: (side: 'A' | 'B', holeIdx: number, pid: string | null, v: number | null, dash: boolean) => void;
}) {
  const { match, course, players, teams, focusPlayerId, readOnly, onSet } = props;
  const sideAIds = flattenPlayerIds(match.sideA ?? [], teams);
  const sideBIds = flattenPlayerIds(match.sideB ?? [], teams);
  const isSingles = match.format === 'singles';

  const rowsA = isSingles ? sideAIds.slice(0, 1) : sideAIds;
  const rowsB = isSingles ? sideBIds.slice(0, 1) : sideBIds;

  const renderRow = (label: string, side: 'A' | 'B', pid: string | null) => {
    const scoresMap = side === 'A' ? (match.playerScoresA ?? {}) : (match.playerScoresB ?? {});
    const isPersonal = !!pid;
    return (
      <tr key={`${side}-${pid ?? 'team'}`} className="border-t">
        <td className="p-2 text-sm">{label}</td>
        {Array.from({ length: 18 }).map((_, i) => {
          const val = isPersonal ? (scoresMap[pid!]?.[i] ?? null) : (side === 'A' ? match.scoresA?.[i] : match.scoresB?.[i]);
          const isDash = val === -1;
          const display = isDash ? '—' : (val ?? '');
          const p = pid ? players.find(x => x.id === pid) : null;
          const stars = pid && p ? strokeStarsForPlayer(match.format, p, course, i) : '';
          return (
            <td key={i} className="p-1">
              {readOnly ? (
                <div className="text-center text-sm">{display} {stars && <span className="muted">{stars}</span>}</div>
              ) : (
                <input
                  className="input"
                  inputMode="numeric"
                  style={{ width: 56, textAlign: 'center' }}
                  value={display}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '') onSet(side, i, pid ?? null, null, false);
                    else if (raw === '—') onSet(side, i, pid ?? null, null, true);
                    else {
                      const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
                      if (!Number.isNaN(num)) onSet(side, i, pid ?? null, num, false);
                    }
                  }}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  // персональная ссылка — показываем только строку конкретного игрока (сторона A)
  const rows: JSX.Element[] = [];
  if (focusPlayerId) {
    rows.push(renderRow('A: ' + (players.find(p => p.id === focusPlayerId)?.name ?? focusPlayerId), 'A', focusPlayerId));
  } else {
    rows.push(...rowsA.map(pid => renderRow('A: ' + (players.find(p => p.id === pid)?.name ?? pid), 'A', pid)));
    rows.push(...rowsB.map(pid => renderRow('B: ' + (players.find(p => p.id === pid)?.name ?? pid), 'B', pid)));
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left p-2">Игрок</th>
            {Array.from({ length: 18 }).map((_, i) => <th key={i} className="p-2 text-center">{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div className="muted" style={{ marginTop: 6 }}>
        Звёздочки возле имени: * — один строук, ** — два строука на лунке (учитываются при расчёте нетто).
      </div>
    </div>
  );
}
