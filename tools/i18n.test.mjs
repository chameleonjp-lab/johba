import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function setup(saved,browser=['ja-JP'],blocked=false) {
 const code=html.match(/\/\/ ==== I18N-CORE-BEGIN ====([\s\S]*?)\/\/ ==== I18N-CORE-END ====/)?.[1];assert.ok(code,'inline i18n core present');
 const store=new Map(saved?[['johba_language',saved]]:[]);const ctx={window:{},navigator:{languages:browser},localStorage:{getItem:k=>{if(blocked)throw Error('denied');return store.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('denied');store.set(k,v);}}};vm.createContext(ctx);vm.runInContext(code,ctx);return {api:ctx.window.JohbaI18n,store};
}
test('saved supported language overrides browser, all 15 exact IDs supported',()=>{
 const {api}=setup('de',['ja-JP']);assert.equal(api.language,'de');assert.deepEqual(Array.from(api.languages),['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th']);
});
test('region aliases map to supported languages; unsupported falls back to English',()=>{
 for(const [locale,expected]of [['pt-PT','pt-BR'],['zh-TW','zh-Hant'],['zh-CN','zh-Hans'],['en-AU','en'],['zz-ZZ','en']])assert.equal(setup(null,[locale]).api.language,expected);
});
test('storage denial does not block locale selection or runtime translation',()=>{
 const {api}=setup(null,['ja'],true);assert.equal(api.language,'ja');assert.doesNotThrow(()=>api.select('fr'));assert.equal(api.language,'fr');
});
test('chosen language persists using game-specific key and invalid IDs are rejected',()=>{
 const {api,store}=setup();api.select('vi');assert.equal(store.get('johba_language'),'vi');api.select('bad');assert.equal(api.language,'vi');
});
test('home exposes a language selector and translated consent/help/share controls',()=>{
 assert.match(html,/<select[^>]*id="languageSelect"/);
 assert.match(html,/<select[^>]*data-i18n-label="language.label"/);
 for(const key of ['name.consent','rules.open','share.button','ranking.button'])assert.ok(html.includes(`data-i18n="${key}"`),key);
});
test('every supported locale contains the complete production dictionary with matching placeholders',()=>{
 const line=html.split('\n').find(line=>line.trim().startsWith('const dictionaries = '));
 const dictionaries=JSON.parse(line.trim().slice('const dictionaries = '.length,-1));
 const base=Object.keys(dictionaries.en).sort();
 const placeholders=s=>[...s.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(x=>x[1]).sort();
 for(const lang of setup().api.languages){
  assert.ok(dictionaries[lang],lang+' must not silently fall back to English');
  assert.deepEqual(Object.keys(dictionaries[lang]).sort(),base,lang);
  for(const key of base){assert.ok(dictionaries[lang][key].trim(),lang+':'+key);assert.deepEqual(placeholders(dictionaries[lang][key]),placeholders(dictionaries.en[key]),lang+':'+key);}
 }
 const source=html.split('\n').filter(line=>line.length<10000).join('\n');
 const keys=[...source.matchAll(/\bt\(['"]([^'"]+)['"]/g)].map(x=>x[1]).concat([...source.matchAll(/data-i18n(?:-placeholder|-label)?="([^"]+)"/g)].map(x=>x[1]));
 for(const key of keys)assert.ok(Object.hasOwn(dictionaries.en,key),key);
});
test('language UI is home-only and never starts/restarts a play or sends scores',()=>{
 const binding=html.slice(html.indexOf('  const api = window.JohbaI18n;'),html.indexOf('<script>\n(() => {\n  \'use strict\';'));
 const listeners={};const select={value:'',appendChild(){},addEventListener:(event,fn)=>listeners[event]=fn};
 const screen={style:{display:'none'}};const nodes=[{dataset:{i18n:'name.consent'},textContent:''}];const doc={documentElement:{},getElementById:id=>id==='languageSelect'?select:screen,createElement:()=>({}),querySelectorAll:q=>q==='[data-i18n]'?nodes:[]};
 const {api}=setup('ja');let events=0;
 vm.runInNewContext('(() => {\n'+binding.split('</script>')[0],{window:{JohbaI18n:api,dispatchEvent(){events++;}},document:doc,Event:class{}});
 select.value='en';listeners.change();assert.equal(api.language,'ja');assert.equal(events,0);
 screen.style.display='flex';select.value='en';listeners.change();assert.equal(api.language,'en');assert.equal(events,1);assert.equal(nodes[0].textContent,api.t('name.consent'));
});
