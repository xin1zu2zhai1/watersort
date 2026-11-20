/**
 * ウォーターソートのソルバー（重み付き A* 探索）。
 *
 * - 生成した問題が必ず解けることの確認
 * - 目標手数（パー）の算出
 * - ヒント（現在の盤面から次の一手）
 * に使う。
 *
 * ヒューリスティック h = 「色のかたまりの総数 − 色数」。
 * 1 回の注ぎでかたまりは高々 1 つしか減らないので h は許容的（weight=1 なら最短手順）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WaterSort = root.WaterSort || {}).Solver = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 二分ヒープ（優先度の小さい順）。 */
  class MinHeap {
    constructor() {
      this.keys = [];
      this.vals = [];
    }
    get size() {
      return this.keys.length;
    }
    push(key, val) {
      const keys = this.keys;
      const vals = this.vals;
      let i = keys.length;
      keys.push(key);
      vals.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= key) break;
        keys[i] = keys[p];
        vals[i] = vals[p];
        i = p;
      }
      keys[i] = key;
      vals[i] = val;
    }
    pop() {
      const keys = this.keys;
      const vals = this.vals;
      const top = vals[0];
      const lastKey = keys.pop();
      const lastVal = vals.pop();
      const n = keys.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && keys[c + 1] < keys[c]) c++;
          if (keys[c] >= lastKey) break;
          keys[i] = keys[c];
          vals[i] = vals[c];
          i = c;
        }
        keys[i] = lastKey;
        vals[i] = lastVal;
      }
      return top;
    }
  }

  function encode(tubes) {
    return tubes.map((t) => t.map((c) => String.fromCharCode(65 + c)).join(''));
  }

  function countRuns(state) {
    let runs = 0;
    for (const t of state) {
      for (let i = 0; i < t.length; i++) if (i === 0 || t[i] !== t[i - 1]) runs++;
    }
    return runs;
  }

  function isGoal(state, capacity) {
    for (const t of state) {
      if (!t.length) continue;
      if (t.length !== capacity) return false;
      for (let i = 1; i < t.length; i++) if (t[i] !== t[0]) return false;
    }
    return true;
  }

  /** チューブの並び順を無視した状態キー。 */
  function canonicalKey(state) {
    return state.slice().sort().join(',');
  }

  /**
   * @param {number[][]} tubes
   * @param {number} capacity
   * @param {{weight?: number, maxNodes?: number}} [options]
   * @returns {{moves: number[][] | null, nodes: number, exhausted: boolean}}
   *   moves: 解けた場合の手順（[from, to] の配列）。見つからなければ null。
   *   exhausted: 探索空間をすべて調べ尽くした（= 解なしと確定した）か。
   */
  function solve(tubes, capacity, options) {
    const opts = options || {};
    const weight = opts.weight == null ? 2 : opts.weight;
    const maxNodes = opts.maxNodes == null ? 200000 : opts.maxNodes;

    const start = encode(tubes);
    const colorCount = new Set(start.join('')).size;
    if (isGoal(start, capacity)) return { moves: [], nodes: 0, exhausted: false };

    const states = [start];
    const gs = [0];
    const parents = [-1];
    const froms = [-1];
    const tos = [-1];
    const bestG = new Map([[canonicalKey(start), 0]]);
    const heap = new MinHeap();
    const h0 = countRuns(start) - colorCount;
    // 同じ f なら h が小さい（ゴールに近い）ほうを優先する。
    heap.push(weight * h0 * 1024 + h0, 0);

    let expanded = 0;
    while (heap.size) {
      const id = heap.pop();
      const state = states[id];
      const g = gs[id];
      if (bestG.get(canonicalKey(state)) < g) continue; // 古いエントリ
      if (++expanded > maxNodes) return { moves: null, nodes: expanded, exhausted: false };

      for (let i = 0; i < state.length; i++) {
        const src = state[i];
        const len = src.length;
        if (!len) continue;
        const c = src[len - 1];
        let run = 1;
        while (run < len && src[len - 1 - run] === c) run++;
        const uniform = run === len;
        if (uniform && len === capacity) continue; // 完成済みは動かさない
        let triedEmpty = false;
        for (let j = 0; j < state.length; j++) {
          if (j === i) continue;
          const dst = state[j];
          const dlen = dst.length;
          if (dlen >= capacity) continue;
          if (dlen === 0) {
            // 単色チューブを空へ移すのは無意味。空チューブはどれも同じなので 1 本だけ試す。
            if (uniform || triedEmpty) continue;
            triedEmpty = true;
          } else if (dst[dlen - 1] !== c) {
            continue;
          }
          const amount = Math.min(run, capacity - dlen);
          const next = state.slice();
          next[i] = src.slice(0, len - amount);
          next[j] = dst + c.repeat(amount);
          const ng = g + 1;
          const key = canonicalKey(next);
          const seen = bestG.get(key);
          if (seen !== undefined && seen <= ng) continue;
          bestG.set(key, ng);
          const nid = states.length;
          states.push(next);
          gs.push(ng);
          parents.push(id);
          froms.push(i);
          tos.push(j);
          if (isGoal(next, capacity)) {
            const moves = [];
            for (let k = nid; parents[k] !== -1; k = parents[k]) moves.push([froms[k], tos[k]]);
            moves.reverse();
            return { moves, nodes: expanded, exhausted: false };
          }
          const h = countRuns(next) - colorCount;
          heap.push((ng + weight * h) * 1024 + h, nid);
        }
      }
    }
    return { moves: null, nodes: expanded, exhausted: true };
  }

  return { solve, encode, isGoal };
});
