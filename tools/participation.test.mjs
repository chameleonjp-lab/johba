import {loadI18n} from './test-i18n-helper.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=loadI18n(html); const t=i18n.t;
function titleSetup(saved='',denied=false) {
  const nodes=new Map(); let starts=0;
  for(const id of ['playerName','btnStart','nameWarn']) nodes.set(id,{value:'',style:{},events:{},classList:{add(){},remove(){}},focus(){},addEventListener(n,cb){this.events[n]=cb;}});
  const localStorage={getItem(){if(denied)throw Error('blocked');return saved;},setItem(k,v){if(denied)throw Error('blocked');saved=v;}};
  const code=html.slice(html.indexOf('  // ── Title screen + name input'),html.indexOf("  document.getElementById('btnRules').addEventListener"));
  vm.runInNewContext(code,{t,document:{getElementById:id=>nodes.get(id)},localStorage,audioCtx:{},initAudio(){},goToCondScreen(){starts++;},beginRankingPlay(){}});
  return {nodes,starts:()=>starts};
}
test('empty and whitespace names can start a race',()=>{
  for(const value of ['', '   ']) {const s=titleSetup();s.nodes.get('playerName').value=value;s.nodes.get('btnStart').events.click({});assert.equal(s.starts(),1);}
});
test('name persistence denial cannot block home or input',()=>{
  const s=titleSetup('',true);s.nodes.get('playerName').value='騎手';assert.doesNotThrow(()=>s.nodes.get('playerName').events.input({}));s.nodes.get('btnStart').events.click({});assert.equal(s.starts(),1);
});
test('IME composition confirmation does not start a race',()=>{
  const s=titleSetup('騎手');s.nodes.get('playerName').events.compositionstart?.({});s.nodes.get('btnStart').events.click({});assert.equal(s.starts(),0);
  s.nodes.get('playerName').events.compositionend?.({});s.nodes.get('btnStart').events.click({});assert.equal(s.starts(),1);
});
test('result title uses stable start outcome, not translated display label',()=>{
  const code=html.slice(html.indexOf('  function generateResultTitle('),html.indexOf('  // ── Finish/result screen'));
  const ctx={t,lastStartOutcome:'good',lastStartLabel:'Good start'};vm.createContext(ctx);vm.runInContext(code,ctx);
  const state={playerStats:{staminaAtFinish:.3,blockedTime:0,kakariTime:0},field:[{style:'senko'}],playerIndex:0};
  assert.equal(ctx.generateResultTitle(state,1),'好発進の名騎手');ctx.lastStartOutcome='false';ctx.lastStartLabel='False start';assert.equal(ctx.generateResultTitle(state,5),'気が早い騎手');
});
