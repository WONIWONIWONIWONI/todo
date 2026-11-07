import fs from 'node:fs';
import path from 'node:path';
import '../shared/validation.js';
const root = path.resolve(import.meta.dirname, '..');
const errors = [], tables = {};
for (const name of Object.keys(RSData.schema)) {
  const file = path.join(root, 'sheet-templates', name);
  if (!fs.existsSync(file)) { errors.push(`${name}: 파일이 없어요`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  errors.push(...RSData.validateFile(name, text).map(e => `${name} ${e.row}줄 ${e.column}: ${e.message}`));
  const [head, ...rows] = RSData.parseCSV(text);
  tables[name] = rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}
const ids = (name, key) => new Set((tables[name] || []).map(r => r[key]));
const allies = ids('연합.csv', '아이디'), camps = ids('투표종류.csv', '아이디'), groups = ids('색묶음.csv', '묶음');
for (const row of tables['할일.csv'] || []) {
  if (row['연합아이디'] && !allies.has(row['연합아이디'])) errors.push(`${row['아이디']}: 없는 연합이에요`);
  if (row['투표종류ID'] && !camps.has(row['투표종류ID'])) errors.push(`${row['아이디']}: 없는 투표 종류예요`);
}
for (const row of tables['투표종류.csv'] || []) if (!groups.has(row['묶음'])) errors.push(`${row['아이디']}: 없는 색 묶음이에요`);
for (const name of ['weekly.json', 'notice.json', 'inbox.json']) {
  const text = fs.readFileSync(path.join(root, 'data', name), 'utf8');
  errors.push(...RSData.validateFile(name, text).map(e => `${name} ${e.row}: ${e.message}`));
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('공통 자료 형식·실제 날짜·시간·참조 관계 검사 통과');
