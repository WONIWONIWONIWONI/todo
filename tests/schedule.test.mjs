import test from 'node:test';
import assert from 'node:assert/strict';
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
