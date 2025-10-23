
import React from 'react'
import { Course } from '../types'
import { defaultPars, shotsOnHole, sum, toCourseHandicap } from '../utils'
function Badge({ ok, label }:{ ok:boolean; label:string }){ return <span className={`badge ${ok?'pass':'fail'}`} style={{marginRight:6}}>{ok?'PASS':'FAIL'}: {label}</span> }
export default function SelfTests(){
  const t1 = sum([4,null,5,3]) === 12;
  const fake: Course = { id:'c', name:'Test', pars: defaultPars(), cr:71, slope:130 };
  const t2 = toCourseHandicap(10, fake) === Math.round(10*(130/113)+(71-72));
  const t3 = shotsOnHole(20, 4, [5,6,7,8,5,6,7,8,9,10,11,12,13,14,15,16,17,18]) === 1;
  const t4 = shotsOnHole(25, 0, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]) === 2;
  const si = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
  const t5 = (5 - shotsOnHole(1, 0, si)) < 5;
  const t6 = shotsOnHole(Math.round(8*0.75), 5, si) === 1;
  return (<div style={{margin:'8px 0'}}><div className="muted" style={{marginBottom:4}}>Self-tests:</div><Badge ok={t1} label="sum([4,null,5,3]) === 12" /><Badge ok={t2} label="toCourseHandicap basic" /><Badge ok={t3} label="CH20 @ SI5 = 1" /><Badge ok={t4} label="CH25 @ SI1 = 2" /><Badge ok={t5} label="Equal gross; A has stroke → A wins" /><Badge ok={t6} label="Singles 75% allowance @ SI6 = 1" /></div>)
}
