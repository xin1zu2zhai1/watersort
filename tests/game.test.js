const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../js/game.js');
const L = require('../js/levels.js');

const puzzle = { tubes: [[0, 1, 0, 1], [1, 0, 1, 0], [], []], capacity: 4, hidden: false, par: 6 };

test('注ぐ・戻す・手数', () => {
  const g = new Game(puzzle, { undo: Infinity, hints: Infinity, extraTubes: 1 });
  assert.equal(g.pour(2, 3), null, '空からは注げない');
  const r = g.pour(0, 2);
  assert.deepEqual(r, { from: 0, to: 2, amount: 1, color: 1, completed: false });
  assert.equal(g.moves, 1);
  g.undo();
  assert.equal(g.moves, 0);
  assert.deepEqual(g.tubes, puzzle.tubes);
});

test('戻すの回数制限', () => {
  const g = new Game(puzzle, { undo: 1, hints: 0, extraTubes: 0 });
  g.pour(0, 2);
  g.pour(1, 3);
  assert.ok(g.undo());
  assert.equal(g.canUndo(), false);
  assert.equal(g.undo(), null);
  g.reset();
  assert.equal(g.undoLeft, 1, 'やり直すと回数も戻る');
});

test('試験管の追加は回数制限つきで、使うとアシスト扱い', () => {
  const g = new Game(puzzle, { undo: 0, hints: 0, extraTubes: 1 });
  assert.equal(g.addTube(), true);
  assert.equal(g.tubes.length, 5);
  assert.equal(g.addTube(), false);
  assert.equal(g.assisted, true);
});

test('ヒントで解いていくとクリアできる', () => {
  const pz = L.generatePuzzle(L.levelConfig(12));
  const g = new Game(pz, { undo: 0, hints: Infinity, extraTubes: 0 });
  let guard = 0;
  while (!g.isSolved() && guard++ < 200) {
    const h = g.hint();
    assert.ok(h && h.move, 'ヒントが出る');
    assert.ok(g.pour(h.move[0], h.move[1]));
  }
  assert.equal(g.isSolved(), true);
  assert.equal(g.hint(), null, 'クリア後はヒント無し');
  assert.equal(g.stars() <= 2, true, 'ヒントを使うと星が減る');
});

test('解けない盤面ではヒント回数を消費しない', () => {
  const g = new Game({ tubes: [[0, 1, 0, 1], [1, 0, 1, 0]], capacity: 4, hidden: false, par: 1 }, { undo: 0, hints: 1, extraTubes: 0 });
  assert.deepEqual(g.hint(), { stuck: true });
  assert.equal(g.hintsLeft, 1);
  assert.equal(g.isStuck(), true);
});

test('隠し色: 一番上になった段だけ公開され、戻しても隠れない', () => {
  const g = new Game({ ...puzzle, hidden: true }, { undo: Infinity, hints: 0, extraTubes: 0 });
  assert.deepEqual(g.hiddenCounts, [3, 3, 0, 0]);
  assert.equal(g.isHidden(0, 2), true);
  assert.equal(g.isHidden(0, 3), false);
  g.pour(0, 2);
  assert.equal(g.hiddenCounts[0], 2, '注いだ後の一番上が見える');
  g.undo();
  assert.equal(g.hiddenCounts[0], 2, '一度見えた色は戻しても見えたまま');
});

test('スナップショットから復元できる', () => {
  const g = new Game(puzzle, { undo: Infinity, hints: 2, extraTubes: 1 });
  g.pour(0, 2);
  g.addTube();
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const h = new Game(puzzle, { undo: Infinity, hints: 2, extraTubes: 1 });
  h.restore(snap);
  assert.deepEqual(h.tubes, g.tubes);
  assert.equal(h.moves, 1);
  assert.equal(h.undoLeft, Infinity);
  assert.equal(h.extraLeft, 0);
});
