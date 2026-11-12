/*!
 * 俄罗斯方块
 * ---------------------------------------------------------------------------
 * 规则：七种方块从上方落下，左右移动、上键旋转、下键速降、空格直接落底。
 * 填满一整行就消除，消得越多分越高；每 10 行升一级，落得越来越快。
 *
 * 用的是「7-bag」随机器：把七种方块洗牌后依次发完再洗下一轮，
 * 所以不会出现连续十几个方块都不给你那根长条（纯随机会，而且很招人烦）。
 *
 * 输入走 mode='tick' + key() 直接改状态：左右移动和旋转要「按下去就有反应」，
 * 不能等下一个重力 tick；按键 autorepeat 被引擎放行，按住下键就是连续速降。
 * ---------------------------------------------------------------------------
 */

(function (window) {
  'use strict';

  var KIT = window.LY_GAME_KIT;
  if (!KIT) return;

  var COLS = 10;
  var ROWS = 20;
  var CELL = 20;
  var FIELD_W = COLS * CELL;
  var VIEW_H = ROWS * CELL;
  var PANEL_W = 60;
  var VIEW_W = FIELD_W + PANEL_W;
  var BASE_TICK = 800;
  var MIN_TICK = 80;
  var LINE_SCORE = [0, 40, 100, 300, 1200];

  /* 每个方块用方阵表示，旋转就是把矩阵转 90°（方阵才能原地转） */
  var SHAPES = {
    I: { cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#22d3ee' },
    J: { cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: '#7b5cff' },
    L: { cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: '#ff9f1c' },
    O: { cells: [[1, 1], [1, 1]], color: '#ffd60a' },
    S: { cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: '#3ddc84' },
    T: { cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: '#ff2e97' },
    Z: { cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: '#ff4d4d' }
  };
  var KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  function at(st, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 0;
    return st.board[y * COLS + x];
  }

  function setCell(st, x, y, v) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    st.board[y * COLS + x] = v;
  }

  function refillBag(st) {
    var bag = KINDS.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(st.rng() * (i + 1));
      if (j > i) j = i;
      var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    st.bag = bag;
  }

  function takeKind(st) {
    if (!st.bag || !st.bag.length) refillBag(st);
    return st.bag.pop();
  }

  function makePiece(st, kind, color) {
    var def = SHAPES[kind];
    var m = [];
    for (var y = 0; y < def.cells.length; y++) m.push(def.cells[y].slice());
    return {
      kind: kind,
      color: color || def.color,
      m: m,
      x: Math.floor((COLS - m.length) / 2),
      y: 0
    };
  }

  /* 旋转后的矩阵（顺时针）。O 是 2×2，转了也一样，直接跳过省事 */
  function rotated(m) {
    var n = m.length;
    var out = [];
    for (var y = 0; y < n; y++) {
      out.push([]);
      for (var x = 0; x < n; x++) out[y].push(m[n - 1 - x][y]);
    }
    return out;
  }

  function collides(st, m, px, py) {
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m.length; x++) {
        if (!m[y][x]) continue;
        var bx = px + x;
        var by = py + y;
        if (bx < 0 || bx >= COLS) return true;
        if (by >= ROWS) return true;
        if (by >= 0 && st.board[by * COLS + bx]) return true;
      }
    }
    return false;
  }

  function spawn(st) {
    var kind = st.nextKind || takeKind(st);
    st.nextKind = null;
    st.piece = makePiece(st, kind, st.nextColor);
    st.nextKind = takeKind(st);
    st.nextColor = SHAPES[st.nextKind].color;
    /* 出生点就被占住 = 堆到顶了 */
    if (collides(st, st.piece.m, st.piece.x, st.piece.y)) {
      st.over = true;
      return false;
    }
    st.spawnAt = st.now || 0;
    return true;
  }

  function reset(st) {
    st.board = new Array(COLS * ROWS).fill(0);
    st.score = 0;
    st.lines = 0;
    st.level = 1;
    st.over = false;
    st.tickMs = BASE_TICK;
    st.piece = null;
    st.bag = [];
    st.nextKind = null;
    st.nextColor = null;
    st.lastClear = null;
    st.lastClearAt = -1;
    st.lockedAt = -1;
    refillBag(st);
    /* spawn() 会自己把 nextKind / nextColor 填上，这里不要再抽一次 ——
       多抽一次不但白白吃掉一个方块，还会破坏 7-bag 的公平性 */
    spawn(st);
    return st;
  }

  function create() {
    var st = { rng: Math.random, now: 0 };
    return reset(st);
  }

  function move(st, dx) {
    if (!st.piece || st.over) return false;
    if (collides(st, st.piece.m, st.piece.x + dx, st.piece.y)) return false;
    st.piece.x += dx;
    return true;
  }

  /* 上键旋转。贴墙时往左右各推一格再试（踢墙），转不动就保持原样 */
  function rotate(st) {
    if (!st.piece || st.over) return false;
    if (st.piece.kind === 'O') return false;
    var m = rotated(st.piece.m);
    var kicks = [0, -1, 1, -2, 2];
    for (var i = 0; i < kicks.length; i++) {
      if (!collides(st, m, st.piece.x + kicks[i], st.piece.y)) {
        st.piece.m = m;
        st.piece.x += kicks[i];
        return true;
      }
    }
    return false;
  }

  /* 把当前方块写进棋盘，返回消除的行数 */
  function lock(st) {
    var p = st.piece;
    if (!p) return 0;
    for (var y = 0; y < p.m.length; y++) {
      for (var x = 0; x < p.m.length; x++) {
        if (p.m[y][x]) setCell(st, p.x + x, p.y + y, p.kind);
      }
    }
    st.piece = null;
    st.lockedAt = st.now || 0;

    var cleared = 0;
    for (var ry = ROWS - 1; ry >= 0; ry--) {
      var full = true;
      for (var rx = 0; rx < COLS; rx++) {
        if (!st.board[ry * COLS + rx]) { full = false; break; }
      }
      if (!full) continue;
      st.board.splice(ry * COLS, COLS);
      for (var k = 0; k < COLS; k++) st.board.unshift(0);
      cleared++;
      ry++;                       /* 上面那行落下来了，同一位置要重新检查 */
    }

    if (cleared) {
      var gain = (LINE_SCORE[cleared] || LINE_SCORE[4]) * st.level;
      st.score += gain;
      st.lines += cleared;
      st.lastClear = { rows: cleared, gain: gain };
      st.lastClearAt = st.now || 0;
      var lv = 1 + Math.floor(st.lines / 10);
      if (lv !== st.level) {
        st.level = lv;
        st.tickMs = Math.max(MIN_TICK, BASE_TICK - (lv - 1) * 72);
      }
    }
    return cleared;
  }

  /* 一个重力 tick：能落就落，落不动就锁定并出新方块 */
  function tick(st, now) {
    if (st.over) return null;
    if (now != null) st.now = now;
    if (!st.piece) { spawn(st); return null; }
    if (!collides(st, st.piece.m, st.piece.x, st.piece.y + 1)) {
      st.piece.y++;
      return 'fall';
    }
    var cleared = lock(st);
    if (!st.over) spawn(st);
    return cleared ? 'clear' : 'lock';
  }

  function softDrop(st) {
    if (!st.piece || st.over) return false;
    if (collides(st, st.piece.m, st.piece.x, st.piece.y + 1)) { tick(st); return true; }
    st.piece.y++;
    st.score += 1;                /* 速降给一点点分，鼓励手速 */
    return true;
  }

  function hardDrop(st) {
    if (!st.piece || st.over) return false;
    var dropped = 0;
    while (!collides(st, st.piece.m, st.piece.x, st.piece.y + 1)) {
      st.piece.y++;
      dropped++;
    }
    st.score += dropped * 2;
    lock(st);
    if (!st.over) spawn(st);
    return true;
  }

  function ghostY(st) {
    if (!st.piece) return 0;
    var y = st.piece.y;
    while (!collides(st, st.piece.m, st.piece.x, y + 1)) y++;
    return y;
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function block(c, x, y, size, color, alpha) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = color;
    c.fillRect(x, y, size, size);
    /* 左上高光 + 右下压暗，方块看着才有厚度 */
    c.fillStyle = 'rgba(255,255,255,0.34)';
    c.fillRect(x, y, size, size * 0.16);
    c.fillRect(x, y, size * 0.16, size);
    c.fillStyle = 'rgba(0,0,0,0.32)';
    c.fillRect(x, y + size * 0.84, size, size * 0.16);
    c.fillRect(x + size * 0.84, y, size * 0.16, size);
    c.globalAlpha = 1;
  }

  function draw(c, st, now) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    c.fillStyle = '#07060f';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 网格 */
    c.strokeStyle = 'rgba(123,92,255,0.14)';
    c.lineWidth = 1;
    c.beginPath();
    for (var gx = 1; gx < COLS; gx++) { c.moveTo(gx * CELL, 0); c.lineTo(gx * CELL, VIEW_H); }
    for (var gy = 1; gy < ROWS; gy++) { c.moveTo(0, gy * CELL); c.lineTo(FIELD_W, gy * CELL); }
    c.stroke();

    /* 已落定的方块 */
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var v = at(st, x, y);
        if (!v) continue;
        var def = SHAPES[v];
        block(c, x * CELL, y * CELL, CELL, def ? def.color : '#888');
      }
    }

    /* 刚消除的行闪一下 */
    if (st.lastClear && now - st.lastClearAt < 260 && st.lockedAt >= 0) {
      var k = 1 - (now - st.lastClearAt) / 260;
      c.fillStyle = 'rgba(255,255,255,' + (0.5 * k).toFixed(3) + ')';
      c.fillRect(0, 0, FIELD_W, VIEW_H);
    }

    /* 落点预览 + 当前方块 */
    if (st.piece) {
      var p = st.piece;
      var gy2 = ghostY(st);
      if (gy2 !== p.y) {
        for (var py = 0; py < p.m.length; py++) {
          for (var px2 = 0; px2 < p.m.length; px2++) {
            if (!p.m[py][px2]) continue;
            c.strokeStyle = 'rgba(255,255,255,0.28)';
            c.lineWidth = 1;
            c.strokeRect((p.x + px2) * CELL + 1.5, (gy2 + py) * CELL + 1.5, CELL - 3, CELL - 3);
          }
        }
      }
      /* 方块刚出生时上半部分在画面外，画的时候裁掉负行 */
      c.save();
      c.beginPath();
      c.rect(0, 0, FIELD_W, VIEW_H);
      c.clip();
      for (var y2 = 0; y2 < p.m.length; y2++) {
        for (var x2 = 0; x2 < p.m.length; x2++) {
          if (!p.m[y2][x2]) continue;
          block(c, (p.x + x2) * CELL, (p.y + y2) * CELL, CELL, p.color);
        }
      }
      c.restore();
    }

    /* 右侧：下一块 */
    var panelX = FIELD_W + 8;
    c.fillStyle = 'rgba(123,92,255,0.12)';
    c.fillRect(panelX, 6, PANEL_W - 16, 58);
    c.strokeStyle = 'rgba(123,92,255,0.45)';
    c.strokeRect(panelX + 0.5, 6.5, PANEL_W - 17, 57);
    c.fillStyle = '#9d93c9';
    c.font = '600 9px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText('NEXT', panelX + (PANEL_W - 16) / 2, 11);

    if (st.nextKind) {
      var nm = SHAPES[st.nextKind].cells;
      var nc = SHAPES[st.nextKind].color;
      var cell2 = 11;
      var minX = 99; var maxX = -1; var minY = 99; var maxY = -1;
      for (var ny = 0; ny < nm.length; ny++) {
        for (var nx = 0; nx < nm.length; nx++) {
          if (!nm[ny][nx]) continue;
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
      }
      var pw = (maxX - minX + 1) * cell2;
      var ph = (maxY - minY + 1) * cell2;
      var ox = panelX + (PANEL_W - 16 - pw) / 2;
      var oy = 22 + (36 - ph) / 2;
      for (var ny2 = minY; ny2 <= maxY; ny2++) {
        for (var nx2 = minX; nx2 <= maxX; nx2++) {
          if (!nm[ny2][nx2]) continue;
          block(c, ox + (nx2 - minX) * cell2, oy + (ny2 - minY) * cell2, cell2, nc);
        }
      }
    }

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }

  window.LY_GAME_TETRIS = {
    create: create, reset: reset, tick: tick, move: move, rotate: rotate,
    softDrop: softDrop, hardDrop: hardDrop, lock: lock, collides: collides,
    ghostY: ghostY, at: at, spawn: spawn, rotated: rotated,
    SHAPES: SHAPES, COLS: COLS, ROWS: ROWS,
    BASE_TICK: BASE_TICK, MIN_TICK: MIN_TICK
  };

  KIT.register({
    id: 'tetris',
    mode: 'tick',
    stepMs: BASE_TICK,
    view: { w: VIEW_W, h: VIEW_H },
    pointerMode: 'none',
    hudLabels: ['分数', '最高', '行数 · 等级'],
    hint: '左右移动 · 上键旋转 · 下键速降 · 空格落底 · P 暂停',
    pad: { up: '旋转', down: '速降', confirm: '落底' },

    create: create,
    reset: reset,

    tick: tick,
    draw: draw,

    key: function (st, action, down, r) {
      /* 空格在「已经开始玩」的时候是落底；没开始/暂停/结束时还给引擎，
         让它去负责开始、继续和重开 —— 不然空格就再也开不了局了 */
      if (action === 'confirm') {
        if (!r || !r.started || r.paused || r.over) return false;
        hardDrop(st);
        return true;
      }
      if (action === 'up') return rotate(st);
      if (action === 'down') return softDrop(st);
      if (action === 'left') return move(st, -1);
      if (action === 'right') return move(st, 1);
      return false;
    },

    over: function (st) { return !!st.over; },
    overTitle: function () { return '堆到顶了'; },
    score: function (st) { return st.score; },
    bestValue: function (st) { return st.score; },
    hud: function (st, best) {
      return [
        String(st.score),
        best == null ? '0' : String(best),
        st.lines + ' 行 · Lv' + st.level
      ];
    }
  });

})(window);
