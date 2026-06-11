// johba 開発用ヘッドレス検証ツール（公開物ではない。ゲーム本体は index.html 単一ファイル）
//
// index.html から CONFIG セクションと SIM-CORE セクションを抽出して node で実行し、
// プレイヤー無操作（全頭AI）のレースを多数回回して展開・タイムの分布を確認する。
//
// 使い方:
//   node tools/sim-harness.mjs [races=10] [distance=1600|random] [seed=1] [going=良|稍重|重|不良|random]
//
// SIM-CORE が export すべき契約（docs/balance-notes.md・CLAUDE.md 参照）:
//   CONFIG, makeRng, createRaceConditions, generateField, createRaceState, stepRace, paceLabel
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function cut(name) {
  const begin = `// ==== ${name}-BEGIN ====`;
  const end = `// ==== ${name}-END ====`;
  const i = html.indexOf(begin);
  const j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error(`マーカー ${name} が index.html に見つかりません`);
  return html.slice(i + begin.length, j);
}

const code = cut('CONFIG') + '\n' + cut('SIM-CORE') + `
export { CONFIG, makeRng, createRaceConditions, generateField, createRaceState, stepRace, paceLabel };
`;
const dir = mkdtempSync(join(tmpdir(), 'johba-sim-'));
const file = join(dir, 'sim.mjs');
writeFileSync(file, code);
const sim = await import(pathToFileURL(file).href);

const races = Number(process.argv[2] ?? 10);
const distArg = process.argv[3] ?? '1600';
const seed0 = Number(process.argv[4] ?? 1);
const goingArg = process.argv[5] ?? '良';

const styleJa = { nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追込' };
const winners = new Map();
const paces = new Map();
const winTimes = [];
const spreads = [];
let kakariRaces = 0;

for (let r = 0; r < races; r++) {
  const rng = sim.makeRng(seed0 + r * 7919);
  const forced = {};
  if (distArg !== 'random') forced.distance = Number(distArg);
  if (goingArg !== 'random') forced.going = goingArg;
  const cond = sim.createRaceConditions(rng, forced);
  const field = sim.generateField(rng, cond);
  const state = sim.createRaceState(field, cond, rng, -1);
  const dt = 1 / 60;
  let guard = 0;
  while (state.finishedCount < field.length && guard < 400 * 60) {
    sim.stepRace(state, dt, null);
    guard++;
  }
  const res = state.results;
  const win = res[0];
  const last = res[res.length - 1];
  const horse = field[win.index];
  winners.set(horse.num, (winners.get(horse.num) ?? 0) + 1);
  const pace = sim.paceLabel(state);
  paces.set(pace, (paces.get(pace) ?? 0) + 1);
  winTimes.push(win.finishTime);
  spreads.push(last.finishTime - win.finishTime);
  if (state.kakariCount > 0) kakariRaces++;
  console.log(
    `#${String(r + 1).padStart(2)} ${cond.distance}m ${cond.going} ペース:${pace} ` +
    `勝ち:${horse.num}番(${styleJa[horse.style] ?? horse.style}) ${win.finishTime.toFixed(2)}s ` +
    `(基準${cond.baseTime.toFixed(1)}s) 1-12着差:${(last.finishTime - win.finishTime).toFixed(2)}s` +
    (state.kakariCount > 0 ? ` 掛かり${state.kakariCount}頭` : '')
  );
}

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log('---');
console.log(`勝ち馬の種類: ${winners.size}頭 / ${races}レース`);
console.log(`ペース分布: ${[...paces.entries()].map(([k, v]) => `${k}×${v}`).join(' ')}`);
console.log(`勝ちタイム: 平均${avg(winTimes).toFixed(2)}s 最速${Math.min(...winTimes).toFixed(2)}s 最遅${Math.max(...winTimes).toFixed(2)}s`);
console.log(`着差(1-12着): 平均${avg(spreads).toFixed(2)}s 最小${Math.min(...spreads).toFixed(2)}s 最大${Math.max(...spreads).toFixed(2)}s`);
console.log(`掛かり発生レース: ${kakariRaces}/${races}`);
