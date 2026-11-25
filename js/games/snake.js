/*!
 * 贪吃蛇
 * ---------------------------------------------------------------------------
 * 规则：吃到食物变长 +10 分；撞墙或咬到自己结束；每 50 分升一级、步长缩短一档
 * （最低 60ms）。不吃东西时尾巴会让出一格，所以「追着自己尾巴走」不算死。
 * 方向只在 tick 生效（pendingDir），一个 tick 内连按两次不丢招。
 * ---------------------------------------------------------------------------
 */

(function (window) {
  'use strict';

  var KIT = window.LY_GAME_KIT;
  if (!KIT) return;

  var COLS = 20;
  var ROWS = 20;
  var CELL = 20;
  var START_TICK = 150;
  var MIN_TICK = 60;
  var SPEED_UP_EVERY = 50;

  var DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function pick(n) { return Math.floor(Math.random() * n); }

  function spawnFood(st) {
    var occupied = Object.create(null);
    var i;
    for (i = 0; i < st.snake.length; i++) {
      occupied[st.snake[i].x + ':' + st.snake[i].y] = 1;
    }
    var free = [];
    for (var y = 0; y < st.rows; y++) {
      for (var x = 0; x < st.cols; x++) {
        if (!occupied[x + ':' + y]) free.push({ x: x, y: y });
      }
    }
    st.food = free.length ? free[pick(free.length)] : null;
    return st.food;
  }

  function reset(st) {
    var cy = Math.floor(st.rows / 2);
    st.snake = [{ x: 2, y: cy }, { x: 1, y: cy }, { x: 0, y: cy }];
    st.dir = { x: 1, y: 0 };
    st.pendingDir = null;
    st.score = 0;
    st.level = 1;
    st.alive = true;
    st.tickMs = START_TICK;
    st.deathReason = '';
    st.eatenCell = null;
    st.eatenAt = -1;
    spawnFood(st);
  }

  function create() {
    var st = {
      cols: COLS,
      rows: ROWS,
      snake: [],
      dir: { x: 1, y: 0 },
      pendingDir: null,
      food: null,
      score: 0,
      level: 1,
      alive: true,
      tickMs: START_TICK,
      deathReason: '',
      eatenCell: null,
      eatenAt: -1
    };
    reset(st);
    return st;
  }

  function turn(st, action) {
    var v = DIRS[action];
    if (!v) return false;
    /* 和「即将生效的方向」比而不是和当前方向比：一个 tick 内连按两次也能走折线 */
    var base = st.pendingDir || st.dir;
    if (base.x === -v.x && base.y === -v.y) return false;
    if (base.x === v.x && base.y === v.y) return false;
    st.pendingDir = { x: v.x, y: v.y };
    return true;
  }

  /* 推进一格。返回 'move' | 'eat' | 'wall' | 'self' */
  function advance(st) {
    if (!st.alive) return null;
    if (st.pendingDir) {
      st.dir = st.pendingDir;
      st.pendingDir = null;
    }

    var head = st.snake[0];
    var nx = head.x + st.dir.x;
    var ny = head.y + st.dir.y;

    if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) {
      st.alive = false;
      st.deathReason = 'wall';
      return 'wall';
    }

    var willEat = !!(st.food && st.food.x === nx && st.food.y === ny);
    var limit = willEat ? st.snake.length : st.snake.length - 1;
    for (var i = 0; i < limit; i++) {
      if (st.snake[i].x === nx && st.snake[i].y === ny) {
        st.alive = false;
        st.deathReason = 'self';
        return 'self';
      }
    }

    st.snake.unshift({ x: nx, y: ny });

    if (willEat) {
      st.score += 10;
      st.eatenCell = { x: nx, y: ny };
      var lv = 1 + Math.floor(st.score / SPEED_UP_EVERY);
      if (lv !== st.level) {
        st.level = lv;
        st.tickMs = Math.max(MIN_TICK, START_TICK - (lv - 1) * 14);
      }
      spawnFood(st);
      return 'eat';
    }
    st.snake.pop();
    return 'move';
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16);
    var pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16 & 255) + (((pb >> 16 & 255) - (pa >> 16 & 255)) * t));
    var g = Math.round((pa >> 8 & 255) + (((pb >> 8 & 255) - (pa >> 8 & 255)) * t));
    var bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function draw(c, st, now) {
    var size = COLS * CELL;
    var cw = size / st.cols;
    var ch = size / st.rows;
    var i;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, size, size);
    c.fillStyle = '#05010f';
    c.fillRect(0, 0, size, size);

    c.strokeStyle = 'rgba(123,92,255,0.16)';
    c.lineWidth = 1;
    c.beginPath();
    for (i = 1; i < st.cols; i++) { c.moveTo(i * cw, 0); c.lineTo(i * cw, size); }
    for (i = 1; i < st.rows; i++) { c.moveTo(0, i * ch); c.lineTo(size, i * ch); }
    c.stroke();

    if (st.eatenCell && now - st.eatenAt < 220) {
      var k = 1 - (now - st.eatenAt) / 220;
      c.strokeStyle = 'rgba(255,214,10,' + (0.75 * k).toFixed(3) + ')';
      c.lineWidth = 3;
      c.beginPath();
      c.arc((st.eatenCell.x + 0.5) * cw, (st.eatenCell.y + 0.5) * ch,
        (cw / 2) * (1 + k * 1.6), 0, Math.PI * 2);
      c.stroke();
    }

    if (st.food) {
      var pulse = 0.62 + 0.38 * Math.sin(now / 190);
      c.save();
      c.shadowColor = 'rgba(255,214,10,0.95)';
      c.shadowBlur = 10 + 10 * pulse;
      c.fillStyle = '#ffd60a';
      var pad = cw * 0.18;
      c.fillRect(st.food.x * cw + pad, st.food.y * ch + pad, cw - pad * 2, ch - pad * 2);
      c.restore();
    }

    var n = st.snake.length;
    for (i = n - 1; i >= 0; i--) {
      var seg = st.snake[i];
      var t = n > 1 ? i / (n - 1) : 0;
      var inset = i === 0 ? 1 : 2;
      if (i === 0) {
        c.save();
        c.shadowColor = 'rgba(0,245,212,0.95)';
        c.shadowBlur = 14;
        c.fillStyle = '#00f5d4';
      } else {
        c.fillStyle = mixHex('#00f5d4', '#7b5cff', t);
      }
      c.fillRect(seg.x * cw + inset, seg.y * ch + inset, cw - inset * 2, ch - inset * 2);
      if (i === 0) c.restore();
    }

    if (n) {
      var head = st.snake[0];
      var ex = 0.5 + st.dir.x * 0.16;
      var ey = 0.5 + st.dir.y * 0.16;
      var ox = st.dir.x ? 0 : 0.2;
      var oy = st.dir.y ? 0 : 0.2;
      c.fillStyle = '#05010f';
      c.fillRect((head.x + ex - ox) * cw - cw * 0.06, (head.y + ey - oy) * ch - ch * 0.06,
        cw * 0.12, ch * 0.12);
      c.fillRect((head.x + ex + ox) * cw - cw * 0.06, (head.y + ey + oy) * ch - ch * 0.06,
        cw * 0.12, ch * 0.12);
    }
  }

  window.LY_GAME_SNAKE = {
    create: create, reset: reset, advance: advance, turn: turn, spawnFood: spawnFood,
    COLS: COLS, ROWS: ROWS, START_TICK: START_TICK, MIN_TICK: MIN_TICK
  };

  KIT.register({
    id: 'snake',
    mode: 'tick',
    stepMs: START_TICK,
    view: { w: COLS * CELL, h: ROWS * CELL },
    pointerMode: 'swipe',
    hint: '方向键 / WASD 转向 · 空格开始或暂停 · 手机上可以直接划屏幕',
    pad: { confirm: '暂停' },

    create: create,
    reset: reset,

    tick: function (st, now) {
      if (advance(st) === 'eat') st.eatenAt = now;
    },

    key: function (st, action) {
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        turn(st, action);
        return true;
      }
      return false;
    },

    draw: draw,
    over: function (st) { return !st.alive; },
    overTitle: function (st) { return st.deathReason === 'self' ? '咬到自己了' : 'GAME OVER'; },
    score: function (st) { return st.score; },
    bestValue: function (st) { return st.score; },
    hud: function (st, best) {
      return [String(st.score), best == null ? '0' : String(best), String(st.level)];
    }
  });

})(window);
