import test from 'node:test';
import assert from 'node:assert/strict';
import '../shared/validation.js';
import '../shared/records.js';
const encode=d=>'RS1.'+Buffer.from(JSON.stringify(d)).toString('base64');
const payload={v:1,checks:{'2026-11-08':['S1']},once:['S2'],done:['2026-11-08']};
function storage(failAt=Infinity){const map=new Map([['rs-check:2026-11-08','["existing"]']]);let n=0;return {map,getItem:k=>map.get(k)??null,setItem(k,v){if(++n===failAt)throw Error('quota');map.set(k,v);},removeItem:k=>map.delete(k)};}
test('legacy RS1 transfers merge without changing task IDs or deleting local records',()=>{
  const s=storage();RSRecords.merge(s,RSRecords.decode(encode(payload)));RSRecords.merge(s,RSRecords.decode(encode(payload)));
  assert.deepEqual(JSON.parse(s.getItem('rs-check:2026-11-08')),['existing','S1']);
});
test('invalid transfer dates and null structures are rejected before storage writes',()=>{
  assert.throws(()=>RSRecords.decode(encode({...payload,checks:null})));
  assert.throws(()=>RSRecords.decode(encode({...payload,checks:{'2026-02-31':['S1']}})));
  assert.throws(()=>RSRecords.decode('RS1.'+'a'.repeat(2000001)));
});
test('quota failure restores the previous records instead of partially importing',()=>{
  const s=storage(2),before=[...s.map];assert.throws(()=>RSRecords.merge(s,RSRecords.decode(encode(payload))));assert.deepEqual([...s.map],before);
});
