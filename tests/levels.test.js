const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/puzzle.js');
const S = require('../js/solver.js');
const L = require('../js/levels.js');

const puzzles = [];
for (let lv = 1; lv <= L.TOTAL_LEVELS; lv++) {
  const cfg = L.levelConfig(lv);
  puzzles.push({ cfg, pz: L.generatePuzzle(cfg) });
}

test('6 ティア × 10 レベル = 60 レベル', () => {
  assert.equal(L.TIERS.length, 6);
  assert.equal(L.TOTAL_LEVELS, 60);
  assert.equal(L.levelConfig(1).tier.name, '入門');
  assert.equal(L.levelConfig(60).tier.name, '極');
  assert.equal(L.levelConfig(0).level, 1, '範囲外は丸める');
  assert.equal(L.levelConfig(999).level, 60);
});

test('全レベルが正しい構成で、最初から完成している試験管が無い', () => {
  for (const { cfg, pz } of puzzles) {
    assert.equal(pz.tubes.length, cfg.colors + cfg.empty, `Lv${cfg.level}`);
    assert.ok(P.isWellFormed(pz.tubes, pz.capacity, cfg.colors), `Lv${cfg.level}`);
    assert.ok(!pz.tubes.some((t) => P.isComplete(t, pz.capacity)), `Lv${cfg.level}`);
    assert.equal(pz.tubes.filter((t) => t.length === 0).length, cfg.empty, `Lv${cfg.level}`);
    assert.ok(P.countAdjacentPairs(pz.tubes) <= cfg.maxPairs, `Lv${cfg.level}`);
    assert.equal(pz.scrambled, false, `Lv${cfg.level}`);
  }
});

test('全レベルが解ける（模範解答を再生するとクリア）', () => {
  for (const { cfg, pz } of puzzles) {
    let t = pz.tubes;
    for (const [from, to] of pz.solution) t = P.applyPour(t, pz.capacity, from, to).tubes;
    assert.ok(P.isSolved(t, pz.capacity), `Lv${cfg.level}`);
    assert.equal(pz.par, pz.solution.length, `Lv${cfg.level}`);
  }
});

test('難しさがティアの目標範囲に入っている', () => {
  for (const { cfg, pz } of puzzles) {
    assert.ok(pz.difficulty >= cfg.band[0] && pz.difficulty <= cfg.band[1], `Lv${cfg.level}: ${pz.difficulty}`);
  }
});

test('ティアが進むほど条件が厳しくなる', () => {
  for (let i = 1; i < L.TIERS.length; i++) {
    const prev = L.TIERS[i - 1];
    const cur = L.TIERS[i];
    assert.ok(cur.undo <= prev.undo && cur.hints <= prev.hints && cur.extraTubes <= prev.extraTubes, cur.name);
  }
  // ティア内では色数が減らない
  for (let lv = 2; lv <= L.TOTAL_LEVELS; lv++) {
    const a = L.levelConfig(lv - 1);
    const b = L.levelConfig(lv);
    if (a.tierIndex === b.tierIndex) assert.ok(b.colors >= a.colors, `Lv${lv}`);
  }
});

test('同じレベルは常に同じ問題', () => {
  for (const lv of [1, 25, 47, 60]) {
    assert.deepEqual(L.generatePuzzle(L.levelConfig(lv)).tubes, puzzles[lv - 1].pz.tubes);
  }
});

test('カスタム設定は範囲内に丸められ、極端な設定でも解ける問題を作る', () => {
  const c = L.customConfig({ colors: 99, capacity: 1, empty: 0, seed: 's' });
  assert.equal(c.colors, 12);
  assert.equal(c.capacity, 3);
  assert.equal(c.empty, 1);
  for (const opts of [
    { colors: 12, capacity: 6, empty: 1, seed: 'extreme-1' },
    { colors: 10, capacity: 5, empty: 1, seed: 'extreme-2' },
    { colors: 2, capacity: 3, empty: 3, seed: 'tiny' },
  ]) {
    const pz = L.generatePuzzle(L.customConfig(opts));
    assert.ok(P.isWellFormed(pz.tubes, pz.capacity, pz.colors));
    assert.ok(!P.isSolved(pz.tubes, pz.capacity));
    const res = S.solve(pz.tubes, pz.capacity, { weight: 2, maxNodes: 200000 });
    assert.ok(res.moves, JSON.stringify(opts));
  }
});

test('逆向きに崩した盤面は必ず解ける', () => {
  const rng = P.createRng('scramble');
  for (let i = 0; i < 30; i++) {
    const s = L.scrambleFromSolved(6, 4, 1, rng, 60);
    assert.ok(P.isWellFormed(s.tubes, 4, 6));
    const res = S.solve(s.tubes, 4, { weight: 2, maxNodes: 200000 });
    assert.ok(res.moves, `#${i}`);
  }
});

test('星の数', () => {
  assert.equal(L.computeStars(20, 20, false), 3);
  assert.equal(L.computeStars(21, 20, false), 2);
  assert.equal(L.computeStars(31, 20, false), 1);
  assert.equal(L.computeStars(18, 20, true), 2);
  assert.equal(L.computeStars(99, 20, true), 1);
});
