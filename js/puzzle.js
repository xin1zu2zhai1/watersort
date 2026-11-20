/**
 * ウォーターソートの基本ルールと乱数。
 *
 * 盤面は「チューブの配列」で、各チューブは色番号の配列（index 0 が底、末尾が一番上）。
 * 例: [[0, 1, 1, 2], [2, 0], []]
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.WaterSort = root.WaterSort || {}).Puzzle = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 文字列から 32bit のシード値を作る（FNV-1a）。 */
  function hashSeed(input) {
    const str = String(input);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** 再現性のある乱数（mulberry32）。同じシードなら同じ並びになる。 */
  function createRng(seed) {
    let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    return next;
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function cloneTubes(tubes) {
    return tubes.map((t) => t.slice());
  }

  function topColor(tube) {
    return tube.length ? tube[tube.length - 1] : -1;
  }

  /** 一番上から同じ色が何段続いているか。 */
  function topRun(tube) {
    if (!tube.length) return 0;
    const c = tube[tube.length - 1];
    let n = 1;
    while (n < tube.length && tube[tube.length - 1 - n] === c) n++;
    return n;
  }

  /** 満杯かつ単色のチューブ。 */
  function isComplete(tube, capacity) {
    return tube.length === capacity && topRun(tube) === capacity;
  }

  /** from から to に注いだときに移動する量（注げなければ 0）。 */
  function pourAmount(tubes, capacity, from, to) {
    if (from === to) return 0;
    const src = tubes[from];
    const dst = tubes[to];
    if (!src || !dst || !src.length || dst.length >= capacity) return 0;
    if (dst.length && topColor(dst) !== topColor(src)) return 0;
    return Math.min(topRun(src), capacity - dst.length);
  }

  function canPour(tubes, capacity, from, to) {
    return pourAmount(tubes, capacity, from, to) > 0;
  }

  /** 注いだ後の新しい盤面を返す（元の盤面は変更しない）。注げなければ null。 */
  function applyPour(tubes, capacity, from, to) {
    const amount = pourAmount(tubes, capacity, from, to);
    if (!amount) return null;
    const next = tubes.slice();
    const src = tubes[from].slice();
    const dst = tubes[to].slice();
    const color = topColor(src);
    for (let i = 0; i < amount; i++) {
      src.pop();
      dst.push(color);
    }
    next[from] = src;
    next[to] = dst;
    return { tubes: next, amount, color };
  }

  /** すべてのチューブが「空」か「満杯の単色」ならクリア。 */
  function isSolved(tubes, capacity) {
    return tubes.every((t) => t.length === 0 || isComplete(t, capacity));
  }

  /** 実行可能な手をすべて列挙する（[from, to] の配列）。 */
  function legalMoves(tubes, capacity) {
    const moves = [];
    for (let i = 0; i < tubes.length; i++) {
      for (let j = 0; j < tubes.length; j++) {
        if (canPour(tubes, capacity, i, j)) moves.push([i, j]);
      }
    }
    return moves;
  }

  /**
   * 意味のある手が残っているか。
   * 「完成済みのチューブを動かす」「単色チューブを空チューブへ移す」だけの状態は手詰まり扱い。
   */
  function hasUsefulMove(tubes, capacity) {
    for (let i = 0; i < tubes.length; i++) {
      const src = tubes[i];
      if (!src.length || isComplete(src, capacity)) continue;
      const uniform = topRun(src) === src.length;
      for (let j = 0; j < tubes.length; j++) {
        if (!canPour(tubes, capacity, i, j)) continue;
        if (uniform && tubes[j].length === 0) continue;
        return true;
      }
    }
    return false;
  }

  /** チューブ内で同じ色が隣り合っている箇所の数（多いほど最初から揃っていて易しい）。 */
  function countAdjacentPairs(tubes) {
    let pairs = 0;
    for (const t of tubes) {
      for (let i = 1; i < t.length; i++) if (t[i] === t[i - 1]) pairs++;
    }
    return pairs;
  }

  /** 盤面が「各色ちょうど capacity 個」で構成されているか。 */
  function isWellFormed(tubes, capacity, colors) {
    const counts = new Array(colors).fill(0);
    for (const t of tubes) {
      if (t.length > capacity) return false;
      for (const c of t) {
        if (!(c >= 0 && c < colors)) return false;
        counts[c]++;
      }
    }
    return counts.every((n) => n === capacity);
  }

  return {
    hashSeed,
    createRng,
    shuffle,
    cloneTubes,
    topColor,
    topRun,
    isComplete,
    pourAmount,
    canPour,
    applyPour,
    isSolved,
    legalMoves,
    hasUsefulMove,
    countAdjacentPairs,
    isWellFormed,
  };
});
