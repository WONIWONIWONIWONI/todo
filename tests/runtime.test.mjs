import test from 'node:test';
import assert from 'node:assert/strict';
import '../shared/runtime.js';
test('concurrent requests deduplicate and preserve previous data on failure', async () => {
  let clock=100000,calls=0,fail=false;
  const client=RSRuntime.createResourceClient({now:()=>clock,fetcher:async()=>{calls++;if(fail)throw Error('offline');return {events:['good']};}});
  const options={fallback:{events:[]},ttl:100};
  await Promise.all([client.load('calendar','url',options),client.load('calendar','url',options)]);
  assert.equal(calls,1); const successAt=client.get('calendar').successAt;
  clock+=101;fail=true; await client.load('calendar','url',options);
  assert.deepEqual(client.get('calendar').data,{events:['good']});assert.equal(client.get('calendar').successAt,successAt);assert.equal(client.get('calendar').error,'offline');
  await client.load('calendar','url',options);assert.equal(calls,2);
  fail=false; await client.load('calendar','url',{...options,force:true});assert.equal(calls,3);assert.equal(client.get('calendar').error,'');
});
test('bad API data does not overwrite a good snapshot',async()=>{
  let raw={events:[1]};const client=RSRuntime.createResourceClient({fetcher:async()=>raw});
  const transform=d=>{if(!Array.isArray(d.events))throw Error('shape');return d;};
  await client.load('a','url',{transform});raw={error:true};await client.load('a','url',{transform,force:true});
  assert.deepEqual(client.get('a').data,{events:[1]});assert.equal(client.get('a').error,'shape');
});
test('storage failure does not discard successfully downloaded data',async()=>{
  const client=RSRuntime.createResourceClient({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}},fetcher:async()=>({ok:true})});
  await client.load('x','url');assert.equal(client.get('x').data.ok,true);
});
