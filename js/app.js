/**
 * 画面まわり（DOM の組み立て・入力・アニメーション・効果音・進行状況の保存）。
 * ルールや問題生成は puzzle.js / solver.js / levels.js / game.js にある。
 */
(function () {
  'use strict';

  const { Puzzle, Levels, Game } = window.WaterSort;
  const $ = (id) => document.getElementById(id);
  const TOTAL = Levels.TOTAL_LEVELS;
  const PER_TIER = Levels.LEVELS_PER_TIER;
  const STORE_KEY = 'watersort:v1';

  /** 水の色。mark は「色に記号を表示」用、ink は記号の文字色。 */
  const COLORS = [
    { name: '赤', hex: '#e5383b', mark: '●', ink: '#ffffff' },
    { name: '橙', hex: '#f7882f', mark: '▲', ink: '#2a1606' },
    { name: '黄', hex: '#f9d93c', mark: '■', ink: '#2a2406' },
    { name: '黄緑', hex: '#9bd150', mark: '◆', ink: '#16240a' },
    { name: '緑', hex: '#22884a', mark: '★', ink: '#ffffff' },
    { name: '水色', hex: '#5ccbf2', mark: '♥︎', ink: '#06222c' },
    { name: '青', hex: '#2563eb', mark: '♣︎', ink: '#ffffff' },
    { name: '紫', hex: '#8b4fd8', mark: '♠︎', ink: '#ffffff' },
    { name: '桃', hex: '#f592c0', mark: '✚', ink: '#2c0a1a' },
    { name: '茶', hex: '#8a5a36', mark: '✖︎', ink: '#ffffff' },
    { name: '灰', hex: '#a3abb5', mark: '◐', ink: '#141a20' },
    { name: '青緑', hex: '#11a89a', mark: '♪', ink: '#ffffff' },
  ];

  const TIMING = { move: 190, pour: 280 };

  // ---------------------------------------------------------------- 保存

  function defaults() {
    return {
      stars: {},
      last: 1,
      settings: { sound: true, marks: false, motion: true, stuckAlert: true },
      custom: { colors: 6, capacity: 4, empty: 2, hidden: false },
    };
  }

  function loadStore() {
    const base = defaults();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return {
        stars: data.stars && typeof data.stars === 'object' ? data.stars : {},
        last: Number(data.last) || 1,
        settings: Object.assign(base.settings, data.settings),
        custom: Object.assign(base.custom, data.custom),
      };
    } catch (e) {
      return base;
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 保存できない環境でも遊べるようにする */
    }
  }

  let store = loadStore();

  const starsOf = (level) => store.stars[level] || 0;

  /** 各段階の最初のレベルは常に遊べる。それ以外は 1 つ前をクリアすると解放。 */
  function isUnlocked(level) {
    if (level < 1 || level > TOTAL) return false;
    return (level - 1) % PER_TIER === 0 || starsOf(level - 1) > 0;
  }

  function continueLevel() {
    const last = Math.min(TOTAL, Math.max(1, store.last || 1));
    if (starsOf(last) > 0 && last < TOTAL) return last + 1;
    return isUnlocked(last) ? last : 1;
  }

  // ---------------------------------------------------------------- 効果音

  const Sound = (function () {
    let ctx = null;
    function ensure() {
      if (!store.settings.sound) return null;
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }
    function tone(freq, start, dur, opts) {
      const o = opts || {};
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + start;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(o.gain || 0.06, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }
    return {
      ensure,
      lift() {
        tone(520, 0, 0.08, { type: 'triangle', gain: 0.035, to: 660 });
      },
      pour(amount) {
        const n = Math.min(6, amount * 2);
        for (let i = 0; i < n; i++) {
          tone(240 + Math.random() * 140, i * 0.05, 0.09, { gain: 0.045, to: 480 + Math.random() * 220 });
        }
      },
      cork() {
        tone(880, 0, 0.12, { type: 'triangle', gain: 0.05 });
        tone(1320, 0.06, 0.18, { type: 'triangle', gain: 0.045 });
      },
      undo() {
        tone(620, 0, 0.09, { type: 'triangle', gain: 0.035, to: 420 });
      },
      error() {
        tone(170, 0, 0.14, { type: 'square', gain: 0.025, to: 120 });
      },
      clear() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.32, { type: 'triangle', gain: 0.055 }));
      },
    };
  })();

  // ---------------------------------------------------------------- 共通

  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const motionOn = () => store.settings.motion && !reduceMotion.matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fmt = (n) => (n === Infinity ? '∞' : String(n));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function tierColor(tier) {
    return COLORS[tier.hue];
  }

  function applySettings() {
    document.documentElement.classList.toggle('no-motion', !motionOn());
    $('s-sound').checked = store.settings.sound;
    $('s-marks').checked = store.settings.marks;
    $('s-motion').checked = store.settings.motion;
    $('s-stuck').checked = store.settings.stuckAlert;
  }

  // ---------------------------------------------------------------- 状態

  const S = {
    screen: 'home',
    tab: 'stage',
    mode: null, // 'stage' | 'custom'
    level: 1,
    config: null,
    puzzle: null,
    game: null,
    selected: -1,
    hint: -1,
    busy: false,
    needsLayout: false,
    stuckShown: false, // 今の「解けない」状態をすでに知らせたか
    stuckSteps: 0,
  };
  const puzzleCache = new Map();
  let slotEls = [];
  let tubeEls = [];

  // ---------------------------------------------------------------- ホーム

  function showScreen(name) {
    S.screen = name;
    $('screen-home').hidden = name !== 'home';
    $('screen-game').hidden = name !== 'game';
    if (name === 'home') renderHome();
  }

  function selectTab(name) {
    S.tab = name;
    for (const t of ['stage', 'custom', 'howto']) {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('tab-' + t).tabIndex = t === name ? 0 : -1;
      $('panel-' + t).hidden = t !== name;
    }
  }

  function renderHome() {
    const cont = continueLevel();
    const anyCleared = Object.values(store.stars).some((n) => n > 0);
    $('continue-label').textContent = anyCleared ? '続きから' : 'はじめる';
    $('continue-level').textContent = 'Lv.' + cont;

    let starTotal = 0;
    let clearedTotal = 0;
    for (let lv = 1; lv <= TOTAL; lv++) {
      starTotal += starsOf(lv);
      if (starsOf(lv) > 0) clearedTotal++;
    }
    const line = $('progress-line');
    line.textContent = '';
    line.append('クリア ', el('b', null, `${clearedTotal} / ${TOTAL}`), '　★ ', el('b', null, `${starTotal} / ${TOTAL * 3}`), '　各段階の最初のレベルからいつでも始められます。');

    const wrap = $('tiers');
    wrap.textContent = '';
    Levels.TIERS.forEach((tier, ti) => {
      const first = ti * PER_TIER + 1;
      const last = first + PER_TIER - 1;
      let cleared = 0;
      for (let lv = first; lv <= last; lv++) if (starsOf(lv) > 0) cleared++;

      const section = el('section', 'tier');
      section.style.setProperty('--tier-c', tierColor(tier).hex);
      section.setAttribute('aria-labelledby', `tier-name-${ti}`);

      const gauge = el('div', 'gauge');
      gauge.style.setProperty('--fill', String((ti + 1) / Levels.TIERS.length));
      gauge.setAttribute('role', 'img');
      gauge.setAttribute('aria-label', `難しさ ${ti + 1} / ${Levels.TIERS.length}`);

      const head = el('div', 'tier-head');
      const name = el('h2', 'tier-name', tier.name);
      name.id = `tier-name-${ti}`;
      head.append(name, el('span', 'tier-range', `Lv.${first}–${last}`), el('span', 'tier-count', `${cleared} / ${PER_TIER} クリア`));

      const body = el('div', 'tier-body');
      const specs = el('ul', 'specs');
      const addSpec = (label, value, flag) => {
        const li = el('li', 'spec' + (flag ? ' is-flag' : ''));
        li.append(label);
        if (value != null) li.append(el('b', null, value));
        specs.append(li);
      };
      addSpec('色', `${tier.colors[0]}〜${tier.colors[1]}`);
      addSpec('空き', `${tier.empty}本`, tier.empty < 2);
      if (tier.hidden) addSpec('隠し色', null, true);
      addSpec('戻す', fmt(tier.undo));
      addSpec('ヒント', fmt(tier.hints));
      addSpec('追加', tier.extraTubes ? `${tier.extraTubes}本` : 'なし');
      body.append(specs, el('p', 'tier-summary', tier.summary));

      const grid = el('div', 'level-grid');
      for (let lv = first; lv <= last; lv++) {
        const btn = el('button', 'lv');
        btn.type = 'button';
        btn.dataset.level = String(lv);
        const unlocked = isUnlocked(lv);
        const stars = starsOf(lv);
        btn.append(el('span', 'lv-num', String(lv)));
        if (unlocked) {
          const row = el('span', 'lv-stars');
          row.setAttribute('aria-hidden', 'true');
          for (let k = 0; k < 3; k++) row.append(el('span', k < stars ? 'on' : null, '★'));
          btn.append(row);
          btn.setAttribute('aria-label', `レベル${lv}` + (stars ? `、★${stars}` : '、未クリア'));
        } else {
          btn.disabled = true;
          btn.insertAdjacentHTML(
            'beforeend',
            '<svg class="lv-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg>'
          );
          btn.setAttribute('aria-label', `レベル${lv}、ロック中`);
        }
        if (lv === cont) btn.classList.add('is-current');
        grid.append(btn);
      }

      section.append(gauge, head, body, grid);
      wrap.append(section);
    });
  }

  function renderTierTable() {
    const tbody = $('tier-table').querySelector('tbody');
    tbody.textContent = '';
    Levels.TIERS.forEach((tier, ti) => {
      const tr = el('tr');
      const th = el('th');
      th.scope = 'row';
      const dot = el('span', 'tier-dot');
      dot.style.setProperty('--tier-c', tierColor(tier).hex);
      th.append(dot, tier.name);
      const first = ti * PER_TIER + 1;
      tr.append(
        th,
        el('td', null, `${first}–${first + PER_TIER - 1}`),
        el('td', null, `${tier.colors[0]}〜${tier.colors[1]}`),
        el('td', null, `${tier.empty}本`),
        el('td', null, tier.hidden ? 'あり' : '—'),
        el('td', null, fmt(tier.undo)),
        el('td', null, fmt(tier.hints)),
        el('td', null, tier.extraTubes ? `${tier.extraTubes}本` : '—')
      );
      tbody.append(tr);
    });
  }

  function readCustomForm() {
    return {
      colors: Number($('c-colors').value),
      capacity: Number($('c-capacity').value),
      empty: Number($('c-empty').value),
      hidden: $('c-hidden').checked,
    };
  }

  function syncCustomForm() {
    const o = readCustomForm();
    $('c-colors-out').textContent = o.colors;
    $('c-capacity-out').textContent = o.capacity;
    $('c-empty-out').textContent = o.empty;
    $('custom-summary').textContent =
      `試験管 ${o.colors + o.empty}本（色 ${o.colors} + 空き ${o.empty}）・ 1本 ${o.capacity}段` + (o.hidden ? ' ・ 隠し色あり' : '');
    $('custom-note').hidden = !(o.empty === 1 && o.colors >= 8);
    store.custom = o;
    saveStore();
  }

  // ---------------------------------------------------------------- ゲーム開始

  function startStage(level) {
    const lv = Math.min(TOTAL, Math.max(1, level));
    const config = Levels.levelConfig(lv);
    let puzzle = puzzleCache.get(lv);
    if (!puzzle) {
      puzzle = Levels.generatePuzzle(config);
      puzzleCache.set(lv, puzzle);
    }
    store.last = lv;
    saveStore();
    beginGame({ mode: 'stage', level: lv, config, puzzle });
  }

  function startCustom(puzzle) {
    const config = Levels.customConfig(store.custom);
    beginGame({ mode: 'custom', level: 0, config, puzzle: puzzle || Levels.generatePuzzle(config) });
  }

  function beginGame(opts) {
    S.mode = opts.mode;
    S.level = opts.level;
    S.config = opts.config;
    S.puzzle = opts.puzzle;
    S.game = new Game(opts.puzzle, opts.config.rules);
    if (opts.snapshot) S.game.restore(opts.snapshot);
    S.selected = -1;
    S.hint = -1;
    S.busy = false;
    S.stuckShown = false;
    $('overlay-clear').hidden = true;
    $('overlay-stuck').hidden = true;
    showScreen('game');
    renderGameHeader();
    buildBoard();
    updateHud();
    setStatus(openingMessage());
  }

  function openingMessage() {
    if (S.mode !== 'stage') {
      return S.puzzle.scrambled ? '解ける配置が少ない設定のため、完成形から崩して作った問題です。' : '';
    }
    const cfg = S.config;
    if (cfg.level === 1) return '注ぎたい試験管をタップしてから、注ぐ先の試験管をタップします。';
    if (cfg.indexInTier === 0) return `ここから「${cfg.tier.name}」。${cfg.tier.summary}`;
    return '';
  }

  function renderGameHeader() {
    const chip = $('game-tier');
    if (S.mode === 'stage') {
      const tier = S.config.tier;
      const c = tierColor(tier);
      $('game-level').textContent = 'Lv.' + S.level;
      chip.textContent = tier.name;
      chip.style.setProperty('--tier-c', c.hex);
      chip.style.setProperty('--tier-ink', c.ink);
    } else {
      $('game-level').textContent = 'カスタム';
      chip.textContent = `${S.config.colors}色・空き${S.config.empty}`;
      chip.style.removeProperty('--tier-c');
      chip.style.removeProperty('--tier-ink');
    }
    $('par').textContent = S.game.par;
  }

  // ---------------------------------------------------------------- 盤面

  /** 盤面の大きさから、試験管の幅・段の高さ・行数を決める。 */
  function computeLayout(n, cap) {
    const wrap = $('board-wrap');
    const W = Math.max(200, wrap.clientWidth);
    const H = Math.max(160, wrap.clientHeight);
    const unit = 0.8; // 段の高さ / 試験管の幅
    const head = 0.6; // 液面より上の余白（段数）
    const gapX = 0.42;
    const gapY = 0.9; // 行の間（持ち上げとコルク分を含む）
    let best = null;
    for (let rows = 1; rows <= Math.min(n, 4); rows++) {
      const perRow = Math.ceil(n / rows);
      const byWidth = W / (perRow + (perRow - 1) * gapX + 0.3);
      const byHeight = H / (0.55 + rows * unit * (cap + head) + (rows - 1) * gapY);
      const w = Math.min(byWidth, byHeight, 76);
      if (!best || w > best.w + 0.5) best = { rows, w };
    }
    const w = Math.max(18, Math.floor(best.w));
    const u = Math.round(w * unit);
    return {
      rows: best.rows,
      w,
      u,
      th: Math.round(u * (cap + head)),
      gx: Math.round(w * gapX),
      gy: Math.round(w * gapY),
      rim: Math.max(4, Math.round(w * 0.11)),
      edge: Math.max(2, Math.round(w * 0.055)),
    };
  }

  function buildBoard() {
    const game = S.game;
    const board = $('board');
    board.textContent = '';
    board.classList.remove('is-cleared');
    slotEls = [];
    tubeEls = [];
    const n = game.tubes.length;
    const lay = computeLayout(n, game.capacity);
    const vars = { '--w': lay.w, '--u': lay.u, '--th': lay.th, '--gx': lay.gx, '--gy': lay.gy, '--rim': lay.rim, '--edge': lay.edge };
    for (const k of Object.keys(vars)) board.style.setProperty(k, vars[k] + 'px');
    board.style.setProperty('--cap', String(game.capacity));

    // 行ごとの本数をなるべく均等に
    const base = Math.floor(n / lay.rows);
    const extra = n % lay.rows;
    let i = 0;
    for (let r = 0; r < lay.rows; r++) {
      const row = el('div', 'row');
      const count = base + (r < extra ? 1 : 0);
      for (let k = 0; k < count; k++, i++) {
        const slot = el('div', 'slot');
        slot.style.setProperty('--i', String(i));
        const tube = el('button', 'tube');
        tube.type = 'button';
        tube.dataset.index = String(i);
        const glass = el('span', 'glass');
        glass.append(el('span', 'liquid'), el('span', 'ticks'));
        tube.append(glass, el('span', 'cork'));
        slot.append(tube);
        row.append(slot);
        slotEls.push(slot);
        tubeEls.push(tube);
      }
      board.append(row);
    }
    for (let t = 0; t < n; t++) renderTube(t);
  }

  function describeTube(i) {
    const game = S.game;
    const t = game.tubes[i];
    let text = `試験管${i + 1}: `;
    if (!t.length) text += '空';
    else text += '下から ' + t.map((c, k) => (game.isHidden(i, k) ? '不明' : COLORS[c].name)).join('、');
    if (game.isComplete(i)) text += '（完成）';
    return text;
  }

  /**
   * 試験管 1 本を描き直す。fillFrom 以降の段は注がれてくるアニメーションをつける。
   */
  function renderTube(i, fillFrom) {
    const game = S.game;
    const tube = tubeEls[i];
    if (!tube) return;
    const liquid = tube.querySelector('.liquid');
    const t = game.tubes[i];
    liquid.textContent = '';
    const from = fillFrom == null ? t.length : fillFrom;
    const per = Math.round(TIMING.pour / Math.max(1, t.length - from));
    for (let k = 0; k < t.length; k++) {
      const seg = el('div', 'seg');
      if (game.isHidden(i, k)) {
        seg.classList.add('is-hidden');
        seg.append(el('span', 'mark', '?'));
      } else {
        const c = COLORS[t[k]];
        seg.style.setProperty('--c', c.hex);
        seg.style.setProperty('--mark-ink', c.ink);
        if (store.settings.marks) seg.append(el('span', 'mark', c.mark));
      }
      if (k === t.length - 1) seg.classList.add('is-top');
      if (k >= from && motionOn()) {
        seg.classList.add('is-fill');
        seg.style.animationDuration = per + 'ms';
        seg.style.animationDelay = (k - from) * per + 'ms';
      }
      liquid.append(seg);
    }
    tube.classList.toggle('is-complete', game.isComplete(i));
    tube.classList.toggle('is-selected', S.selected === i);
    tube.classList.toggle('is-hint', S.hint === i);
    tube.setAttribute('aria-pressed', String(S.selected === i));
    tube.setAttribute('aria-label', describeTube(i));
  }

  function renderAllTubes() {
    for (let i = 0; i < tubeEls.length; i++) renderTube(i);
  }

  function select(i) {
    S.selected = i;
    tubeEls.forEach((tube, k) => {
      tube.classList.toggle('is-selected', k === i);
      tube.setAttribute('aria-pressed', String(k === i));
    });
  }

  function clearHint() {
    if (S.hint >= 0 && tubeEls[S.hint]) tubeEls[S.hint].classList.remove('is-hint');
    S.hint = -1;
  }

  function shake(i) {
    const slot = slotEls[i];
    if (!slot) return;
    slot.classList.remove('is-shake');
    void slot.offsetWidth; // アニメーションをやり直す
    slot.classList.add('is-shake');
    Sound.error();
  }

  function setStatus(text, alert) {
    const s = $('status');
    s.textContent = text || '';
    s.classList.toggle('is-alert', !!alert);
  }

  function updateHud() {
    const game = S.game;
    $('moves').textContent = game.moves;
    $('moves').parentElement.classList.toggle('is-over', game.moves > game.par);
    const setBadge = (id, value) => {
      const b = $(id);
      b.textContent = fmt(value);
      b.classList.toggle('is-zero', value === 0);
    };
    setBadge('undo-left', game.undoLeft);
    setBadge('hint-left', game.hintsLeft);
    setBadge('add-left', game.extraLeft);
    const solved = game.isSolved();
    $('btn-undo').disabled = solved || !game.canUndo();
    $('btn-hint').disabled = solved || !game.canHint();
    $('btn-add').disabled = solved || !game.canAddTube();
    $('btn-undo').setAttribute('aria-label', `戻す（残り${fmt(game.undoLeft)}回）`);
    $('btn-hint').setAttribute('aria-label', `ヒント（残り${fmt(game.hintsLeft)}回）`);
    $('btn-add').setAttribute('aria-label', `空の試験管を追加（残り${game.extraLeft}本）`);
  }

  // ---------------------------------------------------------------- 操作

  function onTubeTap(i) {
    const game = S.game;
    if (S.busy || !game || game.isSolved()) return;
    Sound.ensure();
    const sel = S.selected;
    const t = game.tubes[i];
    const selectable = t.length > 0 && !game.isComplete(i);

    if (sel === -1) {
      if (!selectable) return shake(i);
      select(i);
      Sound.lift();
      return;
    }
    if (sel === i) {
      select(-1);
      return;
    }
    if (game.canPour(sel, i)) {
      doPour(sel, i);
      return;
    }
    // 注げない相手: 持ち上げ直せるならそちらを選び直す
    if (selectable) {
      select(i);
      Sound.lift();
    } else {
      shake(i);
    }
  }

  async function doPour(from, to) {
    const game = S.game;
    const amount = Puzzle.pourAmount(game.tubes, game.capacity, from, to);
    const color = COLORS[Puzzle.topColor(game.tubes[from])];
    const before = game.tubes[to].length;
    const anim = motionOn();
    S.busy = true;
    clearHint();

    let geo = null;
    if (anim) geo = await tilt(from, to);

    // 注ぐ側: 上の段から順に減らす
    const segs = tubeEls[from].querySelectorAll('.seg');
    const per = Math.round(TIMING.pour / amount);
    for (let j = 0; j < amount && anim; j++) {
      const seg = segs[segs.length - 1 - j];
      seg.classList.add('is-drain');
      seg.style.animationDuration = per + 'ms';
      seg.style.animationDelay = j * per + 'ms';
    }

    const res = game.pour(from, to);
    let stream = null;
    if (geo) {
      stream = el('div', 'stream');
      const sw = Math.max(4, Math.round(geo.w * 0.13));
      const surface = geo.bottom - geo.edge - before * geo.u;
      stream.style.setProperty('--c', color.hex);
      stream.style.left = geo.x - sw / 2 + 'px';
      stream.style.top = geo.y + 'px';
      stream.style.width = sw + 'px';
      stream.style.height = Math.max(0, surface - geo.y) + 'px';
      $('board-wrap').append(stream);
    }
    S.selected = -1;
    renderTube(to, before);
    Sound.pour(amount);
    if (anim) await wait(TIMING.pour);
    renderTube(from);
    if (stream) stream.remove();
    if (anim) await untilt(from);
    S.busy = false;

    if (S.needsLayout) {
      S.needsLayout = false;
      buildBoard();
    }
    afterMove(res);
  }

  /** 注ぐ側の試験管を注ぐ先の上まで運んで傾ける。 */
  async function tilt(from, to) {
    const sSlot = slotEls[from];
    const dSlot = slotEls[to];
    const tube = tubeEls[from];
    const s = sSlot.getBoundingClientRect();
    const d = dSlot.getBoundingClientRect();
    const wrap = $('board-wrap').getBoundingClientRect();
    const w = s.width;
    const right = d.left + d.width / 2 >= s.left + s.width / 2;
    // 回転の中心（試験管の口の角）を注ぐ先の口の真上に置く
    const mouthX = d.left + d.width / 2;
    const mouthY = d.top - w * 0.55;
    const dx = mouthX - (right ? s.right : s.left);
    const dy = mouthY - s.top;
    sSlot.classList.add('is-pouring');
    tube.style.transformOrigin = right ? '100% 0' : '0 0';
    tube.style.transform = `translate(${dx}px, ${dy}px) rotate(${right ? 72 : -72}deg)`;
    await wait(TIMING.move);
    const board = $('board');
    return {
      x: mouthX - wrap.left,
      y: mouthY - wrap.top,
      bottom: d.bottom - wrap.top,
      w,
      u: parseFloat(board.style.getPropertyValue('--u')) || w * 0.8,
      edge: parseFloat(board.style.getPropertyValue('--edge')) || 2,
    };
  }

  async function untilt(from) {
    const tube = tubeEls[from];
    const slot = slotEls[from];
    if (!tube) return;
    tube.style.transform = '';
    await wait(TIMING.move);
    tube.style.transformOrigin = '';
    slot.classList.remove('is-pouring');
  }

  async function afterMove(res) {
    const game = S.game;
    updateHud();
    if (res && res.completed) Sound.cork();
    if (game.isSolved()) {
      onSolved();
      return;
    }
    const kind = stuckKind();
    if (!kind) {
      S.stuckShown = false;
      setStatus('');
      return;
    }
    setStatus(stuckStatusText(kind), true);
    // 「解けない」は一度だけ知らせる（閉じて続けた場合は表示だけ）。手詰まりは毎回知らせる。
    if (kind === 'nomoves' || !S.stuckShown) {
      S.busy = true;
      await wait(motionOn() ? 250 : 0); // 最後の一手の結果を見せてから
      S.busy = false;
      if (S.screen === 'game' && S.game === game) showStuck(kind);
    }
  }

  // ---------------------------------------------------------------- 詰み

  /** 'nomoves'（動かせる手が無い）| 'unsolvable'（手はあるが解けない）| null */
  function stuckKind() {
    const game = S.game;
    if (game.isSolved()) return null;
    if (game.isStuck()) return 'nomoves';
    if (!store.settings.stuckAlert) return null;
    return game.checkSolvable() === 'unsolvable' ? 'unsolvable' : null;
  }

  function stuckStatusText(kind) {
    return kind === 'nomoves' ? '動かせる手がありません。' : 'この盤面からはもう解けません。';
  }

  /** 戻す・試験管追加・設定変更の後に、ステータス表示だけ更新する（ポップアップは出さない）。 */
  function refreshStuckStatus() {
    const kind = stuckKind();
    if (kind) {
      setStatus(stuckStatusText(kind), true);
    } else {
      S.stuckShown = false;
      setStatus('');
    }
  }

  function showStuck(kind) {
    const game = S.game;
    select(-1);
    clearHint();
    S.stuckShown = true;
    const steps = game.stepsToSolvable();
    const canGoBack = steps > 0 && game.undoLeft >= steps;
    S.stuckSteps = steps;

    $('stuck-title').textContent = kind === 'nomoves' ? '手詰まり' : 'もう解けません';
    $('stuck-body').textContent = kind === 'nomoves' ? '動かせる手がなくなりました。' : 'この盤面からは、どう注いでもクリアできません。';
    let note;
    if (steps === 1) note = '1手戻せば、まだ解ける盤面です。';
    else if (steps >= game.moves) note = `最初の盤面（${steps}手前）まで戻る必要があります。`;
    else note = `${steps}手戻せば、まだ解ける盤面に戻れます。`;
    if (!canGoBack && steps > 0) note += `「戻す」の残りが足りないので、やり直しましょう（残り${fmt(game.undoLeft)}回）。`;
    $('stuck-note').textContent = note;
    $('stuck-note').hidden = false;

    const undoBtn = $('btn-stuck-undo');
    const restartBtn = $('btn-stuck-restart');
    undoBtn.hidden = !canGoBack;
    undoBtn.textContent = steps === 1 ? '1手戻す' : `${steps}手戻す`;
    restartBtn.className = 'btn ' + (canGoBack ? 'btn-ghost' : 'btn-primary');
    $('overlay-stuck').querySelector('.sheet-actions').classList.toggle('is-stacked', !canGoBack);

    S.stuckReturnFocus = document.activeElement;
    $('overlay-stuck').hidden = false;
    Sound.error();
    (canGoBack ? undoBtn : restartBtn).focus();
  }

  function closeStuck() {
    $('overlay-stuck').hidden = true;
    const back = S.stuckReturnFocus;
    if (back && document.contains(back)) back.focus();
  }

  function onStuckUndo() {
    const game = S.game;
    closeStuck();
    game.undoMany(S.stuckSteps);
    renderAllTubes();
    updateHud();
    refreshStuckStatus();
    Sound.undo();
  }

  function onUndo() {
    const game = S.game;
    if (S.busy || !game.canUndo()) return;
    clearHint();
    select(-1);
    const last = game.undo();
    renderTube(last.from);
    renderTube(last.to);
    updateHud();
    refreshStuckStatus();
    Sound.undo();
  }

  function onHint() {
    const game = S.game;
    if (S.busy || !game.canHint()) return;
    Sound.ensure();
    const h = game.hint();
    if (!h) return;
    if (h.stuck) {
      setStatus(stuckStatusText('unsolvable'), true);
      showStuck('unsolvable');
      return;
    }
    if (h.unknown) {
      setStatus('ヒントを見つけられませんでした。少し進めてからもう一度どうぞ。');
      return;
    }
    const [from, to] = h.move;
    clearHint();
    select(from);
    S.hint = to;
    tubeEls[to].classList.add('is-hint');
    setStatus(`持ち上げた試験管${from + 1}を、光っている試験管${to + 1}へ注いでみましょう。`);
    updateHud();
  }

  function onAddTube() {
    if (S.busy || !S.game.addTube()) return;
    clearHint();
    buildBoard();
    updateHud();
    refreshStuckStatus();
    if (!stuckKind()) setStatus('空の試験管を追加しました。★が1つ減ります。');
  }

  function onRestart() {
    if (S.busy) return;
    S.game.reset();
    S.selected = -1;
    S.hint = -1;
    S.stuckShown = false;
    $('overlay-stuck').hidden = true;
    buildBoard();
    updateHud();
    setStatus('最初からやり直します。');
  }

  // ---------------------------------------------------------------- クリア

  async function onSolved() {
    const game = S.game;
    S.busy = true;
    const stars = game.stars();
    let firstClear = false;
    if (S.mode === 'stage') {
      const prev = starsOf(S.level);
      firstClear = prev === 0;
      if (stars > prev) store.stars[S.level] = stars;
      saveStore();
    }
    Sound.clear();
    setStatus('');
    $('board').classList.add('is-cleared');
    await wait(motionOn() ? 700 : 0);
    showClear(stars, firstClear);
    S.busy = false;
  }

  function showClear(stars, firstClear) {
    const game = S.game;
    const isStage = S.mode === 'stage';
    $('clear-eyebrow').textContent = isStage
      ? `Lv.${S.level} ・ ${S.config.tier.name}`
      : `カスタム ・ ${S.config.colors}色 ・ 空き${S.config.empty}`;
    $('clear-title').textContent = 'クリア！';
    const starEls = $('clear-stars').querySelectorAll('.star');
    starEls.forEach((s, k) => s.classList.toggle('is-on', k < stars));
    $('clear-stars').setAttribute('aria-label', `★${stars} / 3`);
    $('r-moves').textContent = game.moves;
    $('r-par').textContent = game.par;

    const list = $('r-deductions');
    list.textContent = '';
    const notes = [];
    if (game.moves > game.par) notes.push('目標手数を超えた　★−1');
    if (game.moves > Math.ceil(game.par * 1.5)) notes.push('目標の1.5倍を超えた　★−1');
    if (game.assisted) notes.push('ヒントか試験管追加を使った　★−1');
    if (!notes.length) notes.push(game.moves < game.par ? `目標より${game.par - game.moves}手少なくクリア！` : '目標手数以内・アシストなし');
    for (const n of notes) list.append(el('li', null, n));

    const unlock = $('r-unlock');
    unlock.hidden = true;
    const next = $('btn-next');
    next.hidden = false;
    if (isStage) {
      const endOfTier = S.config.indexInTier === PER_TIER - 1;
      if (S.level >= TOTAL) {
        next.hidden = true;
        if (firstClear) {
          unlock.textContent = '全60レベルをクリアしました！';
          unlock.hidden = false;
        }
      } else if (endOfTier) {
        const nextTier = Levels.TIERS[S.config.tierIndex + 1];
        next.textContent = `次の段階「${nextTier.name}」へ`;
        if (firstClear) {
          unlock.textContent = `「${S.config.tier.name}」をすべてクリア！`;
          unlock.hidden = false;
        }
      } else {
        next.textContent = '次のレベルへ';
      }
    } else {
      next.textContent = '新しい問題';
    }
    $('overlay-clear').hidden = false;
    (next.hidden ? $('btn-replay') : next).focus();
  }

  // ---------------------------------------------------------------- 画面更新をまたぐ状態

  function snapshotState() {
    const inGame = S.screen === 'game' && S.game;
    return {
      v: 1,
      screen: S.screen,
      tab: S.tab,
      mode: S.mode,
      level: S.level,
      puzzle: inGame ? S.puzzle : null,
      game: inGame && !S.game.isSolved() ? S.game.snapshot() : null,
    };
  }

  function restoreState(data) {
    if (!data || data.v !== 1) return false;
    if (data.tab) selectTab(data.tab);
    if (data.screen === 'game' && data.puzzle && data.game) {
      try {
        if (data.mode === 'stage') {
          beginGame({ mode: 'stage', level: data.level, config: Levels.levelConfig(data.level), puzzle: data.puzzle, snapshot: data.game });
        } else {
          beginGame({ mode: 'custom', level: 0, config: Levels.customConfig(store.custom), puzzle: data.puzzle, snapshot: data.game });
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- 起動

  function bindEvents() {
    $('btn-continue').addEventListener('click', () => startStage(continueLevel()));

    $('tiers').addEventListener('click', (e) => {
      const btn = e.target.closest('.lv');
      if (btn && !btn.disabled) startStage(Number(btn.dataset.level));
    });

    const tabs = ['stage', 'custom', 'howto'];
    tabs.forEach((name, idx) => {
      const tab = $('tab-' + name);
      tab.addEventListener('click', () => selectTab(name));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(next);
        $('tab-' + next).focus();
      });
    });

    for (const id of ['c-colors', 'c-capacity', 'c-empty', 'c-hidden']) $(id).addEventListener('input', syncCustomForm);
    $('custom-form').addEventListener('submit', (e) => {
      e.preventDefault();
      syncCustomForm();
      startCustom();
    });

    $('s-sound').addEventListener('change', (e) => {
      store.settings.sound = e.target.checked;
      saveStore();
    });
    $('s-marks').addEventListener('change', (e) => {
      store.settings.marks = e.target.checked;
      saveStore();
      if (S.game) renderAllTubes();
    });
    $('s-motion').addEventListener('change', (e) => {
      store.settings.motion = e.target.checked;
      saveStore();
      applySettings();
    });
    $('s-stuck').addEventListener('change', (e) => {
      store.settings.stuckAlert = e.target.checked;
      saveStore();
      if (S.screen === 'game' && S.game && !S.game.isSolved()) refreshStuckStatus();
    });
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', applySettings);

    $('btn-reset').addEventListener('click', () => {
      $('reset-confirm').hidden = false;
      $('btn-reset-no').focus();
    });
    $('btn-reset-no').addEventListener('click', () => {
      $('reset-confirm').hidden = true;
    });
    $('btn-reset-yes').addEventListener('click', () => {
      store.stars = {};
      store.last = 1;
      saveStore();
      $('reset-confirm').hidden = true;
      renderHome();
    });

    $('board').addEventListener('click', (e) => {
      const tube = e.target.closest('.tube');
      if (tube) onTubeTap(Number(tube.dataset.index));
    });
    $('btn-back').addEventListener('click', () => {
      if (S.busy) return;
      showScreen('home');
    });
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-hint').addEventListener('click', onHint);
    $('btn-add').addEventListener('click', onAddTube);
    $('btn-restart').addEventListener('click', onRestart);

    $('btn-stuck-undo').addEventListener('click', onStuckUndo);
    $('btn-stuck-restart').addEventListener('click', onRestart);
    $('btn-stuck-close').addEventListener('click', closeStuck);

    $('btn-next').addEventListener('click', () => {
      if (S.mode === 'stage') startStage(S.level + 1);
      else startCustom();
    });
    $('btn-replay').addEventListener('click', () => {
      if (S.mode === 'stage') startStage(S.level);
      else startCustom(S.puzzle);
    });
    $('btn-menu').addEventListener('click', () => {
      $('overlay-clear').hidden = true;
      selectTab(S.mode === 'custom' ? 'custom' : 'stage');
      showScreen('home');
    });

    document.addEventListener('keydown', (e) => {
      if (S.screen !== 'game' || !$('overlay-clear').hidden) return;
      if (!$('overlay-stuck').hidden) {
        if (e.key === 'Escape') closeStuck();
        return;
      }
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        onUndo();
      } else if (key === 'h') {
        onHint();
      } else if (key === 'r' && !e.ctrlKey && !e.metaKey) {
        onRestart();
      } else if (key === 'escape') {
        select(-1);
      }
    });

    // 画面サイズが変わったら盤面を組み直す
    let raf = 0;
    const relayout = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (S.screen !== 'game' || !S.game) return;
        if (S.busy) S.needsLayout = true;
        else buildBoard();
      });
    };
    if (window.ResizeObserver) new ResizeObserver(relayout).observe($('board-wrap'));
    else window.addEventListener('resize', relayout);
  }

  function start(data) {
    bindEvents();
    applySettings();
    renderTierTable();
    $('c-colors').value = store.custom.colors;
    $('c-capacity').value = store.custom.capacity;
    $('c-empty').value = store.custom.empty;
    $('c-hidden').checked = !!store.custom.hidden;
    syncCustomForm();
    selectTab('stage');
    if (!restoreState(data)) showScreen('home');
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(snapshotState);
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
