import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadI18n} from './test-i18n-helper.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const url='https://chameleonjp.codeberg.page/johba/';
const tags='#ジョーバ #ゲーム制作';
// X weights URL entities as 23; Latin/general punctuation ranges as one, other codepoints as two.
function weight(value){return [...value.replace(/https?:\/\/[^\s]+/gu,'a'.repeat(23))].reduce((sum,char)=>{const n=char.codePointAt(0);return sum+((n<=0x10ff||(n>=0x2000&&n<=0x200d)||(n>=0x2010&&n<=0x201f)||(n>=0x2032&&n<=0x2037))?1:2)},0);}
test('15 languages retain official URL, truthful values, and exactly two final tags within 280 X weight',()=>{
 for(const lang of loadI18n(html).languages){
  const i=loadI18n(html,lang);
  for(const key of ['share.home','share.result']){
   const text=i.t(key,{url,distance:3200,rank:12,score:100000000});
   assert.ok(text.endsWith('\n'+tags),lang+' '+key+' official tag suffix');
   assert.equal(text.split(url).length,2);assert.ok(weight(text)<=280,lang+' '+key+' '+weight(text));
   assert.deepEqual(text.match(/#[^\s]+/gu),['#ジョーバ','#ゲーム制作']);
   if(key==='share.result'){assert.ok(text.includes('3200'));assert.ok(text.includes('12'));assert.ok(text.includes('100000000'));}
  }
 }
});
test('fixed actual-game PNG is wired as large OG and Twitter image with correct dimensions',()=>{
 for(const selector of ['property="og:image"','name="twitter:image"'])assert.ok(new RegExp('<meta '+selector+' content="https://chameleonjp\\.codeberg\\.page/johba/assets/social-card\\.png"').test(html),selector);
 assert.ok(/<meta name="twitter:card" content="summary_large_image"/.test(html));
 assert.ok(/<meta property="og:image:width" content="1200"/.test(html));assert.ok(/<meta property="og:image:height" content="630"/.test(html));
 const p=new URL('../assets/social-card.png',import.meta.url);assert.ok(existsSync(p));const b=readFileSync(p);assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),1200);assert.equal(b.readUInt32BE(20),630);
});

test('release staging contains the exact fixed PNG and index, not verification or development files',()=>{
 const root=mkdtempSync(join(tmpdir(),'johba-social-release-'));
 for(const dir of ['tools','assets'])mkdirSync(join(root,dir));
 for(const file of ['index.html','tools/check-site.py','assets/social-card.png']){
  const source=new URL('../'+file,import.meta.url);assert.ok(existsSync(source),file+' must exist before release');copyFileSync(source,join(root,file));
 }
 const result=spawnSync('python3',[join(root,'tools/check-site.py'),'--out',join(root,'_site')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(readdirSync(join(root,'_site')).sort(),['.nojekyll','assets','index.html']);
 assert.deepEqual(readdirSync(join(root,'_site/assets')),['social-card.png']);
 assert.deepEqual(readFileSync(join(root,'_site/assets/social-card.png')),readFileSync(new URL('../assets/social-card.png',import.meta.url)));
});
