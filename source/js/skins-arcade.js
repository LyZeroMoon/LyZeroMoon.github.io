/*!
 * 街机皮肤的内置小游戏：贪吃蛇
 * ---------------------------------------------------------------------------
 * 这个文件**不会**在页面加载时下载。前台只渲染一个入口按钮，
 * 真正点开时才由 /js/skins.js 里的 loadGame() 动态插入 <script>。
 * （skins.js 里那一小段是唯一知道这里的地方。）
 *
 * 分两层：
 *   1) LY_ARCADE_CORE —— 纯逻辑，不碰 DOM、不碰 canvas。规则（吃到变长、
 *      撞墙/撞自己判负、180° 掉头无效、速度随分数提升）全在这里，
 *      所以用 jsdom 就能直接跑单元测试，不需要真的渲染。
 *   2) LY_ARCADE      —— 外壳：建 DOM、管生命周期、键盘/触摸、rAF 循环、绘制。
 *
 * 机台配色是固定的霓虹色，不读皮肤的 CSS 变量 —— 它是一台「设备」，
 * 从任何皮肤打开都该长一个样（也让自动化测试不依赖 :root 上挂没挂 data-ui）。
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  if (window.LY_ARCADE) return;

  /* ==========================================================================
     一、纯逻辑
     ========================================================================== */

  var COLS = 20;
  var ROWS = 20;

  /* 把方向名转成向量，键盘和方向键面板共用 */
  var DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function defaultPick(n) {
    return Math.floor(Math.random() * n);
  }

  function createGame(opts) {
    var o = opts || {};
    var cols = o.cols || COLS;
    var rows = o.rows || ROWS;
    var g = {
      cols: cols,
      rows: rows,
      snake: [],
      dir: { x: 1, y: 0 },      // 头朝右
      pendingDir: null,          // 本 tick 内按下的方向，tick 时生效
      food: null,
      score: 0,
      level: 1,
      alive: true,
      paused: false,
      started: false,
      tickMs: 150,
      deathReason: '',
      eatenAt: -1,               // 最近一次吃到的时刻，用来画闪光
      eatenCell: null,
      pick: o.pick || defaultPick
    };

    var cy = Math.floor(rows / 2);
    var len = Math.min(3, Math.max(2, cols - 2));
    for (var i = 0; i < len; i++) {
      g.snake.push({ x: len - 1 - i, y: cy });   // index 0 是头
    }

    spawnFood(g);
    return g;
  }

  /* 在没被蛇占的格子里随机挑一个；挑不出来说明满屏了，food 置空 */
  function spawnFood(g, pick) {
    var occupied = Object.create(null);
    var i;
    for (i = 0; i < g.snake.length; i++) {
      occupied[g.snake[i].x + ':' + g.snake[i].y] = 1;
    }
    var free = [];
    for (var y = 0; y < g.rows; y++) {
      for (var x = 0; x < g.cols; x++) {
        if (!occupied[x + ':' + y]) free.push({ x: x, y: y });
      }
    }
    if (!free.length) {
      g.food = null;
      return null;
    }
    var idx = (pick || g.pick || defaultPick)(free.length);
    if (idx < 0 || idx >= free.length) idx = 0;
    g.food = free[idx];
    return g.food;
  }

  /* 接受 'up' | 'down' | 'left' | 'right' 或 {x, y}；返回是否被采纳 */
  function setDirection(g, dir) {
    var v = typeof dir === 'string' ? DIRS[dir] : dir;
    if (!v || (!v.x && !v.y)) return false;
    if (v.x && v.y) return false;                       // 只允许正方向
    /* 和「即将生效的方向」比而不是和当前方向比：一个 tick 内连按两次
       （比如向右时先上再左）也能正确走出折线，而不是被判成掉头丢掉一次 */
    var base = g.pendingDir || g.dir;
    if (base.x === -v.x && base.y === -v.y) return false;
    if (base.x === v.x && base.y === v.y) return false;
    g.pendingDir = { x: v.x, y: v.y };
    return true;
  }

  var SPEED_UP_EVERY = 50;    // 每 50 分升一级
  var MIN_TICK = 60;

  /* 推进一格。返回 'move' | 'eat' | 'wall' | 'self' | 'idle' */
  function step(g) {
    if (!g.alive || g.paused || !g.started) return 'idle';
    if (g.pendingDir) {
      g.dir = g.pendingDir;
      g.pendingDir = null;
    }

    var head = g.snake[0];
    var nx = head.x + g.dir.x;
    var ny = head.y + g.dir.y;

    if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) {
      g.alive = false;
      g.deathReason = 'wall';
      return 'wall';
    }

    var willEat = !!(g.food && g.food.x === nx && g.food.y === ny);
    /* 不吃东西时尾巴会同时让出一格，所以撞到「当前尾巴」不算死 */
    var limit = willEat ? g.snake.length : g.snake.length - 1;
    for (var i = 0; i < limit; i++) {
      if (g.snake[i].x === nx && g.snake[i].y === ny) {
        g.alive = false;
        g.deathReason = 'self';
        return 'self';
      }
    }

    g.snake.unshift({ x: nx, y: ny });

    if (willEat) {
      g.score += 10;
      g.eatenCell = { x: nx, y: ny };
      var lv = 1 + Math.floor(g.score / SPEED_UP_EVERY);
      if (lv !== g.level) {
        g.level = lv;
        g.tickMs = Math.max(MIN_TICK, 150 - (lv - 1) * 14);
      }
      spawnFood(g);
      return 'eat';
    }

    g.snake.pop();
    return 'move';
  }

  /* 开局 / 重开。保留 cols/rows/pick，重新铺一条蛇 */
  function resetGame(g) {
    var fresh = createGame({ cols: g.cols, rows: g.rows, pick: g.pick });
    g.snake = fresh.snake;
    g.dir = fresh.dir;
    g.pendingDir = null;
    g.food = fresh.food;
    g.score = 0;
    g.level = 1;
    g.alive = true;
    g.paused = false;
    g.started = false;
    g.tickMs = 150;
    g.deathReason = '';
    g.eatenAt = -1;
    g.eatenCell = null;
    return g;
  }

  var CORE = {
    COLS: COLS,
    ROWS: ROWS,
    DIRS: DIRS,
    SPEED_UP_EVERY: SPEED_UP_EVERY,
    MIN_TICK: MIN_TICK,
    createGame: createGame,
    resetGame: resetGame,
    spawnFood: spawnFood,
    setDirection: setDirection,
    step: step,
    /* 便捷判定，测试里读起来更直观 */
    isAlive: function (g) { return !!g.alive; },
    occupied: function (g, x, y) {
      for (var i = 0; i < g.snake.length; i++) {
        if (g.snake[i].x === x && g.snake[i].y === y) return true;
      }
      return false;
    }
  };

  /* 逻辑先挂出去 —— 即使后面 DOM 部分因为环境（比如 jsdom 没有 canvas 2d）
     出问题，纯逻辑依然可用 */
  window.LY_ARCADE_CORE = CORE;

  /* ==========================================================================
     二、外壳
     ========================================================================== */

  var CELL = 20;
  var CANVAS_SIZE = COLS * CELL;                 // 400
  var BEST_KEY = 'ly_arcade_snake_best';
  var MASK_ID = 'arc-mask';

  var mask = null;
  var refs = {};
  var game = null;
  var ctx = null;
  var rafId = 0;
  var lastFrame = 0;
  var acc = 0;
  var lastFocus = null;
  var keysBound = false;
  var best = 0;
  var touchStart = null;

  /* ------------------------------ 小工具 ------------------------------ */

  var CLOSE_SVG =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"/></svg>';

  function readBest() {
    try {
      var v = parseInt(localStorage.getItem(BEST_KEY), 10);
      return isNaN(v) || v < 0 ? 0 : v;
    } catch (e) {
      return 0;
    }
  }

  function writeBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {}
  }

  /* #rrggbb 之间线性插值，给蛇身做渐变 */
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16);
    var pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16 & 255) + (((pb >> 16 & 255) - (pa >> 16 & 255)) * t));
    var g = Math.round((pa >> 8 & 255) + (((pb >> 8 & 255) - (pa >> 8 & 255)) * t));
    var bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* ------------------------------ DOM ------------------------------ */

  function build() {
    if (mask) return mask;
    if (!document.body) return null;

    mask = document.createElement('div');
    mask.className = 'arc-mask';
    mask.id = MASK_ID;
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '贪吃蛇');
    mask.innerHTML =
      '<div class="arc-cabinet" tabindex="-1">' +
        '<div class="arc-head">' +
          '<span class="arc-title">SNAKE.EXE</span>' +
          '<button type="button" class="arc-close" aria-label="关闭">' + CLOSE_SVG + '</button>' +
        '</div>' +
        '<div class="arc-hud">' +
          '<div class="arc-hud-cell"><span>SCORE</span><b data-hud="score">0</b></div>' +
          '<div class="arc-hud-cell"><span>HI-SCORE</span><b data-hud="best">0</b></div>' +
          '<div class="arc-hud-cell"><span>LEVEL</span><b data-hud="level">1</b></div>' +
        '</div>' +
        '<div class="arc-screen">' +
          '<canvas class="arc-canvas" width="' + CANVAS_SIZE + '" height="' + CANVAS_SIZE +
            '" aria-label="贪吃蛇游戏画面"></canvas>' +
          '<div class="arc-overlay" data-overlay>' +
            '<span class="arc-overlay-text" data-overlay-text>PRESS START</span>' +
            '<span class="arc-overlay-tip" data-overlay-tip></span>' +
          '</div>' +
        '</div>' +
        '<div class="arc-pad">' +
          '<button type="button" data-dir="up" aria-label="上">\u25b2</button>' +
          '<button type="button" data-dir="left" aria-label="左">\u25c0</button>' +
          '<button type="button" data-dir="down" aria-label="下">\u25bc</button>' +
          '<button type="button" data-dir="right" aria-label="右">\u25b6</button>' +
        '</div>' +
        '<div class="arc-foot">' +
          '<button type="button" data-act="start">开始</button>' +
          '<button type="button" data-act="reset">重置</button>' +
          '<span class="arc-hint">方向键 / WASD 转向 \u00b7 空格开始或暂停 \u00b7 Esc 关闭</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);

    refs.cabinet = mask.querySelector('.arc-cabinet');
    refs.canvas = mask.querySelector('.arc-canvas');
    refs.overlay = mask.querySelector('[data-overlay]');
    refs.overlayText = mask.querySelector('[data-overlay-text]');
    refs.overlayTip = mask.querySelector('[data-overlay-tip]');
    refs.start = mask.querySelector('[data-act="start"]');
    refs.hud = {
      score: mask.querySelector('[data-hud="score"]'),
      best: mask.querySelector('[data-hud="best"]'),
      level: mask.querySelector('[data-hud="level"]')
    };

    /* jsdom 里没有 2d 上下文，拿不到就退化成「无画面」模式：
       逻辑照跑、HUD 照更新，只是画不出来，而不是整个面板崩掉 */
    ctx = refs.canvas.getContext ? refs.canvas.getContext('2d') : null;

    mask.addEventListener('click', function (e) {
      var t = e.target;
      if (t === mask) {
        close();
        return;
      }
      if (!t.closest) return;
      if (t.closest('.arc-close')) {
        close();
        return;
      }
      var dirBtn = t.closest('[data-dir]');
      if (dirBtn) {
        turn(dirBtn.getAttribute('data-dir'));
        return;
      }
      var actBtn = t.closest('[data-act]');
      if (actBtn) {
        var act = actBtn.getAttribute('data-act');
        if (act === 'start') primaryAction();
        else if (act === 'reset') doReset();
      }
    });

    /* 触摸滑动 */
    var screen = mask.querySelector('.arc-screen');
    screen.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    screen.addEventListener('touchend', function (e) {
      if (!touchStart) return;
      var t0 = e.changedTouches && e.changedTouches[0];
      if (!t0) { touchStart = null; return; }
      var dx = t0.clientX - touchStart.x;
      var dy = t0.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;   // 当成点击，不算滑动
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
      else turn(dy > 0 ? 'down' : 'up');
    }, { passive: true });

    return mask;
  }

  /* ------------------------------ 键盘 ------------------------------ */

  var KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  function onKeydown(e) {
    if (!isOpen()) return;
    var key = e.key;

    if (key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    var dir = KEY_MAP[key];
    if (dir) {
      /* 方向键默认会滚动页面，一律拦掉；面板开着的时候页面本来也不该动 */
      e.preventDefault();
      turn(dir);
      return;
    }

    if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
      e.preventDefault();
      primaryAction();
      return;
    }

    if (key === 'r' || key === 'R') {
      e.preventDefault();
      doReset();
    }
  }

  function bindKeys() {
    if (keysBound) return;
    document.addEventListener('keydown', onKeydown, true);
    keysBound = true;
  }

  function unbindKeys() {
    if (!keysBound) return;
    document.removeEventListener('keydown', onKeydown, true);
    keysBound = false;
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function draw(now) {
    if (!ctx || !game) return;
    var size = CANVAS_SIZE;
    var cw = size / game.cols;
    var ch = size / game.rows;
    var i;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(123,92,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 1; i < game.cols; i++) {
      ctx.moveTo(i * cw, 0);
      ctx.lineTo(i * cw, size);
    }
    for (i = 1; i < game.rows; i++) {
      ctx.moveTo(0, i * ch);
      ctx.lineTo(size, i * ch);
    }
    ctx.stroke();

    /* 吃到食物时在那一格闪一下 */
    if (game.eatenCell && now - game.eatenAt < 220) {
      var k = 1 - (now - game.eatenAt) / 220;
      ctx.strokeStyle = 'rgba(255,214,10,' + (0.75 * k).toFixed(3) + ')';
      ctx.lineWidth = 3;
      var r = (cw / 2) * (1 + k * 1.6);
      ctx.beginPath();
      ctx.arc((game.eatenCell.x + 0.5) * cw, (game.eatenCell.y + 0.5) * ch, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (game.food) {
      var pulse = 0.62 + 0.38 * Math.sin(now / 190);
      ctx.save();
      ctx.shadowColor = 'rgba(255,214,10,0.95)';
      ctx.shadowBlur = 10 + 10 * pulse;
      ctx.fillStyle = '#ffd60a';
      var pad = cw * 0.18;
      ctx.fillRect(game.food.x * cw + pad, game.food.y * ch + pad,
        cw - pad * 2, ch - pad * 2);
      ctx.restore();
    }

    var n = game.snake.length;
    for (i = n - 1; i >= 0; i--) {
      var seg = game.snake[i];
      var t = n > 1 ? i / (n - 1) : 0;
      ctx.fillStyle = i === 0 ? '#00f5d4' : mixHex('#00f5d4', '#7b5cff', t);
      if (i === 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,245,212,0.95)';
        ctx.shadowBlur = 14;
      }
      var inset = i === 0 ? 1 : 2;
      ctx.fillRect(seg.x * cw + inset, seg.y * ch + inset, cw - inset * 2, ch - inset * 2);
      if (i === 0) ctx.restore();
    }

    /* 蛇头两点「眼睛」，朝当前方向 */
    if (n) {
      var head = game.snake[0];
      var ex = 0.5 + game.dir.x * 0.16;
      var ey = 0.5 + game.dir.y * 0.16;
      var ox = game.dir.x ? 0 : 0.2;
      var oy = game.dir.y ? 0 : 0.2;
      ctx.fillStyle = '#05010f';
      ctx.fillRect((head.x + ex - ox) * cw - cw * 0.06, (head.y + ey - oy) * ch - ch * 0.06,
        cw * 0.12, ch * 0.12);
      ctx.fillRect((head.x + ex + ox) * cw - cw * 0.06, (head.y + ey + oy) * ch - ch * 0.06,
        cw * 0.12, ch * 0.12);
    }
  }

  function frame(now) {
    rafId = window.requestAnimationFrame(frame);
    if (!game) return;

    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    lastFrame = now;
    if (dt > 250) dt = 250;          // 切走标签页回来别一次补一大堆 tick

    if (game.started && game.alive && !game.paused) {
      acc += dt;
      var guard = 0;
      while (acc >= game.tickMs && guard++ < 12) {
        acc -= game.tickMs;
        var r = step(game);
        if (r === 'eat') {
          game.eatenAt = now;
          syncHud();
        } else if (r === 'wall' || r === 'self') {
          acc = 0;
          onDead();
          break;
        }
      }
    } else {
      acc = 0;
    }

    draw(now);
  }

  function startLoop() {
    if (rafId) return;
    lastFrame = 0;
    acc = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!rafId) return;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ------------------------------ 状态 ------------------------------ */

  function syncHud() {
    if (!refs.hud || !game) return;
    refs.hud.score.textContent = String(game.score);
    refs.hud.best.textContent = String(best);
    refs.hud.level.textContent = String(game.level);
  }

  function syncOverlay() {
    if (!refs.overlay || !game) return;
    var show = !game.started || game.paused || !game.alive;
    refs.overlay.style.display = show ? '' : 'none';
    if (!show) return;

    if (!game.alive) {
      refs.overlayText.textContent = 'GAME OVER';
      refs.overlayText.classList.add('is-over');
      refs.overlayTip.textContent = '得分 ' + game.score +
        (game.score >= best && game.score > 0 ? ' \u00b7 新纪录！' : '') +
        ' \u00b7 按空格再来一局';
    } else if (game.paused) {
      refs.overlayText.textContent = 'PAUSED';
      refs.overlayText.classList.remove('is-over');
      refs.overlayTip.textContent = '按空格继续';
    } else {
      refs.overlayText.textContent = 'PRESS START';
      refs.overlayText.classList.remove('is-over');
      refs.overlayTip.textContent = game.score ? ('当前得分 ' + game.score) : '方向键 / WASD 转向';
    }
  }

  function syncButtons() {
    if (!refs.start || !game) return;
    if (!game.alive) refs.start.textContent = '再来一局';
    else if (game.paused) refs.start.textContent = '继续';
    else if (game.started) refs.start.textContent = '暂停';
    else refs.start.textContent = '开始';
  }

  function syncAll() {
    syncHud();
    syncOverlay();
    syncButtons();
  }

  function onDead() {
    if (game.score > best) {
      best = game.score;
      writeBest(best);
    }
    syncAll();
  }

  /* ------------------------------ 动作 ------------------------------ */

  function turn(dir) {
    if (!game || !game.started || !game.alive) return false;
    return setDirection(game, dir);
  }

  /* 空格 / 主按钮：待开局→开局，运行中→暂停，暂停→继续，结束→重开 */
  function primaryAction() {
    if (!game) return;
    if (!game.alive) {
      doReset();
      start();
      return;
    }
    if (!game.started) {
      start();
      return;
    }
    game.paused = !game.paused;
    acc = 0;
    syncAll();
  }

  function start() {
    if (!game) return;
    game.started = true;
    game.paused = false;
    acc = 0;
    syncAll();
  }

  function doReset() {
    if (!game) return;
    resetGame(game);
    syncAll();
  }

  /* ------------------------------ 生命周期 ------------------------------ */

  function isOpen() {
    return !!(mask && mask.classList.contains('show'));
  }

  function open() {
    if (!document.body) return;
    if (!build()) return;
    if (!game) game = createGame();
    best = readBest();

    mask.classList.add('show');
    document.body.classList.add('arc-lock');
    lastFocus = document.activeElement;

    /* 每次打开都是全新一局，停在「按空格开局」 */
    resetGame(game);
    syncAll();
    draw(window.performance && window.performance.now ? window.performance.now() : Date.now());

    bindKeys();
    startLoop();
    if (refs.cabinet && refs.cabinet.focus) {
      try { refs.cabinet.focus(); } catch (e) {}
    }
  }

  function close() {
    if (!mask) return;
    mask.classList.remove('show');
    document.body.classList.remove('arc-lock');
    stopLoop();
    unbindKeys();
    if (game) game.paused = true;
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  window.LY_ARCADE = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    /* 给测试和调试用 */
    core: CORE,
    game: function () { return game; },
    newGame: function (opts) { game = createGame(opts); best = readBest(); syncAll(); return game; },
    el: function () { return mask; },
    refs: function () { return refs; }
  };

})(window, document);
