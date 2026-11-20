/**
 * 難易度（ティア）定義と問題の自動生成。
 *
 * 難易度を上げるつまみ:
 *   - 色の数（= 試験管の本数）
 *   - 空き試験管の本数（2 本 → 1 本で一気に難しくなる）
 *   - 最初から同じ色が隣り合っている数（多いほど易しい）
 *   - 隠し色（一番上以外の色が見えない）
 *   - アシスト（戻す・ヒント・試験管追加）の回数制限
 *
 * ステージの問題はレベル番号から作るシードで生成するので、同じレベルは常に同じ問題になる。
 * 生成した問題はすべてソルバーで解けることを確認している。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Puzzle = isNode ? require('./puzzle.js') : root.WaterSort.Puzzle;
  const Solver = isNode ? require('./solver.js') : root.WaterSort.Solver;
  const api = factory(Puzzle, Solver);
  if (isNode) module.exports = api;
  else root.WaterSort.Levels = api;
})(typeof self !== 'undefined' ? self : this, function (Puzzle, Solver) {
  'use strict';

  const INF = Infinity;
  const LEVELS_PER_TIER = 10;
  const GENERATOR_VERSION = 'ws1';

  /**
   * colors: [ティア最初のレベルの色数, 最後のレベルの色数]
   * maxPairs: 初期配置で許す「同じ色の隣り合い」の最大数
   * band: 難しさ（0〜1。素朴なプレイヤーが解けない確率）の目標範囲
   */
  const TIERS = [
    {
      key: 'intro', name: '入門', hue: 5,
      colors: [3, 5], capacity: 4, empty: 2, hidden: false, maxPairs: INF,
      undo: INF, hints: INF, extraTubes: 1,
      band: [0, 0.2],
      summary: 'ルールに慣れよう。戻す・ヒントは無制限。',
    },
    {
      key: 'easy', name: '初級', hue: 3,
      colors: [5, 7], capacity: 4, empty: 2, hidden: false, maxPairs: 4,
      undo: INF, hints: 5, extraTubes: 1,
      band: [0.05, 0.7],
      summary: '色が増える。ヒントは5回まで。',
    },
    {
      key: 'normal', name: '中級', hue: 2,
      colors: [7, 9], capacity: 4, empty: 2, hidden: false, maxPairs: 2,
      undo: 10, hints: 3, extraTubes: 1,
      band: [0.3, 0.92],
      summary: '戻すは10回まで。先を読んで注ごう。',
    },
    {
      key: 'hard', name: '上級', hue: 1,
      colors: [9, 12], capacity: 4, empty: 2, hidden: false, maxPairs: 0,
      undo: 5, hints: 2, extraTubes: 0,
      band: [0.6, 1],
      summary: '最初から揃った色はなし。試験管の追加なし。',
    },
    {
      key: 'expert', name: '達人', hue: 0,
      colors: [8, 11], capacity: 4, empty: 2, hidden: true, maxPairs: 1,
      undo: 5, hints: 1, extraTubes: 0,
      band: [0.5, 1],
      summary: '一番上以外の色が隠れている。',
    },
    {
      key: 'master', name: '極', hue: 7,
      colors: [5, 8], capacity: 4, empty: 1, hidden: false, maxPairs: INF,
      undo: 3, hints: 1, extraTubes: 0,
      band: [0.6, 1],
      summary: '空き試験管は1本だけ。一手の誤りが命取り。',
    },
  ];

  const TOTAL_LEVELS = TIERS.length * LEVELS_PER_TIER;

  const CUSTOM_LIMITS = {
    colors: [2, 12],
    capacity: [3, 6],
    empty: [1, 3],
  };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** レベル番号（1 始まり）から設定を作る。 */
  function levelConfig(level) {
    const lv = clamp(Math.floor(level), 1, TOTAL_LEVELS);
    const tierIndex = Math.floor((lv - 1) / LEVELS_PER_TIER);
    const tier = TIERS[tierIndex];
    const indexInTier = (lv - 1) % LEVELS_PER_TIER;
    const progress = indexInTier / (LEVELS_PER_TIER - 1);
    const [cMin, cMax] = tier.colors;
    const colors = cMin + Math.min(cMax - cMin, Math.floor((indexInTier * (cMax - cMin + 1)) / LEVELS_PER_TIER));
    return {
      mode: 'stage',
      level: lv,
      tierIndex,
      tier,
      indexInTier,
      progress,
      colors,
      capacity: tier.capacity,
      empty: tier.empty,
      hidden: tier.hidden,
      maxPairs: tier.maxPairs,
      band: tier.band,
      rules: { undo: tier.undo, hints: tier.hints, extraTubes: tier.extraTubes },
      seed: `${GENERATOR_VERSION}-level-${lv}`,
    };
  }

  /** カスタム設定。アシストは無制限。 */
  function customConfig(options) {
    const o = options || {};
    const pick = (v, fallback, [lo, hi]) => clamp(Math.round(Number.isFinite(+v) && v !== null ? +v : fallback), lo, hi);
    const colors = pick(o.colors, 6, CUSTOM_LIMITS.colors);
    const capacity = pick(o.capacity, 4, CUSTOM_LIMITS.capacity);
    const empty = pick(o.empty, 2, CUSTOM_LIMITS.empty);
    return {
      mode: 'custom',
      colors,
      capacity,
      empty,
      hidden: !!o.hidden,
      maxPairs: INF,
      band: [0, 1],
      progress: 0.5,
      candidates: 1,
      // 空き 1 本で色が多いと解ける配置がほぼ無いので、探す時間を区切って逆スクランブルに切り替える
      timeBudgetMs: 300,
      rules: { undo: INF, hints: INF, extraTubes: 1 },
      seed: o.seed != null ? String(o.seed) : `custom-${Date.now()}-${Math.random()}`,
    };
  }

  function solvedLayout(colors, capacity, empty) {
    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(new Array(capacity).fill(c));
    for (let i = 0; i < empty; i++) tubes.push([]);
    return tubes;
  }

  /** 全色をシャッフルして満杯の試験管に詰め、空き試験管を足す。 */
  function randomLayout(colors, capacity, empty, rng) {
    const units = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < capacity; i++) units.push(c);
    Puzzle.shuffle(units, rng);
    const tubes = [];
    for (let i = 0; i < colors; i++) tubes.push(units.slice(i * capacity, (i + 1) * capacity));
    for (let i = 0; i < empty; i++) tubes.push([]);
    return tubes;
  }

  /**
   * 完成形から「逆向きの注ぎ」をランダムに繰り返して崩す。
   * どの状態も正規の手で完成形に戻せるので、必ず解ける。
   * ランダム配置で解ける問題が見つからない極端なカスタム設定のときだけ使う。
   */
  function scrambleFromSolved(colors, capacity, empty, rng, steps) {
    let tubes = solvedLayout(colors, capacity, empty);
    let count = 0;
    for (let s = 0; s < steps; s++) {
      const options = [];
      for (let x = 0; x < tubes.length; x++) {
        const X = tubes[x];
        if (!X.length) continue;
        const c = Puzzle.topColor(X);
        const run = Puzzle.topRun(X);
        for (let m = 1; m <= run; m++) {
          // 残った X の一番上が同じ色か、X が空になること（逆向きに注ぎ戻せる条件）
          if (m === run && m !== X.length) continue;
          for (let y = 0; y < tubes.length; y++) {
            if (y === x) continue;
            const Y = tubes[y];
            if (Y.length + m > capacity) continue;
            // Y の上が同じ色だと注ぎ戻すときに余分に流れるので、X が満杯のときだけ許す
            if (Y.length && Puzzle.topColor(Y) === c && X.length !== capacity) continue;
            options.push([x, y, m]);
          }
        }
      }
      if (!options.length) break;
      const [x, y, m] = options[rng.int(options.length)];
      const next = Puzzle.cloneTubes(tubes);
      const c = Puzzle.topColor(next[x]);
      for (let k = 0; k < m; k++) {
        next[x].pop();
        next[y].push(c);
      }
      tubes = next;
      count++;
    }
    return { tubes, steps: count };
  }

  function bestSolution(tubes, capacity) {
    // まず最短手順を少しだけ探し、ダメなら近似解で妥協する
    const exact = Solver.solve(tubes, capacity, { weight: 1, maxNodes: 15000 });
    if (exact.moves) return exact.moves;
    const approx = Solver.solve(tubes, capacity, { weight: 1.5, maxNodes: 80000 });
    return approx.moves;
  }

  /**
   * 難しさの見積もり（0〜1）。
   * 「同じ色の上に注げるならなるべくそうし、あとは適当に注ぐ」素朴なプレイヤーを
   * 何回も走らせ、解けなかった割合を返す。先読みが必要な問題ほど 1 に近づく。
   */
  function estimateDifficulty(tubes, capacity, rng, trials) {
    const start = Solver.encode(tubes);
    let solved = 0;
    for (let trial = 0; trial < trials; trial++) {
      let state = start;
      const seen = new Set([state.join('|')]);
      for (let step = 0; step < 400; step++) {
        if (Solver.isGoal(state, capacity)) {
          solved++;
          break;
        }
        const onto = [];
        const any = [];
        for (let i = 0; i < state.length; i++) {
          const src = state[i];
          const len = src.length;
          if (!len) continue;
          const c = src[len - 1];
          let run = 1;
          while (run < len && src[len - 1 - run] === c) run++;
          if (run === len && len === capacity) continue;
          for (let j = 0; j < state.length; j++) {
            if (j === i) continue;
            const dst = state[j];
            if (dst.length >= capacity) continue;
            if (!dst.length && run === len) continue;
            if (dst.length && dst[dst.length - 1] !== c) continue;
            const amount = Math.min(run, capacity - dst.length);
            const next = state.slice();
            next[i] = src.slice(0, len - amount);
            next[j] = dst + c.repeat(amount);
            const key = next.join('|');
            if (seen.has(key)) continue;
            any.push(next);
            if (dst.length) onto.push(next);
          }
        }
        const pool = onto.length && rng() < 0.8 ? onto : any;
        if (!pool.length) break;
        state = pool[rng.int(pool.length)];
        seen.add(state.join('|'));
      }
    }
    return 1 - solved / trials;
  }

  /**
   * 設定から問題を生成する。
   * 解ける配置をいくつか作って難しさを見積もり、ティアの目標範囲に入るものから
   * 「ティアの序盤なら易しめ、終盤なら難しめ」を選ぶ。
   * @returns {{tubes:number[][], capacity:number, colors:number, empty:number, hidden:boolean,
   *            par:number, solution:number[][], difficulty:number|null, seed:string, scrambled:boolean}}
   */
  function generatePuzzle(config) {
    const { colors, capacity, empty, maxPairs } = config;
    const band = config.band || [0, 1];
    const wanted = config.candidates || 4;
    const measure = !(band[0] <= 0 && band[1] >= 1);
    const rng = Puzzle.createRng(config.seed);
    const maxAttempts = empty <= 1 ? 4000 : 400;
    const maxEvaluated = wanted * 4;
    const inBand = [];
    const outBand = [];
    const deadline = config.timeBudgetMs ? now() + config.timeBudgetMs : Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (inBand.length >= wanted || inBand.length + outBand.length >= maxEvaluated) break;
      if (deadline !== Infinity && now() > deadline) break;
      const tubes = randomLayout(colors, capacity, empty, rng);
      if (tubes.some((t) => Puzzle.isComplete(t, capacity))) continue;
      if (Puzzle.countAdjacentPairs(tubes) > maxPairs) continue;
      const res = Solver.solve(tubes, capacity, { weight: 1.5, maxNodes: 40000 });
      if (!res.moves) continue;
      const difficulty = measure
        ? estimateDifficulty(tubes, capacity, Puzzle.createRng(`${config.seed}-d${attempt}`), 60)
        : null;
      const cand = { tubes, difficulty, length: res.moves.length };
      if (!measure || (difficulty >= band[0] && difficulty <= band[1])) inBand.push(cand);
      else outBand.push(cand);
    }

    let pool = inBand;
    if (!pool.length && outBand.length) {
      // 目標範囲に入るものがなければ、範囲に一番近いものを使う
      const dist = (c) => Math.max(band[0] - c.difficulty, c.difficulty - band[1], 0);
      pool = outBand.slice().sort((a, b) => dist(a) - dist(b)).slice(0, 1);
    }

    let chosen;
    let difficulty = null;
    let scrambled = false;
    if (pool.length) {
      pool.sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0) || a.length - b.length);
      const pick = pool[Math.round(clamp(config.progress, 0, 1) * (pool.length - 1))];
      chosen = pick.tubes;
      difficulty = pick.difficulty;
    } else {
      // ランダム配置では解ける問題が見つからない（空き 1 本で色が多い等）
      scrambled = true;
      const steps = colors * capacity * 4;
      let best = null;
      for (let i = 0; i < 8; i++) {
        const s = scrambleFromSolved(colors, capacity, empty, rng, steps);
        if (Puzzle.isSolved(s.tubes, capacity)) continue;
        const pairs = Puzzle.countAdjacentPairs(s.tubes);
        if (!best || pairs < best.pairs) best = { tubes: s.tubes, pairs };
      }
      chosen = best ? best.tubes : scrambleFromSolved(colors, capacity, empty, rng, steps).tubes;
    }

    const solution = bestSolution(chosen, capacity) || [];
    return {
      tubes: chosen,
      capacity,
      colors,
      empty,
      hidden: !!config.hidden,
      par: Math.max(1, solution.length),
      solution,
      difficulty,
      seed: config.seed,
      scrambled,
    };
  }

  /** 星の数（1〜3）。目標手数以内・1.5倍以内・アシスト未使用で評価。 */
  function computeStars(moves, par, assisted) {
    let stars = 3;
    if (moves > par) stars--;
    if (moves > Math.ceil(par * 1.5)) stars--;
    if (assisted) stars--;
    return Math.max(1, stars);
  }

  return {
    TIERS,
    LEVELS_PER_TIER,
    TOTAL_LEVELS,
    CUSTOM_LIMITS,
    levelConfig,
    customConfig,
    generatePuzzle,
    scrambleFromSolved,
    estimateDifficulty,
    computeStars,
  };
});
