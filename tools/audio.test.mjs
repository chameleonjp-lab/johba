import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.split('// ==== SECTION: AUDIO ====')[1].split('// ==== SECTION: UI-SCREENS ====')[0];
function setup(saved={},denied=false){
 const elements=new Map();const listeners={};let contexts=0;
 const parameter=()=>({value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;}});
 const node=()=>({gain:parameter(),frequency:parameter(),Q:parameter(),connect(){},disconnect(){this.disconnected=true;},start(){},stop(at){if(at===undefined&&this.onended)this.onended();}});
 class AudioContext {
  constructor(){contexts++;this.state='running';this.currentTime=0;this.sampleRate=8;this.destination={};}
  createGain(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}createOscillator(){return node();}
  createBuffer(){return {getChannelData:()=>new Float32Array(8)};}
  suspend(){this.state='suspended';return Promise.resolve();}resume(){this.state='running';return Promise.resolve();}
 }
 const document={hidden:false,addEventListener(k,v){listeners[k]=v;},getElementById(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',addEventListener(){}});return elements.get(id);}};
 const storage={getItem(k){if(denied)throw new Error('denied');return saved[k]??null;},setItem(k,v){if(denied)throw new Error('denied');saved[k]=v;}};
 const context=vm.createContext({document,localStorage:storage,window:{AudioContext},CONFIG:{SND_MASTER:.5,SND_GATE:.1},Math,Number,Set});
 vm.runInContext(code+';globalThis.api={setSound,setSoundVolume,initAudio,playGate,state:()=>({on:soundOn,volume:soundVolume,active:activeSoundNodes.size,gain:masterGain?.gain.value})};',context);
 return {api:context.api,document,listeners,saved,contexts:()=>contexts};
}
test('initial sound is on at nonzero volume; audio is deferred',()=>{const x=setup();assert.equal(x.api.state().on,true);assert.equal(x.api.state().volume,1);assert.equal(x.contexts(),0);});
test('saved off and volume zero remain valid across reload',()=>{const saved={johba_sound:'off',johba_volume:'0'};for(let i=0;i<2;i++){const x=setup(saved);x.api.initAudio();assert.equal(x.api.state().on,false);assert.equal(x.api.state().volume,0);assert.equal(x.contexts(),0);}});
test('first action off does not initialize or resume audio',()=>{const x=setup();x.api.setSound(false);assert.equal(x.contexts(),0);assert.equal(x.saved.johba_sound,'off');});
test('volume persists including zero without changing off preference',()=>{const x=setup({johba_sound:'off'});x.api.setSoundVolume(.35);assert.equal(x.saved.johba_volume,'0.35');assert.equal(x.api.state().on,false);x.api.setSound(true);assert.equal(x.api.state().gain,.175);x.api.setSoundVolume(0);assert.equal(x.api.state().gain,0);assert.equal(setup(x.saved).api.state().volume,0);});
test('denied storage does not prevent settings or audio',()=>{const x=setup({},true);x.api.setSound(false);x.api.setSoundVolume(.25);x.api.setSound(true);assert.equal(x.api.state().gain,.125);});
test('hide stops scheduled effects; muted return never resumes them',()=>{const x=setup();x.api.setSound(true);x.api.playGate();assert.equal(x.api.state().active,2);x.document.hidden=true;x.listeners.visibilitychange();assert.equal(x.api.state().active,0);x.api.setSound(false);x.document.hidden=false;x.listeners.visibilitychange();x.api.playGate();assert.equal(x.api.state().active,0);});
test('invalid saved volumes use the existing nonzero default',()=>{for(const value of ['','NaN','-1','2'])assert.equal(setup({johba_volume:value}).api.state().volume,1);});
