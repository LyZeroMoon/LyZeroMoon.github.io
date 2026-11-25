/*!
 * 扫雷
 * ---------------------------------------------------------------------------
 * 规则：数字表示周围八格里有几颗雷，靠推理把没有雷的格子全部翻开。
 * 翻到雷就结束，翻完所有安全格就赢。
 *
 * 几个刻意的设计：
 *   · **第一次点击永远安全** —— 雷是在第一次翻格之后才埋的，而且会避开
 *     那一格和它周围的八格。老扫雷开局第一下就炸的挫败感没必要复刻。
 *   · **耗时越短越好**（bestMode='low'），所以 HUD 第二格是「用时」而不是最高分。
 *   · 插旗两种方式：桌面右键，手机长按 420ms；另外方向键面板中间那颗键
 *     可以切成「插旗模式」，切了之后点一下就是插旗（给触摸用户兜底）。
 *   · 纯逻辑（埋雷/翻格/连锁展开/判胜负）都在下面，不碰 canvas，可以直接测。
 * ---------------------------------------------------------------------------
 */

(function (window) {
  'use strict';

  var KIT = window.LY_GAME_KIT;
  if (!KIT) return;

  var COLS = 12;
  var ROWS = 10;
  var CELL = 32;
  var MINES = 20;
  var HOLD_MS = 420;

  var VIEW_W = COLS * CELL;
  var VIEW_H = ROWS * CELL;

  var NUM_COLOR = {
    1: '#3b82f6', 2: '#22c55e', 3: '#ef4444', 4: '#7c3aed',
    5: '#b45309', 6: '#0d9488', 7: '#111827', 8: '#6b7280'
  };

  function pick(n) { return Math.floor(Math.random() * n); }

  function idx(x, y) { return y * COLS + x; }

  function inGrid(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

  function cellAt(st, x, y) {
    return inGrid(x, y) ? st.cells[idx(x, y)] : null;
  }

  /* 八邻域坐标（含自己，用于首点保护） */
  function around(x, y, withSelf) {
    var out = [];
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!withSelf && dx === 0 && dy === 0) continue;
        if (inGrid(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
      }
    }
    return out;
  }

  function makeCells() {
    var cells = [];
    for (var i = 0; i < COLS * ROWS; i++) {
      cells.push({ mine: false, adj: 0, state: 0, order: 0 });   /* state: 0 隐藏 1 翻开 2 插旗 */
    }
    return cells;
  }

  /* 第一次翻格之后才埋雷：避开首点及其八邻，保证一上手不会直接炸 */
  function plantMines(st, safeX, safeY) {
    var banned = Object.create(null);
    var guard = around(safeX, safeY, true);
    for (var g = 0; g < guard.length; g++) banned[idx(guard[g].x, guard[g].y)] = 1;

    var pool = [];
    for (var i = 0; i < st.cells.length; i++) if (!banned[i]) pool.push(i);
    /* 格子少到放不下时放宽限制（小盘自定义用得上） */
    if (pool.length < st.mines) {
      pool = [];
      for (var j = 0; j < st.cells.length; j++) if (j !== idx(safeX, safeY)) pool.push(j);
    }

    var placed = 0;
    while (placed < st.mines && pool.length) {
      var k = Math.floor(st.rng() * pool.length);
      if (k >= pool.length) k = pool.length - 1;
      var cellIdx = pool.splice(k, 1)[0];
      st.cells[cellIdx].mine = true;
      placed++;
    }
    st.minesPlanted = true;
    countAdj(st);
    return placed;
  }

  function countAdj(st) {
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var c = cellAt(st, x, y);
        if (c.mine) { c.adj = 0; continue; }
        var n = 0;
        var ns = around(x, y, false);
        for (var i = 0; i < ns.length; i++) if (cellAt(st, ns[i].x, ns[i].y).mine) n++;
        c.adj = n;
      }
    }
  }

  function reset(st) {
    st.cells = makeCells();
    st.minesPlanted = false;
    st.mines = st.mines || MINES;
    st.over = false;
    st.won = false;
    st.boom = null;
    st.flagMode = false;
    st.hold = null;
    st.revealed = 0;
    st.flags = 0;
    st.startedAt = 0;
    st.timing = false;
    st.elapsed = 0;
    st.order = 0;
    st.lastReveal = null;
    return st;
  }

  function create() {
    var st = { rng: Math.random, cols: COLS, rows: ROWS, mines: MINES };
    return reset(st);
  }

  /* 连锁展开：翻到 0 就把邻域也翻开（广度优先，避免深递归） */
  function flood(st, x, y) {
    var queue = [{ x: x, y: y }];
    var opened = 0;
    while (queue.length) {
      var p = queue.shift();
      var c = cellAt(st, p.x, p.y);
      if (!c || c.state !== 0) continue;
      c.state = 1;
      c.order = ++st.order;
      st.revealed++;
      opened++;
      if (c.adj !== 0) continue;
      var ns = around(p.x, p.y, false);
      for (var i = 0; i < ns.length; i++) {
        var nc = cellAt(st, ns[i].x, ns[i].y);
        if (nc && nc.state === 0 && !nc.mine) queue.push({ x: ns[i].x, y: ns[i].y });
      }
    }
    return opened;
  }

  function remaining(st) {
    var left = st.mines - st.flags;
    return left < 0 ? 0 : left;
  }

  function checkWin(st) {
    if (st.over) return false;
    if (st.revealed >= st.cells.length - st.mines && st.minesPlanted) {
      st.won = true;
      st.over = true;
      var i;
      for (i = 0; i < st.cells.length; i++) {
        if (st.cells[i].mine && st.cells[i].state !== 2) st.cells[i].state = 2;
      }
      st.flags = st.mines;
      return true;
    }
    return false;
  }

  /* 翻开一格。返回 'reveal' | 'flood' | 'boom' | 'win' | null（无效操作） */
  function reveal(st, x, y) {
    if (st.over) return null;
    var c = cellAt(st, x, y);
    if (!c || c.state === 1 || c.state === 2) return null;

    if (!st.minesPlanted) {
      plantMines(st, x, y);
      /* 用 timing 标记而不是判断 startedAt 是否非零 —— 从 0 开始计时也合法 */
      st.timing = true;
      st.startedAt = st.now || 0;
    }

    if (c.mine) {
      c.state = 1;
      c.order = ++st.order;
      st.boom = { x: x, y: y };
      st.over = true;
      st.won = false;
      return 'boom';
    }

    var opened = flood(st, x, y);
    st.lastReveal = { x: x, y: y };
    if (checkWin(st)) return 'win';
    return opened > 1 ? 'flood' : 'reveal';
  }

  function toggleFlag(st, x, y) {
    if (st.over) return null;
    var c = cellAt(st, x, y);
    if (!c || c.state === 1) return null;
    if (c.state === 2) {
      c.state = 0;
      st.flags--;
      return 'unflag';
    }
    c.state = 2;
    st.flags++;
    return 'flag';
  }

  /* 双击数字（或点已翻开的数字）→ 周围旗数够了就把剩下的邻格一起翻开 */
  function chord(st, x, y) {
    if (st.over) return null;
    var c = cellAt(st, x, y);
    if (!c || c.state !== 1 || !c.adj) return null;
    var ns = around(x, y, false);
    var flags = 0;
    var i;
    for (i = 0; i < ns.length; i++) if (cellAt(st, ns[i].x, ns[i].y).state === 2) flags++;
    if (flags < c.adj) return null;
    for (i = 0; i < ns.length; i++) {
      var nc = cellAt(st, ns[i].x, ns[i].y);
      if (nc.state !== 0) continue;
      var r = reveal(st, ns[i].x, ns[i].y);
      if (r === 'boom') return 'boom';
      if (r === 'win') return 'win';
    }
    return 'chord';
  }

  /* ------------------------------ 输入 ------------------------------ */

  function fromPoint(pt) {
    var x = Math.floor(pt.x / CELL);
    var y = Math.floor(pt.y / CELL);
    if (!inGrid(x, y)) return null;
    return { x: x, y: y };
  }

  function handle(st, pt, kind) {
    if (st.over) return;
    var cell = fromPoint(pt);
    if (!cell) return;

    if (kind === 'down') {
      if (pt.button === 2) { toggleFlag(st, cell.x, cell.y); st.hold = null; return; }
      /* 已经翻开的数字：按一下就是 chord */
      var c = cellAt(st, cell.x, cell.y);
      if (c.state === 1) { chord(st, cell.x, cell.y); st.hold = null; return; }
      st.hold = { x: cell.x, y: cell.y, at: st.now || 0, done: false };
      return;
    }
    if (kind === 'move') {
      /* 手指/鼠标挪到别的格子上就不算长按了 */
      if (st.hold && (st.hold.x !== cell.x || st.hold.y !== cell.y)) st.hold = null;
      return;
    }
    if (kind === 'up') {
      var h = st.hold;
      st.hold = null;
      if (!h || h.done) return;
      if (st.flagMode) toggleFlag(st, h.x, h.y);
      else if (reveal(st, h.x, h.y) === 'boom') st.boomAt = st.now || 0;
    }
  }

  /* 每帧跑：计时 + 长按识别（用 rAF 的时间而不是 setTimeout，
     这样暂停/关闭机台时长按不会偷偷生效） */
  function animate(st, dt, now) {
    if (st.over) return;
    st.now = now;
    if (st.timing) st.elapsed = now - st.startedAt;
    if (st.hold && !st.hold.done && now - st.hold.at >= HOLD_MS) {
      st.hold.done = true;
      toggleFlag(st, st.hold.x, st.hold.y);
    }
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function drawFace(c, cx, cy, r, state) {
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = '#ffd60a';
    c.fill();
    c.strokeStyle = '#7a5a00';
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = '#3a2a00';
    if (state === 'boom') {
      c.beginPath();
      c.moveTo(cx - r * 0.55, cy - r * 0.35);
      c.lineTo(cx - r * 0.15, cy + r * 0.05);
      c.moveTo(cx - r * 0.15, cy - r * 0.35);
      c.lineTo(cx - r * 0.55, cy + r * 0.05);
      c.moveTo(cx + r * 0.15, cy - r * 0.35);
      c.lineTo(cx + r * 0.55, cy + r * 0.05);
      c.moveTo(cx + r * 0.55, cy - r * 0.35);
      c.lineTo(cx + r * 0.15, cy + r * 0.05);
      c.strokeStyle = '#3a2a00';
      c.lineWidth = 2;
      c.stroke();
    } else if (state === 'win') {
      c.beginPath();
      c.arc(cx - r * 0.34, cy - r * 0.22, 1.8, 0, Math.PI * 2);
      c.arc(cx + r * 0.34, cy - r * 0.22, 1.8, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx, cy + r * 0.1, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
      c.strokeStyle = '#3a2a00';
      c.lineWidth = 2;
      c.stroke();
    } else {
      c.beginPath();
      c.arc(cx - r * 0.34, cy - r * 0.2, 2, 0, Math.PI * 2);
      c.arc(cx + r * 0.34, cy - r * 0.2, 2, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx, cy + r * 0.16, r * 0.46, 0.1 * Math.PI, 0.9 * Math.PI);
      c.strokeStyle = '#3a2a00';
      c.lineWidth = 2;
      c.stroke();
    }
  }

  function drawFlag(c, x, y, size) {
    c.fillStyle = '#ef4444';
    c.beginPath();
    c.moveTo(x + size * 0.34, y + size * 0.2);
    c.lineTo(x + size * 0.74, y + size * 0.36);
    c.lineTo(x + size * 0.34, y + size * 0.52);
    c.closePath();
    c.fill();
    c.strokeStyle = '#111827';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + size * 0.34, y + size * 0.18);
    c.lineTo(x + size * 0.34, y + size * 0.78);
    c.stroke();
    c.fillStyle = '#111827';
    c.fillRect(x + size * 0.2, y + size * 0.74, size * 0.5, size * 0.1);
  }

  function draw(c, st, now) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    /* 底板：没翻开的格子是凸起的灰蓝，翻开的是凹陷的深色 */
    c.fillStyle = '#1b1f2a';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    var x, y;
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        var cell = cellAt(st, x, y);
        var px = x * CELL;
        var py = y * CELL;
        var revealed = cell.state === 1;

        if (revealed) {
          c.fillStyle = cell.mine ? '#7f1d1d' : '#2b3242';
          c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          c.strokeStyle = 'rgba(0,0,0,0.45)';
          c.lineWidth = 1;
          c.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
          c.fillStyle = 'rgba(255,255,255,0.06)';
          c.fillRect(px + 1, py + 1, CELL - 2, 2);
        } else {
          c.fillStyle = '#3b4358';
          c.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          c.fillStyle = 'rgba(255,255,255,0.22)';
          c.fillRect(px + 1, py + 1, CELL - 2, 2);
          c.fillRect(px + 1, py + 1, 2, CELL - 2);
          c.fillStyle = 'rgba(0,0,0,0.34)';
          c.fillRect(px + 1, py + CELL - 3, CELL - 2, 2);
          c.fillRect(px + CELL - 3, py + 1, 2, CELL - 2);
        }

        if (cell.state === 2) {
          drawFlag(c, px, py, CELL);
          continue;
        }

        if (revealed) {
          if (cell.mine) {
            var isBoom = st.boom && st.boom.x === x && st.boom.y === y;
            c.fillStyle = isBoom ? '#ffffff' : '#111827';
            c.beginPath();
            c.arc(px + CELL / 2, py + CELL / 2, CELL * 0.26, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = isBoom ? '#ef4444' : '#111827';
            c.lineWidth = 2;
            c.beginPath();
            for (var a = 0; a < 4; a++) {
              var ang = (Math.PI / 4) * a;
              c.moveTo(px + CELL / 2 + Math.cos(ang) * CELL * 0.26,
                py + CELL / 2 + Math.sin(ang) * CELL * 0.26);
              c.lineTo(px + CELL / 2 + Math.cos(ang) * CELL * 0.44,
                py + CELL / 2 + Math.sin(ang) * CELL * 0.44);
            }
            c.stroke();
          } else if (cell.adj) {
            c.fillStyle = NUM_COLOR[cell.adj] || '#e5e7eb';
            c.font = '700 ' + Math.round(CELL * 0.62) + 'px "Courier New", monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(String(cell.adj), px + CELL / 2, py + CELL / 2 + 1);
          }
        }

        /* 长按进度条：让「按住」这件事看得见 */
        if (st.hold && st.hold.x === x && st.hold.y === y && !st.hold.done) {
          var k = Math.min(1, (now - st.hold.at) / HOLD_MS);
          c.fillStyle = 'rgba(255,214,10,0.85)';
          c.fillRect(px + 2, py + CELL - 5, (CELL - 4) * k, 3);
        }
      }
    }

    if (st.over) {
      c.fillStyle = 'rgba(5,1,15,0.42)';
      c.fillRect(0, 0, VIEW_W, VIEW_H);
      drawFace(c, VIEW_W / 2, VIEW_H / 2, 22, st.won ? 'win' : 'boom');
    }

    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
  }

  window.LY_GAME_MINESWEEPER = {
    create: create, reset: reset, reveal: reveal, toggleFlag: toggleFlag, chord: chord,
    plantMines: plantMines, countAdj: countAdj, flood: flood, around: around,
    remaining: remaining, checkWin: checkWin, handle: handle, animate: animate,
    cellAt: cellAt, COLS: COLS, ROWS: ROWS, MINES: MINES, HOLD_MS: HOLD_MS, CELL: CELL
  };

  KIT.register({
    id: 'minesweeper',
    mode: 'idle',
    autoStart: true,
    view: { w: VIEW_W, h: VIEW_H },
    pointerMode: 'point',
    bestMode: 'low',
    hudLabels: ['剩余雷数', '用时', '状态'],
    hint: '左键翻格 · 右键或长按插旗 · 点已翻开的数字可快速展开周围 · 方向键中间那颗切换「插旗模式」',
    pad: { confirm: '插旗模式' },

    create: create,
    reset: reset,
    draw: draw,
    pointer: handle,
    animate: animate,

    key: function (st, action, down) {
      if (action === 'confirm' && down) {
        st.flagMode = !st.flagMode;
        return true;
      }
      return false;
    },

    over: function (st) { return !!st.over; },
    overTitle: function (st) { return st.won ? '全部扫清！' : '踩到雷了'; },
    overTip: function (st) {
      var t = '用时 ' + (st.elapsed / 1000).toFixed(1) + ' 秒';
      return (st.won ? t + ' · 干得漂亮' : t + ' · 还剩 ' + remaining(st) + ' 颗没找出来') +
        ' · 按空格再来一局';
    },
    score: function (st) { return Math.round(st.elapsed / 1000); },
    /* 只有赢了才记成绩，而且比的是谁更快 */
    bestValue: function (st) { return st.won ? st.elapsed : null; },
    hud: function (st, best) {
      var state = st.won ? '扫清' : (st.over ? '踩雷' : (st.flagMode ? '插旗中' : '挖开中'));
      return [
        String(remaining(st)),
        (st.elapsed / 1000).toFixed(1) + 's' + (best == null ? '' : ' · 最佳 ' + (best / 1000).toFixed(1) + 's'),
        state
      ];
    }
  });

})(window);
