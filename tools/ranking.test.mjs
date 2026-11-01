import {loadI18n} from './test-i18n-helper.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=loadI18n(html); const t=i18n.t;
function setup(rpc=async()=>[{accepted:true}],store=new Map()) {
 const code=html.match(/\/\/ ==== PARTICIPATION-BEGIN ====([\s\S]*?)\/\/ ==== PARTICIPATION-END ====/)?.[1];
 assert.ok(code,'production participation controller exists');
 let n=0;const ctx={t,window:{addEventListener(){}},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`},localStorage:{get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},CONFIG:{GAME_SLUG:'johba',CLIENT_VERSION:'test'},supabaseRpc:rpc};vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,store};
}
test('anonymous play cannot become public after later home-name edit',async()=>{let calls=0;const {ctx}=setup(async()=>{calls++;});const p=ctx.createRankingPlay('   ');ctx.finalizeRankingPlay(p,123);await ctx.sendRankingPlay(p);assert.equal(calls,0);assert.equal(p.status,'anonymous');});
test('start-name and finalized score remain fixed, repeated submission uses one receipt',async()=>{
 const requests=[];const {ctx}=setup(async(fn,p)=>{requests.push([fn,{...p}]);return [{accepted:true}];});
 const p=ctx.createRankingPlay(' 騎手 ');ctx.finalizeRankingPlay(p,123);ctx.finalizeRankingPlay(p,999);await Promise.all([ctx.sendRankingPlay(p),ctx.sendRankingPlay(p)]);await ctx.sendRankingPlay(p);
 assert.equal(requests.length,1);assert.equal(requests[0][0],'submit_score_once_shared_v1');assert.equal(requests[0][1].p_display_name,'騎手');assert.equal(requests[0][1].p_score,123);assert.equal(p.status,'sent');
});
test('ambiguous failure retains score and retries identical receipt without legacy fallback',async()=>{
 const calls=[];const {ctx}=setup(async(fn,p)=>{calls.push([fn,JSON.stringify(p)]);if(calls.length===1)throw Error('timeout');return [{accepted:true,was_duplicate:true}];});const p=ctx.createRankingPlay('A');ctx.finalizeRankingPlay(p,456);await ctx.sendRankingPlay(p);assert.equal(p.status,'failed');await ctx.sendRankingPlay(p);assert.deepEqual(calls[0],calls[1]);assert.equal(p.status,'sent');
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
 const ctx={t,window:{addEventListener(){}},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},localStorage:{getItem:()=>null,setItem(){}},CONFIG:{GAME_SLUG:'johba',CLIENT_VERSION:'test'},supabaseRpc:rpc,document:{getElementById:id=>nodes.get(id),createElement:()=>({children:[],appendChild(c){this.children.push(c);}})}};
 const code=html.slice(html.indexOf('  function renderRanking('),html.indexOf('  // ── 結果称号'));
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,nodes};
}
test('integration snapshots home name at start, even if home input changes before finish',async()=>{
 const calls=[];const {ctx,nodes}=uiSetup(async(fn,p)=>{calls.push([fn,p]);return fn.startsWith('submit')?[{accepted:true}]:[];});
 nodes.get('playerName').value='Original';ctx.beginRankingPlay();nodes.get('playerName').value='Changed';await ctx.submitAndLoadRanking(50);
 assert.equal(calls[0][1].p_display_name,'Original');assert.equal(nodes.get('submitStatus').textContent,'ランキング送信完了');assert.equal(nodes.get('rankingBox').textContent,'まだ記録がありません');
});
test('integration hides stale ranking response when newer fetch completes first',async()=>{
 const pending=[];const {ctx,nodes}=uiSetup(()=>new Promise(resolve=>pending.push(resolve)));ctx.beginRankingPlay();const old=ctx.loadRanking();const newer=ctx.loadRanking();pending[1]([{rank_no:1,display_name:'new',score:4}]);await newer;pending[0]([{rank_no:1,display_name:'old',score:1}]);await old;assert.equal(nodes.get('rankingBox').children[0].children[1].textContent,'new');
});
test('ranking error exposes read-only retry without submitting a score',async()=>{
 let n=0;const {ctx,nodes}=uiSetup(async(fn)=>{assert.equal(fn,'get_best_score_ranking');if(n++===0)throw Error('offline');return [];});ctx.beginRankingPlay();await ctx.loadRanking();assert.equal(nodes.get('btnRankingRetry').hidden,false);await nodes.get('btnRankingRetry').events.click();assert.equal(nodes.get('rankingBox').textContent,'まだ記録がありません');
});
