import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource, memoryStorage} from './load-source.mjs';
import {bindState} from './state-runtime.mjs';

const {default: worker, ApplicationState} = await loadSource('src/worker.ts');
const {issueAuthToken} = await loadSource('src/server/auth.ts');
const {normalizePlayer} = await loadSource('src/utils/player.ts');
const staff = await issueAuthToken('staff-test', 0, 'streamer');
const admin = await issueAuthToken('admin-test', 0, 'admin');
function runtime() {
  const legacy = new Map();
  const env = {STREAMER_PASSWORD:'staff-test',ADMIN_PASSWORD:'admin-test',
    ASSETS:{fetch:async()=>new Response('asset')},
    ROSTER:{get:async key=>structuredClone(legacy.get(key)??null),put:async(key,value)=>legacy.set(key,JSON.parse(value))},
  };
  const state=bindState(ApplicationState,env);
  async function call(path,body,{token,method=body===undefined?'GET':'POST',cookie,device='device-test',ip='192.0.2.1'}={}) {
    const response=await worker.fetch(new Request(`https://test.invalid${path}`,{method,headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,'X-Device-Id':device,...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:response.status,data:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0]};
  }
  return {env,legacy,...state,call};
}
const input = n => ({name:`viewer${n}`,riotName:`riot${n}`,riotTag:'KR1'});
const board = () => ({waitlist:[],team1:[],team2:[],matchMapId:null,attackSide:null,balanceNote:null,balanceDetails:[]});

test('concurrent login attempts and revoke password checks share the limit',async()=>{
  const r=runtime();
  const results=await Promise.all(Array.from({length:20},()=>r.call('/api/auth/login',{password:'wrong'})));
  assert.equal(results.filter(r=>r.status===401).length,8);
  assert.equal(results.filter(r=>r.status===429).length,12);
  assert.equal((await r.call('/api/auth/revoke-all',{password:'wrong'})).status,429);
});
test('concurrent joins preserve every accepted ticket and enforce the IP limit',async()=>{
  const r=runtime();
  const results=await Promise.all(Array.from({length:20},(_,n)=>r.call('/api/join',input(n))));
  assert.equal(results.filter(r=>r.status===200).length,12);
  assert.equal(results.filter(r=>r.status===429).length,8);
  assert.equal(r.read('join-queue').items.length,12);
  assert.equal(new Set(r.read('join-queue').items.map(v=>v.queueNo)).size,12);
});
test('concurrent duplicate requests cannot create orphan successful tickets',async()=>{
  const r=runtime();
  const results=await Promise.all([r.call('/api/join',input(1)),r.call('/api/join',input(1))]);
  assert.deepEqual(results.map(v=>v.status),[200,409]);
  assert.equal(r.read('join-queue').items.length,1);
});
test('public identity cannot rename a player or bypass approval; approved browser can rejoin',async()=>{
  const r=runtime();
  const person=normalizePlayer({id:'saved',name:'original',riotName:'riot1',riotTag:'KR1'});
  r.legacy.set('shared-roster',{updatedAt:1,players:[person]});
  const submitted=await r.call('/api/join',input(1));
  assert.equal(submitted.data.autoJoined,false);
  assert.equal(r.read('shared-roster').players[0].name,'original');
  assert(submitted.cookie);
  const approved=await r.call(`/api/join/${submitted.data.application.id}/approve`,undefined,{token:staff,method:'POST'});
  assert.equal(approved.status,200);
  assert.equal(r.read('shared-board').waitlist.length,1);
  const revision=r.read('shared-board').updatedAt;
  assert.equal((await r.call('/api/board',{...board(),baseUpdatedAt:revision},{token:staff,method:'PUT'})).status,200);
  const repeat=await r.call('/api/join',input(1),{cookie:submitted.cookie});
  assert.equal(repeat.data.autoJoined,true);
});
test('approval is idempotent and commits roster, board and ticket together',async()=>{
  const r=runtime();
  const submitted=await r.call('/api/join',input(1));
  const path=`/api/join/${submitted.data.application.id}/approve`;
  const results=await Promise.all([r.call(path,undefined,{token:staff,method:'POST'}),r.call(path,undefined,{token:staff,method:'POST'})]);
  assert(results.every(v=>v.status===200));
  assert.equal(results[0].data.player.id,results[1].data.player.id);
  assert.equal(r.read('shared-roster').players.length,1);
  assert.equal(r.read('shared-board').waitlist.length,1);
  assert.equal(r.read('join-queue').items.length,0);
});
test('stale writes conflict; future dates, duplicate IDs, overfull teams and malformed inputs are rejected',async()=>{
  const r=runtime();
  const p=normalizePlayer({id:'p'});
  const results=await Promise.all([r.call('/api/roster',{players:[p],baseUpdatedAt:0},{token:staff,method:'PUT'}),r.call('/api/roster',{players:[],baseUpdatedAt:0},{token:staff,method:'PUT'})]);
  assert.deepEqual(results.map(v=>v.status),[200,409]);
  assert.equal(r.read('shared-roster').players.length,1);
  assert.equal((await r.call('/api/roster',{players:[],updatedAt:Date.now()+86400000},{token:staff,method:'PUT'})).status,400);
  for(const body of [{...board(),team1:[p],team2:[p]}, {...board(),team1:Array.from({length:6},(_,n)=>({...p,id:`p${n}`}))}]) {
    assert.equal((await r.call('/api/board',body,{token:staff,method:'PUT'})).status,400);
  }
  for(const body of [null,{password:123}])assert.equal((await r.call('/api/auth/login',body)).status,400);
  assert.equal((await r.call('/api/join',{...input(1),name:'x'.repeat(600000)})).status,413);
  assert.equal((await r.call('/api/join/status/%ZZ')).status,400);
});
test('authorization remains enforced and trusted device IDs alone cannot bypass revocation',async()=>{
  const r=runtime();
  assert.equal((await r.call('/api/roster',{players:[]},{method:'PUT'})).status,401);
  assert.equal((await r.call('/api/site-settings',{viewerAccessOpen:false},{token:staff,method:'PUT'})).status,401);
  const trusted=await r.call('/api/auth/trust-device',{deviceId:'device-test'},{token:admin});
  assert.equal(trusted.status,200); assert(trusted.cookie);
  assert(trusted.data.devices.every(v=>!('proof' in v)));
  await r.call('/api/auth/revoke-all',{password:'admin-test'});
  assert.equal((await r.call('/api/roster',{players:[]},{token:staff,method:'PUT'})).status,401);
  assert.equal((await r.call('/api/roster',{players:[]},{token:staff,method:'PUT',cookie:trusted.cookie})).status,200);
});
test('expired participation, malformed storage and rapid results are safe',async()=>{
  const {readPlayAts}=await loadSource('src/utils/playCount.ts');
  assert.deepEqual(readPlayAts({playAts:[Date.now()-25*3600000],playCount:1}),[]);
  const {hydrateLibrary}=await loadSource('src/store/persistence.ts');
  assert.deepEqual(hydrateLibrary({players:{}}).players,[]);
  globalThis.localStorage=memoryStorage();
  localStorage.setItem('valorant-balancer-storage','{');
  const {useAppStore}=await loadSource('src/store/useAppStore.ts');
  assert(useAppStore.persist.hasHydrated());
  const a=normalizePlayer({id:'a'}),b=normalizePlayer({id:'b'});
  useAppStore.setState({players:[a,b],team1:[a],team2:[b],waitlist:[]});
  for(let n=0;n<10;n++)useAppStore.getState().recordTeamResult('TEAM_1');
  assert.equal(useAppStore.getState().team1[0].wins,1);
  assert.equal(useAppStore.getState().team1[0].playCount,1);
});
test('failed weighted group draw retries a feasible 5v5 selection',async()=>{
  const api=await loadSource('src/utils/balance.ts');
  let n=0;
  const groups=[3,3,3,2,2].map(size=>Array.from({length:size},()=>normalizePlayer({id:`p${n++}`})));
  for(const group of groups)for(const p of group)p.allyIds=group.filter(v=>v!==p).map(v=>v.id);
  api.setBalanceRandom(()=>0);
  const result=api.autoBalanceTeams([],[],groups.flat());
  assert(result.ok); assert.equal(result.team1.length,5); assert.equal(result.team2.length,5);
  assert.equal(new Set([...result.team1,...result.team2,...result.waitlist].map(v=>v.id)).size,13);
});
