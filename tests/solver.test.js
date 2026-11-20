const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/puzzle.js');
const S = require('../js/solver.js');

function replay(tubes, capacity, moves) {
  let t = tubes;
  for (const [from, to] of moves) {
    const res = P.applyPour(t, capacity, from, to);
    assert.ok(res, `不正な手 ${from}->${to}`);
    t = res.tubes;
  }
  return t;
}

test('解いた手順を再生するとクリアになる', () => {
  const tubes = [[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []];
  const res = S.solve(tubes, 4);
  assert.ok(res.moves);
  assert.equal(P.isSolved(replay(tubes, 4, res.moves), 4), true);
});

test('weight=1 なら最短手順', () => {
  // 2 手で解ける: 1 を空へ、0 を 0 の上へ… のような小さな盤面
  const tubes = [[0, 0, 1, 1], [1, 1, 0, 0], []];
  const res = S.solve(tubes, 4, { weight: 1 });
  assert.ok(res.moves);
  assert.equal(res.moves.length, 3);
  assert.equal(P.isSolved(replay(tubes, 4, res.moves), 4), true);
});

test('解けない盤面は探索し尽くして exhausted になる', () => {
  const res = S.solve([[0, 1, 0, 1], [1, 0, 1, 0]], 4);
  assert.equal(res.moves, null);
  assert.equal(res.exhausted, true);
});

test('探索上限に達したら exhausted=false で打ち切る', () => {
  const rng = P.createRng('limit');
  const units = [];
  for (let c = 0; c < 12; c++) for (let i = 0; i < 4; i++) units.push(c);
  P.shuffle(units, rng);
  const tubes = [];
  for (let i = 0; i < 12; i++) tubes.push(units.slice(i * 4, i * 4 + 4));
  tubes.push([], []);
  const res = S.solve(tubes, 4, { weight: 1, maxNodes: 5 });
  assert.equal(res.moves, null);
  assert.equal(res.exhausted, false);
});

test('最初から解けている盤面は 0 手', () => {
  assert.deepEqual(S.solve([[0, 0], [1, 1], []], 2).moves, []);
});
