
import React, { useState } from 'react'
import { Course, Match, Player, Team } from '../types'

export default function ImportExport({ players, teams, courses, matches, onImport }:{ players:Player[]; teams:Team[]; courses:Course[]; matches:Match[]; onImport:(data:{players:Player[];teams:Team[];courses:Course[];matches:Match[];})=>void; }){
  const download = ()=>{
    const data = { players, teams, courses, matches };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'golf-tournament.json'; a.click(); URL.revokeObjectURL(url);
  };
  const [jsonText, setJsonText] = useState('');
  return (
    <div className="row">
      <button className="btn" onClick={download}>Экспорт JSON</button>
      <details className="card" style={{padding:10}}>
        <summary style={{cursor:'pointer'}}>Импорт</summary>
        <div className="grid">
          <div>
            <div className="muted">Вставить JSON</div>
            <textarea className="textarea" value={jsonText} onChange={e=>setJsonText(e.target.value)} placeholder='{"players":[],"teams":[],"courses":[],"matches":[]}' />
            <button className="btn primary" onClick={()=>{
              try { const data = JSON.parse(jsonText); onImport({ players: data.players ?? [], teams: data.teams ?? [], courses: data.courses ?? [], matches: data.matches ?? [] }); setJsonText(''); alert('Импортировано'); } catch(e:any){ alert('Ошибка JSON: ' + e.message); }
            }}>Импорт JSON</button>
          </div>
        </div>
      </details>
    </div>
  )
}
