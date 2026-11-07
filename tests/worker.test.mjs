import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import { webcrypto } from 'node:crypto';
const worker=fs.readFileSync(new URL('../admin-worker/worker.js',import.meta.url),'utf8');
const validator=fs.readFileSync(new URL('../shared/validation.js',import.meta.url),'utf8');
const files=JSON.parse(fs.readFileSync(new URL('../shared/admin-files.json',import.meta.url),'utf8'));
function setup({conflict=false,dispatch=true}={}) {
 const calls=[];
 const context={crypto:webcrypto,TextEncoder,TextDecoder,URL,Response,Request,btoa,atob,console,DurableObject:class {},FILES:files,fetch:async(url,init={})=>{
   const path=new URL(url).pathname.replace('/repos/WONIWONIWONIWONI/todo','');const body=init.body?JSON.parse(init.body):null;
   calls.push({path,method:init.method||'GET',body});
   if(path==='/git/ref/heads/main')return Response.json({object:{sha:'head'}});
   if(path.startsWith('/contents/') && !init.method)return Response.json({sha:conflict?'newer':'original'});
   if(path==='/git/refs')return Response.json({ref:body.ref});
   if(path==='/contents/.admin/transaction.json')return Response.json({commit:{sha:'draft-commit'}});
   if(path.startsWith('/contents/'))return Response.json({content:{sha:'saved-file'},commit:{sha:'file-commit'}});
   if(path.endsWith('/dispatches'))return new Response(null,{status:dispatch?204:403});
   throw Error('unexpected endpoint '+path);
 }};
 vm.runInNewContext(validator,context);
 vm.runInNewContext(fs.readFileSync(new URL('../shared/schedule.js',import.meta.url),'utf8'),context);
 vm.runInNewContext(worker.replace(/^import .*;\n/gm,'').replace(/export function /g,'function ').replace('export class ','class ').replace('export default {','globalThis.worker = {')+'\nglobalThis.issueTicket=makeTicket;',context);
 const env={SIGN_KEY:'test-only',GH_TOKEN:'test-only'};
 const put=async text=>{const token=await context.issueTicket(env);return context.worker.fetch(new Request('https://worker.test/file',{method:'PUT',headers:{Authorization:'Bearer '+token,Origin:'https://rescenefan.pages.dev','Content-Type':'application/json'},body:JSON.stringify({path:'sheet-templates/할일.csv',sha:'original',text,note:'test',inboxDone:['123']})}),env);};
 return {calls,put};
}
const csv='아이디,구분,내용\nS1,자체,테스트\n';
test('admin save writes an isolated draft and transaction, never main',async()=>{
 const {calls,put}=setup();const response=await put(csv),data=await response.json();assert.equal(data.protocol,2);assert.match(data.branch,/^admin-drafts\//);assert.equal(data.sha,'original');
 const writes=calls.filter(c=>c.method==='PUT');assert.equal(writes.length,2);assert.ok(writes.every(c=>c.body.branch.startsWith('admin-drafts/')));
 const tx=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(writes[1].body.content),c=>c.charCodeAt(0))));assert.equal(tx.baseSha,'original');assert.deepEqual(tx.inboxDone,['123']);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://rescenefan.pages.dev');
});
test('invalid input or conflicting data cannot create a draft or publish',async()=>{
 const a=setup();assert.equal((await a.put('アイ디,구분,내용\nS1,잘못,테스트\n')).status,400);assert.equal(a.calls.length,0);
 const b=setup({conflict:true});assert.equal((await b.put(csv)).status,409);assert.ok(b.calls.every(c=>c.method==='GET'));
});
test('dispatch failure keeps a recoverable draft rather than losing content',async()=>{
 const {put}=setup({dispatch:false});const d=await (await put(csv)).json();assert.equal(d.ok,true);assert.equal(d.dispatched,false);assert.match(d.branch,/^admin-drafts\//);
});
