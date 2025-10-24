import React, { useEffect, useMemo, useState } from 'react';
import Admin from './components/Admin';
import PublicBoard from './components/PublicBoard';
import ScoringPage from './components/ScoringPage';
import { Course, Match, Player, Team } from './types';
import {
  apiBootstrap,
  apiGetMatchWithScores, // ← ЗАМЕНА
  apiSubmitScore,
  apiCreateMatch,
  apiDeleteMatch,
} from './api';
import MatchPage from './pages/MatchPage';
import { normalizeMatch, normalizeMatches } from './utils';

// ...
function useHashRoute(){
  const [hash, setHash] = React.useState(window.location.hash || '#/public');
  React.useEffect(()=>{ const fn=()=>setHash(window.location.hash||'#/public'); window.addEventListener('hashchange',fn); return ()=>window.removeEventListener('hashchange',fn); },[]);
  return hash.replace(/^#/,'') || '/public';
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

  if (route.startsWith('/match/')) {
    const id = route.split('/')[2];
    const readOnly = new URLSearchParams(window.location.search).get('view') === 'public';
    return <MatchPage matchId={id} readOnlyParam={readOnly} />;
  }

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
    setMatches(normalizeMatches(data.matches));
    setHydrated(true);
  };
  useEffect(() => { loadAll().catch(console.error); }, []);

  // ------ parsed route ------
  const parsed: MatchViewState = useMemo(() => {
    if (route.startsWith('/match/')) {
      const parts = route.split('/');
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

  // ------ match detail state ------
  const [matchDetail, setMatchDetail] = useState<{ match: Match; course: Course } | null>(null);
  const [pollTimer, setPollTimer] = useState<number | null>(null);

  useEffect(() => {
    if (pollTimer) { clearInterval(pollTimer); setPollTimer(null); }

    if ((parsed.mode === 'match' || parsed.mode === 'view') && parsed.matchId) {
      // ЗАГРУЗКА МАТЧА + hole_scores
      apiGetMatchWithScores(parsed.matchId)
        .then(({ match, course }) => setMatchDetail({ match: normalizeMatch(match), course }))
        .catch(err => {
          console.error(err);
          setMatchDetail(null);
        });

      // polling для LIVE
      const t = window.setInterval(() => {
        apiGetMatchWithScores(parsed.matchId!)
          .then(({ match, course }) => setMatchDetail({ match: normalizeMatch(match), course }))
          .catch(() => {});
      }, parsed.mode === 'match' ? 4000 : 5000);
      setPollTimer(t as unknown as number);

      return () => { clearInterval(t); };
    } else {
      setMatchDetail(null);
    }
  }, [parsed.mode, parsed.matchId]);

  // ------ UI шапка/загрузка ------
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

  // ------ маршруты ------
  if (route.startsWith('/login')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card" style={{ maxWidth: 380, width: '100%' }}>
          <div className="header"><div className="title">Вход администратора</div></div>
          <div className="content" style={{ display: 'grid', gap: 8 }}>
            <input className="input" placeholder="Логин" onChange={(e) => ((window as any).__u = e.target.value)} />
            <input className="input" placeholder="Пароль" type="password" onChange={(e) => ((window as any).__p = e.target.value)} />
            <button className="btn primary" onClick={() => {
              const u = (window as any).__u || '';
              const p = (window as any).__p || '';
              if (u === 'admin' && p === 'belek2025!') {
                setRole('admin'); setRoleState('admin'); window.location.hash = '#/admin';
              } else {
                alert('Неверный логин/пароль');
              }
            }}>Войти</button>
            <div className="muted" style={{ fontSize: 12 }}>admin / belek2025!</div>
          </div>
        </div>
      </div>
    );
  }

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
                .then(() => apiGetMatchWithScores(matchDetail.match.id).then(({match,course})=>setMatchDetail({match,course})))
            }
          />
        </div>
      </>
    );
  }

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

  if (route.startsWith('/admin')) {
    if (!hydrated) return Loading;
    if (!isAdmin) { window.location.hash = '#/login'; return null; }

    return (
      <>
        {TopBar}
        <div className="max-w-6xl mx-auto p-4">
          <Admin />
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
