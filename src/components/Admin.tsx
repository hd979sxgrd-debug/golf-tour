import React, { useEffect, useMemo, useState } from 'react';
import { Course, Match, MatchFormat, Player, Team } from '../types';
import { uid, flattenPlayerIds, matchProgress } from '../utils';
import { QRCodeCanvas } from 'qrcode.react';
import {
  apiCreateMatch,
  apiDeleteMatch,
  apiUpsertPlayer,
  apiUpsertTeam,
  apiUpsertCourse,
  apiBootstrap,
} from '../api';

/** Вкладка "Игроки" — CRUD + импорт */
function PlayersTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [hcp, setHcp] = useState<string>('');
  const [importJson, setImportJson] = useState('');

  const reload = async () => {
    const data = await apiBootstrap();
    setPlayers(data.players);
  };
  useEffect(() => { reload().catch(console.error); }, []);

  const add = async () => {
    if (!name.trim()) return;
    await apiUpsertPlayer({ id: uid('p'), name: name.trim(), hcp: hcp ? parseFloat(hcp) : undefined });
    setName(''); setHcp('');
    reload();
  };

  const onEdit = async (p: Player, patch: Partial<Player>) => {
    await apiUpsertPlayer({ ...p, ...patch });
    reload();
  };

  const doImport = async () => {
    try {
      const data = JSON.parse(importJson || '{}');
      const list: Player[] = Array.isArray(data.players) ? data.players : [];
      for (const it of list) {
        await apiUpsertPlayer({ id: it.id || uid('p'), name: it.name, hcp: it.hcp });
      }
      setImportJson('');
      await reload();
      alert('Импорт игроков завершён');
    } catch (e: any) {
      alert('Ошибка JSON: ' + e.message);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="header"><div className="title">Добавить игрока</div></div>
        <div className="content row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Имя" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" placeholder="WHS (напр. 15.3)" value={hcp} onChange={e=>setHcp(e.target.value)} />
          <button className="btn primary" onClick={add}>Добавить</button>
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Игроки</div></div>
        <div className="content grid" style={{ gap: 8 }}>
          {players.length === 0 ? <div className="muted">Пока нет игроков</div> : players.map(p => (
            <div key={p.id} className="row card" style={{ padding: 8, gap: 8, alignItems: 'center' }}>
              <input className="input" value={p.name}
                onChange={e=>onEdit(p, { name: e.target.value })} />
              <input className="input" style={{ width: 120 }} value={p.hcp ?? ''} placeholder="WHS"
                onChange={e=>{
                  const v = e.target.value.trim();
                  onEdit(p, { hcp: v === '' ? undefined : Number(v) });
                }}/>
              <span className="muted" title={p.id} style={{ fontSize: 12 }}>id: {p.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Импорт JSON (только players)</div></div>
        <div className="content">
          <textarea className="input" style={{ minHeight: 120 }} placeholder='{"players":[{"name":"Alice","hcp":12.3}]}' value={importJson} onChange={e=>setImportJson(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={doImport}>Импорт JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Вкладка "Команды" — CRUD + импорт */
function TeamsTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [importJson, setImportJson] = useState('');

  const reload = async () => {
    const data = await apiBootstrap();
    setPlayers(data.players);
    setTeams(data.teams);
  };
  useEffect(() => { reload().catch(console.error); }, []);

  const add = async () => {
    if (!name.trim()) return;
    await apiUpsertTeam({ id: uid('t'), name: name.trim(), playerIds: selected });
    setName(''); setSelected([]);
    reload();
  };

  const onEdit = async (t: Team, patch: Partial<Team>) => {
    await apiUpsertTeam({ ...t, ...patch });
    reload();
  };

  const doImport = async () => {
    try {
      const data = JSON.parse(importJson || '{}');
      const list: Team[] = Array.isArray(data.teams) ? data.teams : [];
      for (const it of list) {
        await apiUpsertTeam({ id: it.id || uid('t'), name: it.name, playerIds: it.playerIds || [] });
      }
      setImportJson('');
      await reload();
      alert('Импорт команд завершён');
    } catch (e: any) {
      alert('Ошибка JSON: ' + e.message);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="header"><div className="title">Создать команду</div></div>
        <div className="content grid" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Название команды" value={name} onChange={e=>setName(e.target.value)} />
            <button className="btn primary" onClick={add}>Добавить</button>
          </div>
          <div className="grid" style={{ gap: 6 }}>
            {players.map(p => (
              <label key={p.id} className="row" style={{ alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={e=>{
                  setSelected(prev => e.target.checked ? [...prev, p.id] : prev.filter(x=>x!==p.id));
                }}/>
                <div style={{ flex: 1 }}>{p.name}</div>
                <div className="muted">({p.hcp ?? '-'})</div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Команды</div></div>
        <div className="content grid" style={{ gap: 8 }}>
          {teams.length === 0 ? <div className="muted">Команд нет</div> : teams.map(t => (
            <div key={t.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <input className="input" value={t.name} onChange={e=>onEdit(t, { name: e.target.value })} />
                <span className="muted" title={t.id} style={{ fontSize: 12 }}>id: {t.id}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                {t.playerIds.map(pid => players.find(p=>p.id===pid)?.name ?? pid).join(', ') || '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Импорт JSON (только teams)</div></div>
        <div className="content">
          <textarea className="input" style={{ minHeight: 120 }} placeholder='{"teams":[{"name":"Team A","playerIds":["p1","p2"]}]}' value={importJson} onChange={e=>setImportJson(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={doImport}>Импорт JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Вкладка "Поля" — компактный редактор + импорт */
function CoursesTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<Course>(() => ({
    id: uid('course'),
    name: '',
    cr: null,
    slope: null,
    pars: Array(18).fill(4),
    strokeIndex: Array(18).fill(1),
  }) as Course);
  const [importJson, setImportJson] = useState('');

  const reload = async () => {
    const data = await apiBootstrap();
    setCourses(data.courses);
  };
  useEffect(() => { reload().catch(console.error); }, []);

  const updatePar = (i: number, v: number) => {
    const pars = [...(form.pars || [])]; pars[i] = v;
    setForm({ ...form, pars });
  };
  const updateSI = (i: number, v: number) => {
    const si = [...(form.strokeIndex || [])]; si[i] = v;
    setForm({ ...form, strokeIndex: si });
  };

  const add = async () => {
    if (!form.name.trim()) return;
    await apiUpsertCourse(form);
    setForm({
      id: uid('course'),
      name: '',
      cr: null,
      slope: null,
      pars: Array(18).fill(4),
      strokeIndex: Array(18).fill(1),
    } as Course);
    reload();
  };

  const onEdit = async (c: Course, patch: Partial<Course>) => {
    await apiUpsertCourse({ ...c, ...patch });
    reload();
  };

  const doImport = async () => {
    try {
      const data = JSON.parse(importJson || '{}');
      const list: Course[] = Array.isArray(data.courses) ? data.courses : [];
      for (const it of list) {
        await apiUpsertCourse({
          id: it.id || uid('course'),
          name: it.name,
          cr: it.cr ?? null,
          slope: it.slope ?? null,
          pars: it.pars,
          strokeIndex: it.strokeIndex,
        });
      }
      setImportJson('');
      await reload();
      alert('Импорт полей завершён');
    } catch (e: any) {
      alert('Ошибка JSON: ' + e.message);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="header"><div className="title">Добавить поле</div></div>
        <div className="content grid" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Название" value={form.name} onChange={e=>setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="CR" value={form.cr ?? ''} onChange={e=>setForm({ ...form, cr: e.target.value === '' ? null : Number(e.target.value) })} />
            <input className="input" placeholder="Slope" value={form.slope ?? ''} onChange={e=>setForm({ ...form, slope: e.target.value === '' ? null : Number(e.target.value) })} />
            <button className="btn primary" onClick={add}>Добавить</button>
          </div>

          <div>
            <div className="muted">Par (1–18)</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
              {Array.from({ length: 18 }).map((_, i) => (
                <input key={i} className="input" inputMode="numeric" value={form.pars?.[i] ?? ''} onChange={e=>updatePar(i, Number(e.target.value || 0))} />
              ))}
            </div>
          </div>

          <div>
            <div className="muted">Stroke Index (1–18)</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
              {Array.from({ length: 18 }).map((_, i) => (
                <input key={i} className="input" inputMode="numeric" value={form.strokeIndex?.[i] ?? ''} onChange={e=>updateSI(i, Number(e.target.value || 0))} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Поля</div></div>
        <div className="content grid" style={{ gap: 8 }}>
          {courses.length === 0 ? <div className="muted">Полей нет</div> : courses.map(c => (
            <div key={c.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input className="input" value={c.name} onChange={e=>onEdit(c, { name: e.target.value })} />
                <input className="input" style={{ width: 120 }} placeholder="CR" value={c.cr ?? ''} onChange={e=>onEdit(c, { cr: e.target.value === '' ? null : Number(e.target.value) })} />
                <input className="input" style={{ width: 120 }} placeholder="Slope" value={c.slope ?? ''} onChange={e=>onEdit(c, { slope: e.target.value === '' ? null : Number(e.target.value) })} />
                <span className="muted" title={c.id} style={{ fontSize: 12 }}>id: {c.id}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>Par:</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
                {(c.pars || []).map((p, i) => <div key={i} className="chip" style={{ justifyContent: 'center' }}>{p}</div>)}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>SI:</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(9,minmax(0,1fr))', gap: 6 }}>
                {(c.strokeIndex || []).map((s, i) => <div key={i} className="chip" style={{ justifyContent: 'center' }}>{s}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="header"><div className="title">Импорт JSON (только courses)</div></div>
        <div className="content">
          <textarea className="input" style={{ minHeight: 120 }} placeholder='{"courses":[{"name":"Carya","cr":71.4,"slope":129,"pars":[...18...],"strokeIndex":[...18...]}]}' value={importJson} onChange={e=>setImportJson(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={doImport}>Импорт JSON</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Вкладка "Матчи" — как раньше (создание/удаление + QR + персональные ссылки) */
function MatchesTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [format, setFormat] = useState<MatchFormat>('singles');
  const [day, setDay] = useState('Day 1');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [sideA, setSideA] = useState<string[]>([]);
  const [sideB, setSideB] = useState<string[]>([]);
  const [qr, setQr] = useState<{ open: boolean; title: string; url: string }>({ open: false, title: '', url: '' });

  const reload = async () => {
    const data = await apiBootstrap();
    setPlayers(data.players);
    setTeams(data.teams);
    setCourses(data.courses);
    setMatches(data.matches);
    if (!courseId && data.courses[0]) setCourseId(data.courses[0].id);
  };
  useEffect(() => { reload().catch(console.error); }, []);

  const singleSelect = format === 'singles';
  const teamAPlayers = useMemo(()=> teams.find(t=>t.id===teamA)?.playerIds ?? [], [teamA, teams]);
  const teamBPlayers = useMemo(()=> teams.find(t=>t.id===teamB)?.playerIds ?? [], [teamB, teams]);

  const create = async () => {
    if (!name.trim() || !courseId || !teamA || !teamB || sideA.length===0 || sideB.length===0) return;
    await apiCreateMatch({
      id: uid('m'), name: name.trim(), day, format, courseId,
      sideATeamId: teamA, sideBTeamId: teamB,
      sideAPlayerIds: sideA, sideBPlayerIds: sideB
    });
    setName(''); setTeamA(''); setTeamB(''); setSideA([]); setSideB([]);
    reload();
  };

  const remove = async (id: string) => {
    await apiDeleteMatch(id);
    reload();
  };

  const openQr = (title: string, hashUrl: string) => {
    const base = window.location.origin + window.location.pathname;
    setQr({ open: true, title, url: `${base}${hashUrl}` });
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <div className="header"><div className="title">Создать матч</div></div>
        <div className="content grid" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Название матча" value={name} onChange={e=>setName(e.target.value)} />
            <input className="input" placeholder="День (напр. Day 3)" value={day} onChange={e=>setDay(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select className="select" value={format} onChange={e=>{ setFormat(e.target.value as MatchFormat); setSideA([]); setSideB([]); }}>
              <option value="singles">Singles</option>
              <option value="fourball">Best Ball (Fourball)</option>
            </select>
            <select className="select" value={courseId} onChange={e=>setCourseId(e.target.value)}>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select className="select" value={teamA} onChange={e=>{ setTeamA(e.target.value); setSideA([]); }}>
              <option value="">Команда A</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="select" value={teamB} onChange={e=>{ setTeamB(e.target.value); setSideB([]); }}>
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

      {matches.map(m => {
        const course = courses.find(c => c.id === m.courseId);
        const playerIdsA = flattenPlayerIds(m.sideA ?? [], teams);
        const playerIdsB = flattenPlayerIds(m.sideB ?? [], teams);
        const needsPersonal = (m.format === 'fourball') && (playerIdsA.length > 2 || playerIdsB.length > 2);

        const prog = matchProgress(
          { ...m, scoresA: m.scoresA ?? Array(18).fill(null), scoresB: m.scoresB ?? Array(18).fill(null) } as any,
          players, teams, course ?? { id:'', name:'', pars:[], strokeIndex:[] } as any
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
                <button className="btn" onClick={()=>openQr('QR — Ввод (общий)', `#/match/${m.id}`)}>QR</button>
                <a className="btn" href={`#/view/${m.id}`}>Просмотр</a>
                <button className="btn danger" onClick={()=>remove(m.id)}>Удалить матч</button>
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
                          <button className="btn" onClick={()=>openQr(`QR — ${p?.name ?? pid}`, hash)}>QR</button>
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

      <QrModal open={qr.open} onClose={()=>setQr({ ...qr, open: false })} title={qr.title} url={qr.url} />
    </div>
  );
}

/** Главный компонент Админки — табы */
export default function Admin() {
  const [tab, setTab] = useState<'players' | 'teams' | 'courses' | 'matches'>('matches');

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="content" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`btn ${tab === 'players' ? 'primary' : ''}`} onClick={() => setTab('players')}>Players</button>
          <button className={`btn ${tab === 'teams' ? 'primary' : ''}`} onClick={() => setTab('teams')}>Teams</button>
          <button className={`btn ${tab === 'courses' ? 'primary' : ''}`} onClick={() => setTab('courses')}>Courses</button>
          <button className={`btn ${tab === 'matches' ? 'primary' : ''}`} onClick={() => setTab('matches')}>Matches</button>
        </div>
      </div>

      {tab === 'players' && <PlayersTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'matches' && <MatchesTab />}
    </div>
  );
}

/* ---------- вспомогательные ---------- */

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
        {players.length === 0 && <div className="muted">Нет игроков в базе</div>}
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
