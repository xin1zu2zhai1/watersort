/**
 * 1 プレイ分のゲーム状態（DOM には依存しない）。
 * 注ぐ・戻す・ヒント・試験管追加・隠し色の公開・クリア判定を扱う。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Puzzle = isNode ? require('./puzzle.js') : root.WaterSort.Puzzle;
  const Solver = isNode ? require('./solver.js') : root.WaterSort.Solver;
  const Levels = isNode ? require('./levels.js') : root.WaterSort.Levels;
  const api = factory(Puzzle, Solver, Levels);
  if (isNode) module.exports = api;
  else root.WaterSort.Game = api;
})(typeof self !== 'undefined' ? self : this, function (Puzzle, Solver, Levels) {
  'use strict';

  class Game {
    /**
     * @param {{tubes:number[][], capacity:number, hidden:boolean, par:number}} puzzle
     * @param {{undo:number, hints:number, extraTubes:number}} rules  Infinity で無制限
     */
    constructor(puzzle, rules) {
      this.puzzle = puzzle;
      this.rules = rules;
      this.capacity = puzzle.capacity;
      this.par = puzzle.par;
      this.reset();
    }

    /** 最初の状態に戻す（アシスト回数も元に戻る）。 */
    reset() {
      this.tubes = Puzzle.cloneTubes(this.puzzle.tubes);
      this.history = [];
      this.undoLeft = this.rules.undo;
      this.hintsLeft = this.rules.hints;
      this.extraLeft = this.rules.extraTubes;
      this.hintsUsed = 0;
      this.extraUsed = 0;
      // 各試験管の「底から何段が隠れているか」。隠れているのは常に底側の連続した段。
      this.hiddenCounts = this.tubes.map((t) => (this.puzzle.hidden ? Math.max(0, t.length - 1) : 0));
    }

    get moves() {
      return this.history.length;
    }

    get assisted() {
      return this.hintsUsed > 0 || this.extraUsed > 0;
    }

    isHidden(tubeIndex, unitIndex) {
      return unitIndex < this.hiddenCounts[tubeIndex];
    }

    canPour(from, to) {
      return Puzzle.canPour(this.tubes, this.capacity, from, to);
    }

    /** 注ぐ。成功したら {from, to, amount, color, completed} を返す。 */
    pour(from, to) {
      const res = Puzzle.applyPour(this.tubes, this.capacity, from, to);
      if (!res) return null;
      this.tubes = res.tubes;
      this.history.push({ from, to, amount: res.amount });
      this.reveal(from);
      return {
        from,
        to,
        amount: res.amount,
        color: res.color,
        completed: Puzzle.isComplete(this.tubes[to], this.capacity),
      };
    }

    /** 一番上になった段の色を公開する。 */
    reveal(i) {
      this.hiddenCounts[i] = Math.min(this.hiddenCounts[i], Math.max(0, this.tubes[i].length - 1));
    }

    canUndo() {
      return this.history.length > 0 && this.undoLeft > 0;
    }

    /** 直前の注ぎを取り消す。公開済みの色は公開されたまま。 */
    undo() {
      if (!this.canUndo()) return null;
      const last = this.history.pop();
      const next = this.tubes.slice();
      const src = next[last.to].slice();
      const dst = next[last.from].slice();
      for (let i = 0; i < last.amount; i++) dst.push(src.pop());
      next[last.to] = src;
      next[last.from] = dst;
      this.tubes = next;
      this.undoLeft--;
      return last;
    }

    canAddTube() {
      return this.extraLeft > 0;
    }

    /** 空の試験管を 1 本追加する。 */
    addTube() {
      if (!this.canAddTube()) return false;
      this.tubes = this.tubes.concat([[]]);
      this.hiddenCounts.push(0);
      this.extraLeft--;
      this.extraUsed++;
      return true;
    }

    canHint() {
      return this.hintsLeft > 0 && !this.isSolved();
    }

    /**
     * 次の一手を探す。
     * @returns {{move:number[]}|{stuck:true}|{unknown:true}|null}
     *   stuck: この盤面からは解けない（ヒント回数は減らない）
     */
    hint() {
      if (!this.canHint()) return null;
      const res = Solver.solve(this.tubes, this.capacity, { weight: 1.5, maxNodes: 60000 });
      if (res.moves && res.moves.length) {
        this.hintsLeft--;
        this.hintsUsed++;
        return { move: res.moves[0] };
      }
      if (res.exhausted) return { stuck: true };
      return { unknown: true };
    }

    isSolved() {
      return Puzzle.isSolved(this.tubes, this.capacity);
    }

    /** クリアしておらず、意味のある手が 1 つも無い。 */
    isStuck() {
      return !this.isSolved() && !Puzzle.hasUsefulMove(this.tubes, this.capacity);
    }

    isComplete(i) {
      return Puzzle.isComplete(this.tubes[i], this.capacity);
    }

    stars() {
      return Levels.computeStars(this.moves, this.par, this.assisted);
    }

    /** 画面更新やページ再読み込みをまたいで復元するためのスナップショット。 */
    snapshot() {
      return {
        tubes: this.tubes,
        history: this.history,
        undoLeft: this.undoLeft === Infinity ? null : this.undoLeft,
        hintsLeft: this.hintsLeft === Infinity ? null : this.hintsLeft,
        extraLeft: this.extraLeft,
        hintsUsed: this.hintsUsed,
        extraUsed: this.extraUsed,
        hiddenCounts: this.hiddenCounts,
      };
    }

    restore(snap) {
      if (!snap || !Array.isArray(snap.tubes)) return;
      this.tubes = Puzzle.cloneTubes(snap.tubes);
      this.history = snap.history.slice();
      this.undoLeft = snap.undoLeft == null ? Infinity : snap.undoLeft;
      this.hintsLeft = snap.hintsLeft == null ? Infinity : snap.hintsLeft;
      this.extraLeft = snap.extraLeft;
      this.hintsUsed = snap.hintsUsed;
      this.extraUsed = snap.extraUsed;
      this.hiddenCounts = snap.hiddenCounts.slice();
    }
  }

  return Game;
});
