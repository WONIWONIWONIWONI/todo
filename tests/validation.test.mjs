import test from 'node:test';
import assert from 'node:assert/strict';
import '../shared/validation.js';
test('real calendar dates, leap years and time ranges', () => {
  for (const d of ['2026-02-31','2026-02-29','2026-13-01','2026-00-01']) assert.equal(RSData.isDate(d),false,d);
  assert.equal(RSData.isDate('2028-02-29'),true);
  for (const t of ['24:00','25:90','12:60','-1:00']) assert.equal(RSData.isTime(t),false,t);
  assert.equal(RSData.isTime('23:59'),true);
});
test('CSV quoted newlines, BOM, escapes and malformed input', () => {
  assert.deepEqual(RSData.parseCSV('\uFEFFid,text\r\n1,"a\n""b"""\r\n'),[['id','text'],['1','a\n"b"']]);
  assert.throws(() => RSData.parseCSV('id,text\n1,"missing'));
});
test('unknown dates are supported while reversed or impossible dates are rejected', () => {
  const head='아이디,구분,내용,시작일,종료일,반복\n';
  assert.equal(RSData.validateFile('할일.csv',head+'S1,자체,테스트,,,매일\n').length,0);
  assert.ok(RSData.validateFile('할일.csv',head+'S1,자체,테스트,2026-02-31,2026-02-01,매일\n').length);
});
test('JSON requires unique IDs and valid times and notices', () => {
  assert.ok(RSData.validateFile('weekly.json',JSON.stringify({events:[{id:'a',title:'x',date:'2026-11-08',time:'27:00'}]})).length);
  assert.ok(RSData.validateFile('notice.json',JSON.stringify({notices:[{id:'a',title:'x',until:'2026-02-31T23:59'}]})).length);
  assert.ok(RSData.validateFile('notice.json',JSON.stringify({notices:[{id:'a',title:'x'},{id:'a',title:'y'}]})).length);
});
