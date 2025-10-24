// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import Admin from './components/Admin';
import PublicBoard from './components/PublicBoard';
import MatchInputPage from './pages/MatchInputPage';
import MatchViewPage from './pages/MatchViewPage';
import { Course, Match, Player, Team } from './types';
import { apiBootstrap, apiGetMatch, apiSubmitScore } from './api';

/* -------------------- tiny router by hash -------------------- */
function useHashRoute(){
  const [hash, setHash] = React.useState(window.location.hash || '#/public');
  React.useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/public');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash.replace(/^#/,'') || '/public';
}

/* -------------------- auth helpers -------------------- */
const ROLE_KEY = 'role';
const getRole = () => localStorage.getItem(ROLE_KEY) || 'viewer';
const setRole = (r: string) => localStorage.setItem(ROLE_KEY, r);

/* -------------------- shared topbar -------------------- */
function TopBar({ isAdmin, onLogout }:{ isAdmin:boolean; onLogout:()=>void }){
  return (
    <div className="w-full bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
        <a href="#/public" className="font-bold">Golf Scorer</a>
        <div className="flex items-center gap-2">
          <a className="btn" href="#/public">Публичная</a>
          <a className="btn" href="#/admin">Админка</a>
          {isAdmin ? <button className="btn" onClick={onLogout}>Выйти</button> : <a className="btn" href="#/login">Войти</a>}
        </div>
      </div>
    </div>
  );
}

/* -------------------- route components (safe hooks) -------------------- */

function MatchRoute({
  id, route, players, teams, onLoading
}:{
  id: string;
  route: string;
  players: Player[];
  teams: Team[];
  onLoading: React.ReactNode;
}){
  const [detail, setDetail] = useState<{ match: Match; course: Course } | null>(null);

  useEffect(()=>{ apiGetMatch(id).then(setDetail).catch(()=>setDetail(null)); }, [id]);

  const refetch = async () => {
    const d = await apiGetMatch(id);
    setDetail(d);
  };

  if (!detail) return <>{onLoading}</>;

  const focusPlayerId = (route.split('/')[3]==='player') ? route.split('/')[4] : undefined;

  return (
    <div className="max-w-4xl mx-auto p-3">
      <MatchInputPage
        match={detail.match}
        course={detail.course}
        players={players}
        teams={teams}
        onScore={(p)=>apiSubmitScore({ matchId: detail.match.id, ...p })}
        refetch={refetch}
        focusPlayerId={focusPlayerId}
      />
    </div>
  );
}

function ViewRoute({
  id, players, teams, onLoading
}:{
  id: string;
  players: Player[];
  teams: Team[];
  onLoading: React.ReactNode;
}){
  const [detail, setDetail] = useState<{ match: Match; course: Course } | null>(null);
  useEffect(()=>{ apiGetMatch(id).then(setDetail).catch(()=>setDetail(null)); }, [id]);
  if (!detail) return <>{onLoading}</>;
  return (
    <div className="max-w-5xl mx-auto p-3">
      <MatchViewPage
        match={detail.match}
        course={detail.course}
        players={players}
        teams={teams}
      />
    </div>
  );
}

/* -------------------- main app -------------------- */

export default function App() {
  const route = useHashRoute();

  // auth
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

  // bootstrap
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

  const Loading = (
    <div className="max-w-3xl mx-auto p-6">
      <div className="card"><div className="content">Загрузка…</div></div>
    </div>
  );

  // top bar is stable
  const Bar = <TopBar isAdmin={isAdmin} onLogout={doLogout} />;

  // login
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

  // match input: /match/:id[/player/:pid]
  if (route.startsWith('/match/')) {
    const id = route.split('/')[2];
    return (
      <>
        {Bar}
        {!hydrated ? Loading : (
          <MatchRoute id={id} route={route} players={players} teams={teams} onLoading={Loading} />
        )}
      </>
    );
  }

  // read-only view: /view/:id
  if (route.startsWith('/view/')) {
    const id = route.split('/')[2];
    return (
      <>
        {Bar}
        {!hydrated ? Loading : (
          <ViewRoute id={id} players={players} teams={teams} onLoading={Loading} />
        )}
      </>
    );
  }

  // admin
  if (route.startsWith('/admin')) {
    if (!hydrated) return (<>{Bar}{Loading}</>);
    if (!isAdmin) { window.location.hash = '#/login'; return null; }
    return (
      <>
        {Bar}
        <div className="max-w-6xl mx-auto p-4">
          <Admin/>
        </div>
      </>
    );
  }

  // public
  return (
    <>
      {Bar}
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
