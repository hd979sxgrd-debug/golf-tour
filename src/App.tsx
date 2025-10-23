import React, { useEffect, useMemo, useState } from 'react';
import Admin from './components/Admin';
import PublicBoard from './components/PublicBoard';
// ScoringPage не используется напрямую здесь — им занимается MatchPage
// import ScoringPage from './components/ScoringPage';
import { Course, Match, Player, Team } from './types';
import { apiBootstrap } from './api';
import MatchPage from './pages/MatchPage';

// ------ simple hash router ------
function useHashRoute() {
  const [hash, setHash] = React.useState(window.location.hash || '#/public');
  React.useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/public');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash.replace(/^#/, '') || '/public';
}

// ------ auth helpers ------
const ROLE_KEY = 'role';
const getRole = () => localStorage.getItem(ROLE_KEY) || 'viewer';
const setRole = (r: string) => localStorage.setItem(ROLE_KEY, r);

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

  // ------ bootstrap for public/admin pages ------
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiBootstrap();
        setPlayers(data.players || []);
        setTeams((data.teams as any) || []);
        setCourses(data.courses || []);
        setMatches(data.matches || []);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // ------ UI bits ------
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

  // ------ routes (все компоненты — только через JSX!) ------

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

  // /match/:id  — страница ввода (редактируемая)
  if (route.startsWith('/match/')) {
    const id = route.split('/')[2]; // /match/<id>
    return (
      <>
        {TopBar}
        <div className="max-w-5xl mx-auto p-3 md:p-6">
          <MatchPage matchId={id} readOnlyParam={false} />
        </div>
      </>
    );
  }

  // /view/:id  — публичный просмотр (read-only)
  if (route.startsWith('/view/')) {
    const id = route.split('/')[2]; // /view/<id>
    return (
      <>
        {TopBar}
        <div className="max-w-5xl mx-auto p-3 md:p-6">
          <MatchPage matchId={id} readOnlyParam={true} />
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
          <Admin />
        </div>
      </>
    );
  }

  // /public (главная публичная доска)
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
