import {loadI18n} from './test-i18n-helper.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=loadI18n(html); const t=i18n.t;
function receipt(name='A',score=123,duplicate=false) {return [{accepted:true,result_normalized_name:name,result_display_name:name,result_first_score:score,result_best_score:score,result_play_count:1,is_first_play:!duplicate,is_new_best:!duplicate,was_duplicate:duplicate}];}
function setup(rpc=async(_,p)=>receipt(p.p_display_name,p.p_score),store=new Map()) {
 const code=html.match(/\/\/ ==== PARTICIPATION-BEGIN ====([\s\S]*?)\/\/ ==== PARTICIPATION-END ====/)?.[1];
 assert.ok(code,'production participation controller exists');
 let n=0;const ctx={t,window:{addEventListener(){}},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`},localStorage:{get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},CONFIG:{GAME_SLUG:'johba',CLIENT_VERSION:'test'},supabaseRpc:rpc};vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,store};
}
test('anonymous play cannot become public after later home-name edit',async()=>{let calls=0;const {ctx}=setup(async()=>{calls++;});const p=ctx.createRankingPlay('   ');ctx.finalizeRankingPlay(p,123);await ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(p.status,'anonymous');});
test('start-name and finalized score remain fixed, repeated submission uses one receipt',async()=>{
 const requests=[];const {ctx}=setup(async(fn,p)=>{requests.push([fn,{...p}]);return receipt(p.p_display_name,p.p_score);});
 const p=ctx.createRankingPlay(' 騎手 ');ctx.finalizeRankingPlay(p,123);ctx.finalizeRankingPlay(p,999);await Promise.all([ctx.sendRankingPlay(p),ctx.sendRankingPlay(p)]);await ctx.sendRankingPlay(p);
 assert.equal(requests.length,1);assert.equal(requests[0][0],'submit_score_once_shared_v1');assert.equal(requests[0][1].p_display_name,'騎手');assert.equal(requests[0][1].p_score,123);assert.equal(p.status,'sent');
});
test('ambiguous failure retains score and retries identical receipt without legacy fallback',async()=>{
 const calls=[];const {ctx}=setup(async(fn,p)=>{calls.push([fn,JSON.stringify(p)]);if(calls.length===1)throw Error('timeout');return receipt(p.p_display_name,p.p_score,true);});const p=ctx.createRankingPlay('A');ctx.finalizeRankingPlay(p,456);await ctx.sendRankingPlay(p);assert.equal(p.status,'failed');await ctx.sendRankingPlay(p);assert.deepEqual(calls[0],calls[1]);assert.equal(p.status,'sent');
});
test('receipt rejection cannot be shown as successful and reload retains same frozen payload',async()=>{
 const {ctx,store}=setup(async()=>[{accepted:false}]);const p=ctx.createRankingPlay('A');ctx.finalizeRankingPlay(p,400);await ctx.sendRankingPlay(p);assert.notEqual(p.status,'sent');
 const next=setup(undefined,store).ctx;const restored=next.restoreRankingPlay(p.id);assert.equal(restored.id,p.id);assert.equal(restored.name,'A');assert.equal(restored.score,400);assert.ok(Object.keys(JSON.parse(store.get('johba_score_receipt_v1:'+p.id))).includes('score'));
});
test('wrong-game or mismatched ID disk records are never restored',()=>{
 const {ctx,store}=setup();const p=ctx.createRankingPlay('A');ctx.finalizeRankingPlay(p,5);let data=JSON.parse(store.get('johba_score_receipt_v1:'+p.id));data.id='bad';store.set('johba_score_receipt_v1:'+p.id,JSON.stringify(data));assert.equal(setup(undefined,store).ctx.restoreRankingPlay(p.id),null);
});
test('reload lists finalized records without sending and ignores unrelated game storage',()=>{
 const {ctx,store}=setup();const p=ctx.createRankingPlay('A');ctx.finalizeRankingPlay(p,5);store.set('other-game:record',JSON.stringify(p));
 const reload=setup(async()=>{assert.fail('must never auto-submit restored records');},store).ctx;
 assert.equal(typeof reload.listRankingPlays,'function');const rows=reload.listRankingPlays();assert.equal(rows.length,1);assert.equal(rows[0].id,p.id);assert.equal(rows[0].score,5);
});
test('empty ranking is not a transport failure; matching names do not claim identity',()=>{
 const code=html.slice(html.indexOf('  function renderRanking('),html.indexOf('  // ==== PARTICIPATION-BEGIN'));
 const box={children:[],textContent:'',set innerHTML(v){this.children=[];},appendChild(c){this.children.push(c);}};
 const ctx={t,window:{addEventListener(){}},document:{getElementById:()=>box,createElement:()=>({children:[],appendChild(c){this.children.push(c);}})}};vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.renderRanking([],'A');assert.equal(box.textContent,'まだ記録がありません');
 ctx.renderRanking([{rank_no:1,display_name:'A',score:99}],'A');assert.equal(box.children[0].className,'rank-row');
});
function uiSetup(rpc) {
 const nodes=new Map();for(const id of ['playerName','submitStatus','rankingBox','btnSubmitRetry','btnRankingRetry','savedResultList'])nodes.set(id,{replaceChildren(){this.children=[];this.textContent='';},value:'',textContent:'',children:[],hidden:false,events:{},set innerHTML(v){this.children=[];},appendChild(c){this.children.push(c);},addEventListener(e,fn){this.events[e]=fn;}});
 const disk=new Map();const ctx={t,window:{addEventListener(){}},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},localStorage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)},CONFIG:{GAME_SLUG:'johba',CLIENT_VERSION:'test'},supabaseRpc:rpc,document:{getElementById:id=>nodes.get(id),createElement:()=>({children:[],appendChild(c){this.children.push(c);}})}};
 const code=html.slice(html.indexOf('  function renderRanking('),html.indexOf('  // ── 結果称号'));
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,nodes};
}
test('integration snapshots home name at start, even if home input changes before finish',async()=>{
 const calls=[];const {ctx,nodes}=uiSetup(async(fn,p)=>{calls.push([fn,p]);return fn.startsWith('submit')?receipt(p.p_display_name,p.p_score):[];});
 nodes.get('playerName').value='Original';ctx.beginRankingPlay();nodes.get('playerName').value='Changed';await ctx.submitAndLoadRanking(50);
 assert.equal(calls[0][1].p_display_name,'Original');assert.equal(nodes.get('submitStatus').textContent,'ランキング送信完了');assert.equal(nodes.get('rankingBox').textContent,'まだ記録がありません');
});
test('integration hides stale ranking response when newer fetch completes first',async()=>{
 const pending=[];const {ctx,nodes}=uiSetup(()=>new Promise(resolve=>pending.push(resolve)));ctx.beginRankingPlay();const old=ctx.loadRanking();const newer=ctx.loadRanking();pending[1]([{rank_no:1,display_name:'new',score:4}]);await newer;pending[0]([{rank_no:1,display_name:'old',score:1}]);await old;assert.equal(nodes.get('rankingBox').children[0].children[1].textContent,'new');
});
test('ranking error exposes read-only retry without submitting a score',async()=>{
 let n=0;const {ctx,nodes}=uiSetup(async(fn)=>{assert.equal(fn,'get_best_score_ranking');if(n++===0)throw Error('offline');return [];});ctx.beginRankingPlay();await ctx.loadRanking();assert.equal(nodes.get('btnRankingRetry').hidden,false);await nodes.get('btnRankingRetry').events.click();assert.equal(nodes.get('rankingBox').textContent,'まだ記録がありません');
});
test('late retry with absent or unfinished active play is a no-op without any RPC',async()=>{
 let calls=0;const {ctx,nodes}=uiSetup(async()=>{calls++;return [];});
 for(const value of ['null','undefined','{score:null}','{score:undefined}']){
  vm.runInContext('activeRankingPlay = '+value,ctx);
  assert.doesNotThrow(()=>nodes.get('btnSubmitRetry').events.click(),value);
 }
 nodes.get('playerName').value='Rider';ctx.beginRankingPlay();
 vm.runInContext('activeRankingPlay = null',ctx); // Home clears the active result before a queued click arrives.
 assert.doesNotThrow(()=>nodes.get('btnSubmitRetry').events.click());
 await Promise.resolve();assert.equal(calls,0);
});

test('quota failure forbids transmission until durable retry succeeds',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return [{accepted:true}];});const p=s.ctx.createRankingPlay('A');
 s.ctx.localStorage.setItem=()=>{throw Error('quota');};s.ctx.finalizeRankingPlay(p,12);await s.ctx.sendRankingPlay(p);
 assert.equal(calls,0);assert.equal(p.status,'failed');assert.equal(p.persisted,false);
});
test('silent storage readback mismatch forbids transmission',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return [{accepted:true}];});s.ctx.localStorage.setItem=()=>{};
 const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,12);await s.ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(p.persisted,false);
});
test('malformed or incomplete TABLE receipt stays retryable with same UUID',async()=>{
 for(const value of [{accepted:true},[{accepted:true}],[],[{accepted:false}],null]){
 const requests=[];const s=setup(async(_,p)=>{requests.push(p.p_submission_id);return value;});const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,12);
 await s.ctx.sendRankingPlay(p);assert.equal(p.status,'failed');await s.ctx.sendRankingPlay(p);assert.deepEqual(requests,[p.id,p.id]);
 }
});
test('retry after quota recovery transmits same frozen payload and persists sent tombstone',async()=>{
 const calls=[];const s=setup(async(_,p)=>{calls.push({...p});return receipt(p.p_display_name,p.p_score);});const original=s.ctx.localStorage.setItem;
 s.ctx.localStorage.setItem=()=>{throw Error('quota');};const p=s.ctx.createRankingPlay(' A ');s.ctx.finalizeRankingPlay(p,321);await s.ctx.sendRankingPlay(p);s.ctx.localStorage.setItem=original;await s.ctx.sendRankingPlay(p);assert.equal(calls.length,1);assert.equal(calls[0].p_submission_id,p.id);assert.equal(p.status,'sent');assert.equal(JSON.parse(s.store.get('johba_score_receipt_v1:'+p.id)).status,'sent');
});
test('same UUID different stored payload is retained and never sent',async()=>{
 let calls=0;const s=setup(async()=>{calls++;});const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,21);const key='johba_score_receipt_v1:'+p.id;const data=JSON.parse(s.store.get(key));data.score=99;const raw=JSON.stringify(data);s.store.set(key,raw);await s.ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(s.store.get(key),raw);assert.equal(p.persisted,false);
});
test('sent tombstone wins over a stale in-memory failed receipt',async()=>{
 let calls=0;const s=setup(async()=>{calls++;});const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,21);const key='johba_score_receipt_v1:'+p.id;const data=JSON.parse(s.store.get(key));data.status='sent';s.store.set(key,JSON.stringify(data));await s.ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(p.status,'sent');
});
test('wrong name, counts, field types, and impossible best score cannot confirm receipt',async()=>{
 for(const patch of [{result_display_name:'Other'},{result_normalized_name:'Other'},{result_play_count:0},{result_play_count:1.5},{was_duplicate:'true'},{result_best_score:11},{result_first_score:null}]){
 const s=setup(async()=>[{...receipt('A',12)[0],...patch}]);const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,12);await s.ctx.sendRankingPlay(p);assert.equal(p.status,'failed');
 }
});
test('actual best-score TABLE contract renders best_score and preserves tied ranks',()=>{
 const {ctx,nodes}=uiSetup(async()=>[]);ctx.renderRanking([{rank_no:1,display_name:'A',first_score:10,best_score:123,play_count:3},{rank_no:1,display_name:'B',first_score:20,best_score:123,play_count:2}]);
 assert.equal(nodes.get('rankingBox').children[0].children[2].textContent,'123点');assert.equal(nodes.get('rankingBox').children[1].children[0].textContent,'1位');
});

test('independent: same UUID new start must not hide the old stored result',()=>{
 const s=setup();const a=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(a,21);
 s.ctx.crypto.randomUUID=()=>a.id;const b=s.ctx.createRankingPlay('B');s.ctx.finalizeRankingPlay(b,99);
 const rows=s.ctx.listRankingPlays();assert.ok(rows.some(p=>p.name==='A'&&p.score===21),'old A remains available');
});
test('independent: acknowledged result retries persistence without another RPC',async()=>{
 let calls=0;const s=setup(async()=>{calls++;s.ctx.localStorage.setItem=()=>{throw Error('quota after ACK');};return receipt('A',21);});
 const write=s.ctx.localStorage.setItem;const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,21);await s.ctx.sendRankingPlay(p);
 assert.equal(p.status,'sent');assert.equal(p.persisted,false);s.ctx.localStorage.setItem=write;await s.ctx.sendRankingPlay(p);
 assert.equal(calls,1);assert.equal(JSON.parse(s.store.get('johba_score_receipt_v1:'+p.id)).status,'sent');
});

test('independent: restored contradictory anonymous receipt cannot become public',async()=>{
 let calls=0;const s=setup(async()=>{calls++;return receipt('A',21);});const id='00000000-0000-4000-8000-000000000001';
 const raw=JSON.stringify({id,game:'johba',name:'A',version:'test',score:21,status:'anonymous',persisted:true});s.store.set('johba_score_receipt_v1:'+id,raw);
 const p=s.ctx.restoreRankingPlay(id);await s.ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(s.store.get('johba_score_receipt_v1:'+id),raw);
});
test('temporary storage read denial keeps generated UUID for later safe save',async()=>{
 const s=setup();const read=s.ctx.localStorage.getItem;s.ctx.localStorage.getItem=()=>{throw Error('blocked read');};const p=s.ctx.createRankingPlay('A');s.ctx.finalizeRankingPlay(p,21);assert.ok(p.id);s.ctx.localStorage.getItem=read;await s.ctx.sendRankingPlay(p);assert.equal(p.status,'sent');
});
