import {loadI18n} from './test-i18n-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const i18n=loadI18n(html); const t=i18n.t;
const code=html.split('// ==== SECTION: AUDIO ====')[1].split('// ==== SECTION: UI-SCREENS ====')[0];
function setup(saved={},denied=false,deferEnded=false){
 const elements=new Map();const listeners={};let contexts=0;let resumes=0;
 const parameter=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
 const node=()=>({gain:parameter(),frequency:parameter(),Q:parameter(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(at){if(at===undefined&&!deferEnded&&this.onended)this.onended();}});
 class AudioContext {
  constructor(){contexts++;this.state='running';this.currentTime=0;this.sampleRate=8;this.destination={};}
  createGain(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}createOscillator(){return node();}
  createBuffer(){return {getChannelData:()=>new Float32Array(8)};}
  suspend(){this.state='suspended';return Promise.resolve();}resume(){resumes++;this.state='running';return Promise.resolve();}
 }
 const document={hidden:false,addEventListener(k,v){listeners[k]=v;},getElementById(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',addEventListener(){}});return elements.get(id);}};
 const storage={getItem(k){if(denied)throw new Error('denied');return saved[k]??null;},setItem(k,v){if(denied)throw new Error('denied');saved[k]=v;}};
 const context=vm.createContext({t,document,localStorage:storage,window:{AudioContext},CONFIG:{SND_MASTER:.5,SND_GATE:.1},Math,Number,Set});
 vm.runInContext(code+';globalThis.api={setSound,setSoundVolume,initAudio,playGate,playWhip,context:()=>audioCtx,state:()=>({on:soundOn,volume:soundVolume,active:activeSoundNodes.size,gain:masterGain?.gain.value})};',context);
 return {api:context.api,document,listeners,saved,contexts:()=>contexts,resumes:()=>resumes};
}
test('initial sound is on at nonzero volume; audio is deferred',()=>{const x=setup();assert.equal(x.api.state().on,true);assert.equal(x.api.state().volume,1);assert.equal(x.contexts(),0);});
test('saved off and volume zero remain valid across reload',()=>{const saved={johba_sound:'off',johba_volume:'0'};for(let i=0;i<2;i++){const x=setup(saved);x.api.initAudio();assert.equal(x.api.state().on,false);assert.equal(x.api.state().volume,0);assert.equal(x.contexts(),0);}});
test('first action off does not initialize or resume audio',()=>{const x=setup();x.api.setSound(false);assert.equal(x.contexts(),0);assert.equal(x.saved.johba_sound,'off');});
test('volume persists including zero without changing off preference',()=>{const x=setup({johba_sound:'off'});x.api.setSoundVolume(.35);assert.equal(x.saved.johba_volume,'0.35');assert.equal(x.api.state().on,false);x.api.setSound(true);assert.equal(x.api.state().gain,.175);x.api.setSoundVolume(0);assert.equal(x.api.state().gain,0);assert.equal(setup(x.saved).api.state().volume,0);});
test('denied storage does not prevent settings or audio',()=>{const x=setup({},true);x.api.setSound(false);x.api.setSoundVolume(.25);x.api.setSound(true);assert.equal(x.api.state().gain,.125);});
test('hide stops scheduled effects; muted return never resumes them',()=>{const x=setup();x.api.setSound(true);x.api.playGate();assert.equal(x.api.state().active,2);x.document.hidden=true;x.listeners.visibilitychange();assert.equal(x.api.state().active,0);x.api.setSound(false);x.document.hidden=false;x.listeners.visibilitychange();x.api.playGate();assert.equal(x.api.state().active,0);});
test('invalid saved volumes use the existing nonzero default',()=>{for(const value of ['','NaN','-1','2'])assert.equal(setup({johba_volume:value}).api.state().volume,1);});


test('rapid whip input has bounded sound creation without changing gameplay input',()=>{
 const x=setup();x.api.setSound(true);for(let i=0;i<100;i++)x.api.playWhip();assert.equal(x.api.state().active,2);
 x.api.context().currentTime=.1;x.api.playWhip();assert.equal(x.api.state().active,4);
});
test('interrupted audio clears scheduled cues and resumes only with an enabled user setting',()=>{
 const x=setup();x.api.setSound(true);x.api.playGate();assert.equal(x.api.state().active,2);
 const ctx=x.api.context();ctx.state='interrupted';ctx.onstatechange?.();assert.equal(x.api.state().active,0);
 x.api.playGate();assert.equal(x.api.state().active,0);x.api.initAudio();assert.equal(x.resumes(),1);
 x.api.setSound(false);ctx.state='interrupted';ctx.onstatechange?.();x.api.initAudio();assert.equal(x.resumes(),1);
});
test('resume throwing cannot block game-facing audio initialization',()=>{
 const x=setup();x.api.setSound(true);x.api.context().state='interrupted';let attempts=0;x.api.context().resume=()=>{attempts++;throw Error('denied');};assert.doesNotThrow(()=>x.api.initAudio());assert.equal(attempts,1);
});

test('interruption disconnects immediately even when the ended event is deferred',()=>{
 const x=setup({},false,true);x.api.setSound(true);x.api.playGate();assert.equal(x.api.state().active,2);
 const ctx=x.api.context();ctx.state='interrupted';ctx.onstatechange();assert.equal(x.api.state().active,0);
});
test('failed scheduled stop disconnects every allocated voice without leaking active entries',()=>{
 const x=setup();x.api.setSound(true);const ctx=x.api.context();const original=ctx.createOscillator.bind(ctx);const nodes=[];
 ctx.createBufferSource=ctx.createOscillator=()=>{const n=original();n.stop=()=>{throw Error('stop unavailable');};nodes.push(n);return n;};
 x.api.playGate();assert.equal(x.api.state().active,0);assert.ok(nodes.every(n=>n.disconnected));
});
test('delayed interruption notification clears old voices before gesture resume',()=>{
 const x=setup({},false,true);x.api.setSound(true);x.api.playGate();const ctx=x.api.context();ctx.state='interrupted';x.api.initAudio();assert.equal(x.api.state().active,0);
});

test('independent: closed context recreates and clears old voices on next enabled gesture',()=>{
 const x=setup({},false,true);x.api.setSound(true);x.api.playGate();const old=x.api.context();old.state='closed';x.api.initAudio();assert.notEqual(x.api.context(),old);assert.equal(x.api.state().active,0);
});
test('independent: partial allocation failure disconnects voice already created',()=>{
 const x=setup();x.api.setSound(true);const ctx=x.api.context();const original=ctx.createOscillator.bind(ctx);const made=[];
 ctx.createOscillator=()=>{const n=original();made.push(n);return n;};ctx.createGain=()=>{throw Error('allocation failed');};x.api.playGate();assert.ok(made.length>0);assert.ok(made.every(n=>n.disconnected));
});
