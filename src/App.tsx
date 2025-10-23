import React, { useEffect, useMemo, useState } from 'react';
import Admin from './components/Admin';
import PublicBoard from './components/PublicBoard';
import ScoringPage from './components/ScoringPage';
import { Course, Match, Player, Team } from './types';
import { apiBootstrap, apiGetMatch, apiSubmitScore, apiCreateMatch, apiDeleteMatch } from './api';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/public');
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/public');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return (hash.replace(/^#/, '') || '/public') as string;
}

const ROLE_KEY = 'role';
const getRole = () => localStorage.getItem(ROLE_KEY) || 'viewer';
const setRole = (r: string) => localStorage.setItem(ROLE_KEY, r);

type MatchViewState = {
  mode: 'match' | 'view' | null;
  matchId: string | null;
  focusPlayerId?: string;
};

export default function App() {
  const route = useHashRoute();

  // ------ auth ------
  const [role, setRoleState] = useState<string>(getRole());
  const isAdmin = role === 'admin';
  const doLogin = (u: string, p: string) => {
    if (u === 'admin' && p === 'belek2025!') {
      setRole('admin'); setRoleState('admin'); window.location.hash = '#/admin';
    } else {
      alert('Неверный логин/пароль');
    }
  };
  const doLogout = () => { setRole('viewer'); setRoleState('viewer'); window.location.hash = '#/public'; };

  // ------ bootstrap from API ------
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const loadAll = async () => {
    const data = await apiBootstrap();
    setPlayers(data.players);
    setTeams(data.teams as any);
    setCourses(data.courses);
    setMatches(data.matches);
    setHydrated(true);
  };
  useEffect(() => { loadAll().catch(console.error); }, []);

  // ------ parsed route ------
  const parsed: MatchViewState = useMemo(() => {
    if (route.startsWith('/match/')) {
      const parts = route.split('/');
      // /match/:id[/player/:playerId]
      const matchId = parts[2] || null;
      const focusPlayerId = parts[3] === 'player' ? parts[4] : undefined;
      return { mode: 'match', matchId, focusPlayerId };
    }
    if (route.startsWith('/view/')) {
      const parts = route.split('/');
      const matchId = parts[2] || null;
      return { mode: 'view', matchId };
    }
    return { mode: null, matchId: null };
  }, [route]);

  // ------ match detail state (used both for /match and /view) ------
  const [matchDetail, setMatchDetail] = useState<{ match: Match; course: Course } | null>(null);
  const [pollTimer, setPollTimer] = useState<number | null>(null);

  useEffect(() => {
    // clear previous polling
    if (pollTimer) { clearInterval(pollTimer); setPollTimer(null); }

    if ((parsed.mode === 'match' || parsed.mode === 'view') && parsed.matchId) {
      apiGetMatch(parsed.matchId)
        .then(setMatchDetail)
        .catch(err => {
          console.error(err);
          setMatchDetail(null);
        });

      // lightweight polling for LIVE updates
      const t = window.setInterval(() => {
        apiGetMatch(parsed.matchId!)
          .then(setMatchDetail)
          .catch(() => {});
      }, parsed.mode === 'match' ? 4000 : 5000);
      setPollTimer(t as unknown as number);

      return () => { clearInterval(t); };
    } else {
      setMatchDetail(null);
    }
  }, [parsed.mode, parsed.matchId]);

  // ------ admin tab state (ВНЕ условных блоков!) ------
  const [tab, setTab] = useState<'players' | 'teams' | 'courses' | 'matches'>('matches');

  // ------ top bar ------
  const TopBar = (
    <div className="w-full bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
        <a href="#/public" className="font-bold">Golf Scorer</a>
        <div className="flex items-center gap-2">
          <a className="btn" href="#/public">Публичная</a>
          <a className="btn" href="#/admin">Админка</a>
          {isAdmin ? <button className="btn" onClick={doLogout}>Выйти</button> : <a className="btn" href="#/login">Войти</a>}
        </div>
      </div>
    </div>
  );

  const Loading = (
    <>
      {TopBar}
      <div className="max-w-3xl mx-auto p-6">
        <div className="card"><div className="content">Загрузка…</div></div>
      </div>
    </>
  );

  // ------ routes rendering (никаких хуков внутри) ------
  // /login
  if (route.startsWith('/login')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card" style={{ maxWidth: 380, width: '100%' }}>
          <div className="header"><div className="title">Вход администратора</div></div>
          <div className="content" style={{ display: 'grid', gap: 8 }}>
            <input className="input" placeholder="Логин" onChange={(e) => ((window as any).__u = e.target.value)} />
            <input className="input" placeholder="Пароль" type="password" onChange={(e) => ((window as any).__p = e.target.value)} />
            <button className="btn primary" onClick={() => doLogin((window as any).__u, (window as any).__p)}>Войти</button>
            <div className="muted" style={{ fontSize: 12 }}>admin / belek2025!</div>
          </div>
        </div>
      </div>
    );
  }

  // /match/:id[/player/:pid]  (data entry)
  if (parsed.mode === 'match') {
    if (!hydrated || !matchDetail) return Loading;
    return (
      <>
        {TopBar}
        <div className="max-w-4xl mx-auto p-3">
          <ScoringPage
            match={matchDetail.match}
            course={matchDetail.course}
            players={players}
            teams={teams}
            readOnly={false}
            focusPlayerId={parsed.focusPlayerId}
            onScore={(payload) =>
              apiSubmitScore({ matchId: matchDetail.match.id, ...payload })
                .then(() => apiGetMatch(matchDetail.match.id).then(setMatchDetail))
            }
          />
        </div>
      </>
    );
  }

  // /view/:id  (read-only view)
  if (parsed.mode === 'view') {
    if (!hydrated || !matchDetail) return Loading;
    return (
      <>
        {TopBar}
        <div className="max-w-4xl mx-auto p-3">
          <ScoringPage
            match={matchDetail.match}
            course={matchDetail.course}
            players={players}
            teams={teams}
            readOnly={true}
          />
        </div>
      </>
    );
  }

  // /admin
  if (route.startsWith('/admin')) {
    if (!hydrated) return Loading;
    if (!isAdmin) { window.location.hash = '#/login'; return null; }

    return (
      <>
        {TopBar}
        <div className="max-w-6xl mx-auto p-4">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="content" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className={`btn ${tab === 'players' ? 'primary' : ''}`} onClick={() => setTab('players')}>Players</button>
              <button className={`btn ${tab === 'teams' ? 'primary' : ''}`} onClick={() => setTab('teams')}>Teams</button>
              <button className={`btn ${tab === 'courses' ? 'primary' : ''}`} onClick={() => setTab('courses')}>Courses</button>
              <button className={`btn ${tab === 'matches' ? 'primary' : ''}`} onClick={() => setTab('matches')}>Matches</button>
              <button className="btn" onClick={() => loadAll()}>↻ Обновить</button>
            </div>
          </div>

          {tab === 'players' && <Admin.Players players={players} />}
          {tab === 'teams' && <Admin.Teams players={players} teams={teams} />}
          {tab === 'courses' && <Admin.Courses courses={courses} />}
          {tab === 'matches' && (
            <Admin.Matches
              isAdmin={true}
              viewMode="edit"
              players={players}
              teams={teams}
              courses={courses}
              matches={matches}
              setMatches={setMatches}
              onCreate={async (m) => { await apiCreateMatch(m); await loadAll(); }}
              onDelete={async (id) => { await apiDeleteMatch(id); await loadAll(); }}
            />
          )}
        </div>
      </>
    );
  }

  // /public
  return (
    <>
      {TopBar}
      <div className="max-w-6xl mx-auto p-4">
        {!hydrated ? (
          <div className="card"><div className="content">Загрузка…</div></div>
        ) : (
          <PublicBoard matches={matches} courses={courses} players={players} teams={teams} />
        )}
      </div>
    </>
  );
}
