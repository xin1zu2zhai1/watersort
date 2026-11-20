const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/puzzle.js');

test('同じ色の上か空の試験管にだけ注げる', () => {
  const tubes = [[0, 1, 1], [2, 1], [0, 2], [], [1, 1, 1, 1]];
  assert.equal(P.pourAmount(tubes, 4, 0, 1), 2); // 1,1 を 1 の上へ（空きは 2）
  assert.equal(P.pourAmount(tubes, 4, 0, 2), 0); // 色が違う
  assert.equal(P.pourAmount(tubes, 4, 0, 3), 2); // 空へは連続する分すべて
  assert.equal(P.pourAmount(tubes, 4, 0, 4), 0); // 満杯
  assert.equal(P.pourAmount(tubes, 4, 3, 0), 0); // 空からは注げない
  assert.equal(P.pourAmount(tubes, 4, 0, 0), 0); // 自分自身
});

test('入りきらない分は元の試験管に残る', () => {
  const tubes = [[0, 1, 1, 1], [2, 2, 1]];
  const res = P.applyPour(tubes, 4, 0, 1);
  assert.equal(res.amount, 1);
  assert.deepEqual(res.tubes, [[0, 1, 1], [2, 2, 1, 1]]);
  assert.deepEqual(tubes, [[0, 1, 1, 1], [2, 2, 1]], '元の盤面は変更しない');
});

test('クリア判定: 空か満杯の単色だけ', () => {
  assert.equal(P.isSolved([[0, 0, 0, 0], [], [1, 1, 1, 1]], 4), true);
  assert.equal(P.isSolved([[0, 0, 0], [0], [1, 1, 1, 1]], 4), false);
  assert.equal(P.isSolved([[0, 0, 1, 1], [1, 1, 0, 0], []], 4), false);
});

test('意味のある手が無ければ手詰まり', () => {
  // 単色の試験管を空へ移すだけの手しかない
  assert.equal(P.hasUsefulMove([[0, 0, 0, 0], [1, 1, 1, 1], []], 4), false);
  assert.equal(P.hasUsefulMove([[0, 1, 0, 1], [1, 0, 1, 0]], 4), false);
  assert.equal(P.hasUsefulMove([[0, 1, 0, 1], [1, 0, 1, 0], []], 4), true);
});

test('同じシードなら同じ乱数列', () => {
  const a = P.createRng('seed-x');
  const b = P.createRng('seed-x');
  const c = P.createRng('seed-y');
  const sa = Array.from({ length: 5 }, () => a());
  const sb = Array.from({ length: 5 }, () => b());
  const sc = Array.from({ length: 5 }, () => c());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((x) => x >= 0 && x < 1));
});

test('隣り合う同色の数を数える', () => {
  assert.equal(P.countAdjacentPairs([[0, 0, 1, 1], [2, 1, 2, 1], []]), 2);
});
