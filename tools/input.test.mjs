import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function setup(phase='running') {
 const listeners={};let sounds=0;
 const ctx={window:{addEventListener:(k,v)=>listeners[k]=v},racePhase:phase,currentInput:{},showLaneToast(){},vibe(){},playWhip(){sounds++;}};
 const code=html.slice(html.indexOf('    // Keyboard fallback'),html.indexOf('  setupInput();')).replace(/\n  }\s*$/,'');
 vm.runInNewContext(code,ctx);return {ctx,listeners,sounds:()=>sounds};
}
test('typing, IME, repeat, and non-running screens cannot trigger race input or whip sounds',()=>{
 for(const event of [{target:{tagName:'INPUT'}},{target:{tagName:'TEXTAREA'}},{target:{tagName:'SELECT'}},{target:{isContentEditable:true}},{isComposing:true},{keyCode:229},{repeat:true}]){
  const x=setup();x.listeners.keydown({key:'W',...event});assert.equal(x.sounds(),0);assert.equal(x.ctx.currentInput.whip,undefined);
 }
 for(const phase of ['idle','gate','finished']){const x=setup(phase);x.listeners.keydown({key:'W'});assert.equal(x.sounds(),0);}
});
test('desktop race controls still operate and release held input even after focus changes',()=>{
 const x=setup();x.listeners.keydown({key:'W'});assert.equal(x.sounds(),1);x.listeners.keydown({key:'ArrowUp'});assert.equal(x.ctx.currentInput.accel,true);x.listeners.keyup({key:'ArrowUp',target:{tagName:'INPUT'}});assert.equal(x.ctx.currentInput.accel,false);
});
