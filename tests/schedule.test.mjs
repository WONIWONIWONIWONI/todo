import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../shared/validation.js';import '../shared/schedule.js';
const key=x=>x.toLowerCase().replace(/\s/g,''), matcher=RSSchedule.createMatcher({key,rawKey:key});
const a={id:'a',date:'2026-11-08',time:'17:00',title:'리센느 팬사인회',members:['리브']};
test('different dates, distant times or disjoint members cannot silently merge',()=>{
  assert.equal(matcher.score(a,{...a,date:'2026-11-09'}),0);
  assert.equal(matcher.score(a,{...a,time:'20:00'}),0);
  assert.equal(matcher.score(a,{...a,members:['제나']}),0);
  assert.ok(matcher.score(a,{...a,id:'b'}));
});
test('explicit editorial split or merge overrides automatic matching',()=>{
  const fixes=[{'구분':'분리','대상아이디':'a','상대아이디':'b'}];
  assert.equal(RSSchedule.createMatcher({key,rawKey:key,fixes}).score(a,{...a,id:'b'}),0);
  fixes[0]['구분']='병합';assert.equal(RSSchedule.createMatcher({key,rawKey:key,fixes}).score(a,{...a,id:'b',title:'다른 표기'}),10);
});
// 일정 화면에서 부르는 sch* 도우미가 src/에 다 있는지 (없으면 누를 때 ReferenceError로 멈춰요)
// 예: 돋보기 버튼의 schOpenFind·schCloseFind가 v161 정리 때 빠져서 눌리지 않았음 (2026-11-17 수정)
test('every sch* helper the schedule code calls is defined in src',()=>{
  const dir=fileURLToPath(new URL('../src/',import.meta.url));
  const src=readdirSync(dir).filter(f=>f.endsWith('.js')).map(f=>readFileSync(dir+f,'utf8')).join('\n');
  const defined=new Set([...src.matchAll(/function\s+(sch[A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]));
  for(const m of src.matchAll(/(?:const|let|var)\s+(sch[A-Za-z0-9_$]*)\s*=/g)) defined.add(m[1]);
  const called=[...src.matchAll(/(?<![.\w$])(sch[A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(called)].filter(n=>!defined.has(n)).sort(),[]);
});
