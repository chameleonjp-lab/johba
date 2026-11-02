import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {inspectShareTarget} from './helpers/share-visibility.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const origin='https://johba.test', publicURL='https://chameleonjp.codeberg.page/johba/';
const langs=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
const instrument=`\nwindow.shareVisible={finish(){const rng=makeRng(17);const cond=createRaceConditions(rng,{distance:1200});const field=generateField(rng,cond);const state=createRaceState(field,cond,rng,-1);for(let i=0;i<24000&&state.finishedCount<field.length;i++)stepRace(state,1/60,null);state.playerIndex=0;showFinishScreen(state);return {rank:state.results.find(r=>r.index===0)?.rank??state.finishedCount,score:activeRankingPlay?.score,distance:state.cond.distance}},homeText(){return t('share.home',{url:GAME_PUBLIC_URL})}};\n`;
async function setup(browser,lang,viewport){
 const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'}), bad=[], errors=[];
 await context.routeWebSocket('**/*',ws=>{bad.push('websocket');ws.close()});
 await context.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.includes('/rest/v1/rpc/')){
   // Actual ranking method is pinned below; no score POST can reach the network.
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'apikey,authorization,content-type'}});
   if(req.method()==='POST'&&url.pathname.endsWith('/get_best_score_ranking'))return route.fulfill({json:[],headers:{'access-control-allow-origin':'*'}});
   bad.push(req.method()+' '+url.pathname);return route.abort();
  }
  if(!['GET','HEAD'].includes(req.method())){bad.push(req.method()+' '+url.pathname);return route.abort();}
  if(url.origin===origin&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:html.replace("  import * as THREE from 'three';","  import * as THREE from 'three';"+instrument)});
  if(url.origin==='https://cdn.jsdelivr.net'&&['/npm/three@0.184.0/build/three.module.js','/npm/three@0.184.0/build/three.core.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:readFileSync(new URL('../node_modules/three/build/'+url.pathname.split('/').pop(),import.meta.url))});
  if(url.origin===origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204});
  bad.push(req.method()+' '+url.origin+url.pathname);return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(lang=>{localStorage.setItem('johba_language',lang);localStorage.setItem('johba_sound','off');localStorage.setItem('johba_volume','0');window.shareOpens=[];window.open=()=>({opener:null,location:{replace(url){window.shareOpens.push(url)}}});},lang);
 await page.goto(origin);await page.waitForFunction(()=>window.shareVisible);await expect(page.locator('#splash')).toHaveCount(0);
 return{context,page,bad,errors};
}
async function visibleX(page,id){
 const b=page.locator(id);await b.scrollIntoViewIfNeeded();await expect(b).toBeVisible();await expect(b).toHaveCSS('background-color','rgb(0, 0, 0)');await expect(b).toHaveCSS('color','rgb(255, 255, 255)');
 const g=await b.evaluate(inspectShareTarget);
 expect(g.width).toBeGreaterThanOrEqual(44);expect(g.height).toBeGreaterThanOrEqual(44);expect(g.visible).toBe(true);expect(g.viewport).toBe(true);expect(g.unclipped).toBe(true);expect(g.hit).toBe(true);expect(g.fits).toBe(true);return b;
}
for(const lang of langs)for(const orientation of ['portrait',...(['ja','en','de'].includes(lang)?['landscape']:[])])test(`${lang} ${orientation}: home/result X text and touch target`,async({browser},testInfo)=>{
 const viewport=orientation==='portrait'?{width:393,height:852}:{width:852,height:393};const {context,page,bad,errors}=await setup(browser,lang,viewport);
 let finalResult;
 for(const screen of ['home','result']){
  if(screen==='result'){await page.locator('#btnStart').click();finalResult=await page.evaluate(()=>shareVisible.finish());await expect(page.locator('#screenResult')).toBeVisible();}
  const id=screen==='home'?'#btnShare':'#btnShare2', b=await visibleX(page,id);await expect(b).toHaveText(await page.evaluate(()=>JohbaI18n.t('share.button')));
  const expected=await page.evaluate(screen=>screen==='home'?shareVisible.homeText():document.querySelector('#btnShare2').dataset.shareText,screen);
  if(screen==='result'){expect(Number.isFinite(finalResult.score)).toBe(true);expect(expected).toBe(await page.evaluate(values=>JohbaI18n.t('share.result',values),{...finalResult,url:publicURL}));}
  expect(expected.endsWith('\n#ジョーバ #ゲーム制作')).toBe(true);expect(expected).toContain(publicURL);
  const beforeScore=await page.locator('#resultScore').textContent(), before=await page.evaluate(()=>shareOpens.length);
  if(['ja','en','de'].includes(lang)){mkdirSync('test-results/share-visible',{recursive:true});await page.screenshot({path:`test-results/share-visible/${testInfo.project.name}-${lang}-${orientation}-${screen}.png`});}
  await b.tap();await expect.poll(()=>page.evaluate(()=>shareOpens.length)).toBe(before+1);
  const intent=new URL(await page.evaluate(()=>shareOpens.at(-1)));expect(intent.origin).toBe('https://x.com');expect(intent.pathname).toBe('/intent/post');expect(intent.searchParams.get('text')).toBe(expected);
  expect(await page.locator('#resultScore').textContent()).toBe(beforeScore);await expect(page.locator('#commonShareFallback')).not.toBeVisible();
 }
 expect(bad).toEqual([]);expect(errors).toEqual([]);await context.close();
});
