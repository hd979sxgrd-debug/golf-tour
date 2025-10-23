// src/App.tsx
import React, { useEffect, useState } from 'react';
import Admin from './components/Admin';
import PublicBoard from './components/PublicBoard';
import ScoringPage from './components/ScoringPage';
import { Course, Match, Player, Team } from './types';
import { apiBootstrap, apiGetMatch, apiSubmitScore, apiCreateMatch, apiDeleteMatch } from './api';
import { uid } from './utils';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/public');
  useEffect(()=>{ const fn=()=>setHash(window.location.hash || '#/public'); window.addEventListener('hashchange', fn); return ()=>window.removeEventListener('hashchange', fn); },[]);
  return (hash.replace(/^#/, '') || '/public') as string;
}

const ROLE_KEY = 'role';
const getRole = () => localStorage.getItem(ROLE_KEY) || 'viewer';
const setRole = (r:string) => localStorage.setItem(ROLE_KEY, r);

export default function App(){
  const route = useHashRoute();
  const [role, setRoleState] = useState<string>(getRole());

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // bootstrap from API
  async function loadAll(){
    const data = await apiBootstrap();
    setPlayers(data.players);
    setTeams(data.teams as any);
    setCourses(data.courses);
    setMatches(data.matches);
    setIsHydrated(true);
  }
  useEffect(()=>{ loadAll().catch(console.error); },[]);

  const isAdmin = role==='admin';
  const doLogin = (u:string,p:string)=>{ if(u==='admin' && p==='belek2025!'){ setRole('admin'); setRoleState('admin'); window.location.hash = '#/admin'; } else alert('Неверный логин/пароль'); };
  const doLogout = ()=>{ setRole('viewer'); setRoleState('viewer'); window.location.hash = '#/public'; };

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

  // ---- Routes ----
  if (route.startsWith('/login')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="card" style={{maxWidth:380, width:'100%'}}>
          <div className="header"><div className="title">Вход администратора</div></div>
          <div className="content" style={{display:'grid', gap:8}}>
            <input className="input" placeholder="Логин" onChange={(e)=> (window as any).__u=e.target.value} />
            <input className="input" placeholder="Пароль" type="password" onChange={(e)=> (window as any).__p=e.target.value} />
            <button className="btn primary" onClick={()=>doLogin((window as any).__u,(window as any).__p)}>Войти</button>
            <div className="muted" style={{fontSize:12}}>admin / belek2025!</div>
          </div>
        </div>
      </div>
    );
  }

  if (route.startsWith('/match/')) {
    const parts = route.split('/');
    const matchId = parts[2];
    const playerId = parts[3]==='player' ? parts[4] : undefined;

    const [mState, setMState] = useState<{match:Match; course:Course} | null>(null);
    useEffect(()=>{
      apiGetMatch(matchId).then(setMState).catch(()=>setMState(null));
      const t = setInterval(()=> apiGetMatch(matchId).then(setMState).catch(()=>{}), 4000); // легкий поллинг для LIVE
      return ()=>clearInterval(t);
    }, [matchId]);

    if (!isHydrated || !mState) return Loading;

    return (
      <>
        {TopBar}
        <div className="max-w-3xl mx-auto p-3">
          <ScoringPage
            match={mState.match}
            course={mState.course}
            players={players}
            teams={teams}
            readOnly={false}
            focusPlayerId={playerId}
            onScore={(payload)=> apiSubmitScore({ matchId, ...payload }).then(()=> apiGetMatch(matchId).then(setMState))}
          />
        </div>
      </>
    );
  }

  if (route.startsWith('/view/')) {
    const parts = route.split('/');
    const matchId = parts[2];

    const [mState, setMState] = useState<{match:Match; course:Course} | null>(null);
    useEffect(()=>{
      apiGetMatch(matchId).then(setMState).catch(()=>setMState(null));
      const t = setInterval(()=> apiGetMatch(matchId).then(setMState).catch(()=>{}), 5000);
      return ()=>clearInterval(t);
    }, [matchId]);

    if (!isHydrated || !mState) return Loading;

    return (
      <>
        {TopBar}
        <div className="max-w-3xl mx-auto p-3">
          <ScoringPage
            match={mState.match}
            course={mState.course}
            players={players}
            teams={teams}
            readOnly={true}
          />
        </div>
      </>
    );
  }

  if (route.startsWith('/admin')) {
    if (!isHydrated) return Loading;
    if (role!=='admin') { window.location.hash = '#/login'; return null; }

    const [tab, setTab] = useState<'players'|'teams'|'courses'|'matches'>('matches');

    return (
      <>
        {TopBar}
        <div className="max-w-6xl mx-auto p-4">
          <div className="card" style={{marginBottom:12}}>
            <div className="content" style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button className={`btn ${tab==='players'?'primary':''}`} onClick={()=>setTab('players')}>Players</button>
              <button className={`btn ${tab==='teams'?'primary':''}`} onClick={()=>setTab('teams')}>Teams</button>
              <button className={`btn ${tab==='courses'?'primary':''}`} onClick={()=>setTab('courses')}>Courses</button>
              <button className={`btn ${tab==='matches'?'primary':''}`} onClick={()=>setTab('matches')}>Matches</button>
              <button className="btn" onClick={()=>loadAll()}>↻ Обновить</button>
            </div>
          </div>

          {tab==='players' && <Admin.Players players={players} setPlayers={()=>{}} />} {/* CRUD игроков можно добавить отдельными функциями позже */}
          {tab==='teams'   && <Admin.Teams players={players} teams={teams} setTeams={()=>{}} />}
          {tab==='courses' && <Admin.Courses courses={courses} setCourses={()=>{}} />}
          {tab==='matches' && (
            <Admin.Matches
              isAdmin={true} viewMode="edit"
              players={players} teams={teams} courses={courses}
              matches={matches}
              setMatches={(next)=>{
                setMatches(next);
              }}
              onCreate={async (m)=>{
                await apiCreateMatch(m);
                await loadAll();
              }}
              onDelete={async (id)=>{
                await apiDeleteMatch(id);
                await loadAll();
              }}
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
        {!isHydrated ? (
          <div className="card"><div className="content">Загрузка…</div></div>
        ) : (
          <PublicBoard matches={matches} courses={courses} players={players} teams={teams} />
        )}
      </div>
    </>
  );
}
