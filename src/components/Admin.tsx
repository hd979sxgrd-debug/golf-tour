import React, { useEffect, useMemo, useState } from 'react';
import { Course, Match, MatchFormat, MatchSide, Player, Team } from '../types';
import { uid, flattenPlayerIds, matchProgress } from '../utils';
import { QRCodeCanvas } from 'qrcode.react';

type MatchesProps = {
  isAdmin: boolean;
  viewMode: 'edit' | 'display';
  players: Player[];
  teams: Team[];                // { id, name, playerIds[] }
  courses: Course[];
  matches: Match[];
  setMatches: (m: Match[]) => void;

  // серверные действия (через Netlify Functions / api.ts)
  onCreate: (payload: {
    id: string; name: string; day: string; format: MatchFormat; courseId: string;
    sideATeamId?: string; sideBTeamId?: string; sideAPlayerIds: string[]; sideBPlayerIds: string[];
  }) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
};

const Admin = {
  /* -------------------- Раздел "Игроки" (read-only из БД) -------------------- */
  Players: function Players({ players }: { players: Player[] }) {
    return (
      <div className="card">
        <div className="header"><div className="title">Игроки</div></div>
        <div className="content">
          {players.length === 0 ? (
            <div className="muted">Пока нет игроков (импортируйте в БД).</div>
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {players.map(p => (
                <div key={p.id} className="row card" style={{ padding: 8, gap: 8 }}>
                  <div style={{ flex: 1 }}>{p.name}</div>
                  <div className="muted">WHS: {p.hcp ?? '-'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },

  /* -------------------- Раздел "Команды" (read-only из БД) -------------------- */
  Teams: function Teams({ teams, players }: { teams: Team[]; players: Player[] }) {
    return (
      <div className="card">
        <div className="header"><div className="title">Команды</div></div>
        <div className="content">
          {teams.length === 0 ? (
            <div className="muted">Команд нет.</div>
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {teams.map(t => (
                <div key={t.id} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                    <div className="title" style={{ fontSize: 16 }}>{t.name}</div>
                    <div className="muted">({t.playerIds?.length ?? 0} игроков)</div>
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {t.playerIds?.map(id => players.find(p => p.id === id)?.name ?? '?').join(', ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },

  /* -------------------- Раздел "Поля" (read-only из БД) -------------------- */
  Courses: function Courses({ courses }: { courses: Course[] }) {
    return (
      <div className="card">
        <div className="header"><div className="title">Поля</div></div>
        <div className="content grid">
          {courses.length === 0 ? (
            <div className="muted">Полей нет.</div>
          ) : courses.map(course => (
            <div key={course.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <div className="title" style={{ fontSize: 16 }}>{course.name}</div>
                <div className="muted">CR {course.cr ?? '-'} / Slope {course.slope ?? '-'}</div>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>Par (1–18):</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
                {(course.pars ?? []).map((p, i) => (
                  <div key={i} className="chip" style={{ justifyContent: 'center' }}>{p}</div>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>SI (1–18):</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
                {(course.strokeIndex ?? []).map((s, i) => (
                  <div key={i} className="chip" style={{ justifyContent: 'center' }}>{s}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },

  /* -------------------- Раздел "Матчи" (создание/удаление + QR) -------------------- */
  Matches: function Matches(props: MatchesProps) {
    const { isAdmin, viewMode, players, teams, courses, matches, setMatches, onCreate, onDelete } = props;

    const [name, setName] = useState('');
    const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
    const [format, setFormat] = useState<MatchFormat>('singles');
    const [day, setDay] = useState('Day 1');
    const [teamA, setTeamA] = useState('');
    const [teamB, setTeamB] = useState('');
    const [sideA, setSideA] = useState<string[]>([]);
    const [sideB, setSideB] = useState<string[]>([]);
    const [qr, setQr] = useState<{ open: boolean; title: string; url: string }>({ open: false, title: '', url: '' });

    useEffect(() => { if (!courseId && courses[0]) setCourseId(courses[0].id); }, [courses]);
    const singleSelect = format === 'singles';
    const teamAPlayers = useMemo(() => teams.find(t => t.id === teamA)?.playerIds ?? [], [teamA, teams]);
    const teamBPlayers = useMemo(() => teams.find(t => t.id === teamB)?.playerIds ?? [], [teamB, teams]);

    const create = async () => {
      if (!isAdmin) return;
      if (!name.trim() || !courseId || !teamA || !teamB || sideA.length === 0 || sideB.length === 0) return;
      const payload = {
        id: uid('m'),
        name: name.trim(),
        day,
        format,
        courseId,
        sideATeamId: teamA,
        sideBTeamId: teamB,
        sideAPlayerIds: sideA,
        sideBPlayerIds: sideB
      };
      await onCreate(payload);
      // Оптимистичное обновление в списке
      const optimistic: Match = {
        id: payload.id, name: payload.name, day: payload.day, format: payload.format, courseId: payload.courseId,
        sideATeamId: payload.sideATeamId, sideBTeamId: payload.sideBTeamId,
        sideA: payload.sideAPlayerIds.map(id => ({ type: 'player', id })),
        sideB: payload.sideBPlayerIds.map(id => ({ type: 'player', id })),
        scoresA: Array(18).fill(null), scoresB: Array(18).fill(null)
      };
      setMatches([optimistic, ...matches]);
      setName(''); setTeamA(''); setTeamB(''); setSideA([]); setSideB([]);
    };

    const openQr = (title: string, hashUrl: string) => {
      const base = window.location.origin + window.location.pathname;
      setQr({ open: true, title, url: `${base}${hashUrl}` });
    };

    return (
      <div className="grid" style={{ gap: 12 }}>
        {isAdmin && viewMode === 'edit' && (
          <div className="card">
            <div className="header"><div className="title">Создать матч</div></div>
            <div className="content grid" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <input className="input" placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
                <input className="input" placeholder="День (например: Day 3)" value={day} onChange={e => setDay(e.target.value)} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <select className="select" value={format} onChange={e => { setFormat(e.target.value as MatchFormat); setSideA([]); setSideB([]); }}>
                  <option value="singles">Singles</option>
                  <option value="fourball">Best Ball (Fourball)</option>
                </select>
                <select className="select" value={courseId} onChange={e => setCourseId(e.target.value)}>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <select className="select" value={teamA} onChange={e => { setTeamA(e.target.value); setSideA([]); }}>
                  <option value="">Команда A</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="select" value={teamB} onChange={e => { setTeamB(e.target.value); setSideB([]); }}>
                  <option value="">Команда B</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn primary" onClick={create}>Добавить матч</button>
              </div>

              {/* игроки по одному в строку */}
              <div className="grid" style={{ gap: 12 }}>
                <SidePicker
                  label="Сторона A"
                  ids={sideA}
                  setIds={ids => setSideA(singleSelect ? ids.slice(-1) : ids)}
                  players={players.filter(p => teamAPlayers.includes(p.id))}
                  singleSelect={singleSelect}
                  name="sideA"
                />
                <SidePicker
                  label="Сторона B"
                  ids={sideB}
                  setIds={ids => setSideB(singleSelect ? ids.slice(-1) : ids)}
                  players={players.filter(p => teamBPlayers.includes(p.id))}
                  singleSelect={singleSelect}
                  name="sideB"
                />
              </div>
            </div>
          </div>
        )}

        {matches.map(m => {
          const course = courses.find(c => c.id === m.courseId);
          const playerIdsA = flattenPlayerIds(m.sideA ?? [], teams);
          const playerIdsB = flattenPlayerIds(m.sideB ?? [], teams);
          const needsPersonal = (m.format === 'fourball') && (playerIdsA.length > 2 || playerIdsB.length > 2);

          // Статус LIVE/FINAL (уточняется на странице матча по факту заполнения)
          const prog = matchProgress(
            { ...m, scoresA: m.scoresA ?? Array(18).fill(null), scoresB: m.scoresB ?? Array(18).fill(null) } as any,
            players, teams, course ?? { id: '', name: '', pars: [], strokeIndex: [] } as any
          );

          return (
            <div key={m.id} className="card">
              <div className="header row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="title">
                  {m.name} — <span className="muted">{course?.name ?? '-'}</span> <span className="chip">[{m.format}]</span>
                </div>
                {prog.finished ? (
                  <span className="chip" style={{ background: '#111827', color: '#fff' }}>FINAL RESULT</span>
                ) : prog.started ? (
                  <span className="chip" style={{ background: '#dc2626', color: '#fff' }}>LIVE!</span>
                ) : null}
              </div>

              <div className="content">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <a className="btn" href={`#/match/${m.id}`}>Ввод (общий)</a>
                  <button className="btn" onClick={() => openQr('QR — Ввод (общий)', `#/match/${m.id}`)}>QR</button>
                  <a className="btn" href={`#/view/${m.id}`}>Просмотр</a>
                  <button className="btn danger" onClick={async () => { await onDelete(m.id); }}>Удалить матч</button>
                </div>

                {needsPersonal && (
                  <div style={{ marginTop: 8 }}>
                    <div className="muted">Персональные ссылки (каждый вводит сам):</div>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 }}>
                      {playerIdsA.concat(playerIdsB).map(pid => {
                        const p = players.find(x => x.id === pid);
                        const hash = `#/match/${m.id}/player/${pid}`;
                        return (
                          <div key={pid} className="row" style={{ gap: 8 }}>
                            <a className="btn" href={hash} style={{ flex: 1 }}>{p?.name ?? pid}</a>
                            <button className="btn" onClick={() => openQr(`QR — ${p?.name ?? pid}`, hash)}>QR</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <QrModal open={qr.open} onClose={() => setQr({ ...qr, open: false })} title={qr.title} url={qr.url} />
      </div>
    );
  }
};

export default Admin;

/* -------------------- Вспомогательные компоненты -------------------- */

function SidePicker({
  label, ids, setIds, players, singleSelect, name
}: { label: string; ids: string[]; setIds: (ids: string[]) => void; players: Player[]; singleSelect: boolean; name: string; }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="title" style={{ fontSize: 14, marginBottom: 6 }}>{label}</div>
      <div className="grid" style={{ gap: 6 }}>
        {players.map(p => (
          <label key={p.id} className="row" style={{ cursor: 'pointer', alignItems: 'center', gap: 8 }}>
            {singleSelect ? (
              <input type="radio" name={name} checked={ids.includes(p.id)} onChange={() => setIds([p.id])} />
            ) : (
              <input type="checkbox" checked={ids.includes(p.id)} onChange={e => setIds(e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id))} />
            )}
            <div style={{ flex: 1 }}>{p.name}</div>
            <div className="muted">({p.hcp ?? '-'})</div>
          </label>
        ))}
        {players.length === 0 && <div className="muted">Выберите команду выше</div>}
      </div>
    </div>
  );
}

function QrModal({ open, onClose, title, url }: { open: boolean; onClose: () => void; title: string; url: string; }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50
      }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: 16, maxWidth: 420, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="header" style={{ justifyContent: 'center' }}><div className="title">{title}</div></div>
        <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <QRCodeCanvas value={url} size={260} includeMargin />
          <div className="muted" style={{ wordBreak: 'break-all' }}>{url}</div>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
