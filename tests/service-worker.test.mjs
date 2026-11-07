import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
async function request({url='https://example.com/data/a.json',mode='cors',response=null,hit=null}={}){
  const handlers={};let promise;const writes=[];
  const context={URL,Response,AbortController,setTimeout,clearTimeout,location:{origin:'https://example.com'},self:{location:{origin:'https://example.com'},registration:{scope:'https://example.com/'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async()=>{if(response)return response;throw Error('offline');},caches:{match:async req=>typeof req==='string'?new Response('<html>shell</html>'):hit,open:async()=>({put:async(req,res)=>writes.push(await res.text())})}};
  vm.runInNewContext(source,context);
  handlers.fetch({request:{url,method:'GET',mode},respondWith:p=>promise=p,waitUntil:p=>p.catch(()=>{})});
  return {response:await promise,writes};
}
test('uncached JSON errors never return the HTML app shell',async()=>{const {response}=await request();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'offline'});});
test('offline document navigation can use the app shell',async()=>{const {response}=await request({mode:'navigate',url:'https://example.com/music/'});assert.match(await response.text(),/shell/);});
test('server errors fall back to a valid cached resource',async()=>{const {response}=await request({response:new Response('failure',{status:500}),hit:new Response('{"ok":true}')});assert.deepEqual(await response.json(),{ok:true});});
test('missing remote resources stay 404, rather than turning into successful documents',async()=>{const {response}=await request({response:new Response('not found',{status:404})});assert.equal(response.status,404);});
