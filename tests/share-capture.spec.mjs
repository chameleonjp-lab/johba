import {test, expect} from '@playwright/test';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const origin = 'https://johba.test';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const threeRoot = new URL('../node_modules/three/build/', import.meta.url);
const instrument = `\nwindow.shareCapture={get phase(){return racePhase},get state(){return {horses:raceState?.horses.length,phase:racePhase}},frame(){renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png')}};\n`;

test('anonymous real race renderer capture without external communication', async ({browser}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One fixed renderer source; visible share regression covers both engines separately.');
  const context = await browser.newContext({viewport:{width:1200,height:630},deviceScaleFactor:1,serviceWorkers:'block'});
  const unexpected = [], errors = [];
  await context.routeWebSocket('**/*', ws => { unexpected.push('websocket'); ws.close(); });
  await context.route('**/*', route => {
    const request=route.request(), url=new URL(request.url());
    if(!['GET','HEAD'].includes(request.method())){unexpected.push(request.method()+' '+url.pathname);return route.abort();}
    if(url.origin===origin && url.pathname==='/')return route.fulfill({contentType:'text/html',body:html.replace("  import * as THREE from 'three';", "  import * as THREE from 'three';"+instrument)});
    if(url.origin==='https://cdn.jsdelivr.net' && ['/npm/three@0.184.0/build/three.module.js','/npm/three@0.184.0/build/three.core.js'].includes(url.pathname))return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'text/javascript',body:readFileSync(new URL(url.pathname.split('/').pop(),threeRoot))});
    if(url.origin===origin && url.pathname==='/favicon.ico')return route.fulfill({status:204});
    unexpected.push(request.method()+' '+url.origin+url.pathname);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('johba_language','ja');localStorage.setItem('johba_sound','off');localStorage.setItem('johba_volume','0');localStorage.setItem('johba_hint_done','1');});
  await page.goto(origin);await page.waitForFunction(()=>window.shareCapture);await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#playerName')).toHaveValue('');
  await page.locator('#btnStart').click();await page.locator('#btnGoEntries').click();
  for(let i=0;i<3;i++)await page.locator('#check_'+i).click();
  await page.locator('#btnApply').click();await expect(page.locator('#btnGoGate')).toBeVisible({timeout:20000});await page.locator('#btnGoGate').click();
  await expect.poll(()=>page.evaluate(()=>shareCapture.phase),{timeout:15000}).toBe('running');
  await page.waitForTimeout(2500);
  const frame=await page.evaluate(()=>({png:shareCapture.frame(),state:shareCapture.state}));
  expect(frame.state.horses).toBe(12);expect(frame.state.phase).toBe('running');
  const bytes=Buffer.from(frame.png.split(',')[1],'base64');expect(bytes.length).toBeGreaterThan(10000);
  mkdirSync('test-results/share-capture',{recursive:true});writeFileSync('test-results/share-capture/johba-real-race.png',bytes);
  writeFileSync('test-results/share-capture/receipt.json',JSON.stringify({source:'actual race renderer; no renderer/score/name modifications',viewport:{width:1200,height:630},state:frame.state,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),externalRequests:unexpected,pageErrors:errors},null,2));
  expect(unexpected).toEqual([]);expect(errors).toEqual([]);await context.close();
});
