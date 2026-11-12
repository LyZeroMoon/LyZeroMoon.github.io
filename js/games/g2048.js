/*!
 * 2048
 * ---------------------------------------------------------------------------
 * 规则：每次滑动，所有方块朝那个方向靠拢，相邻且相同的一对合并成双倍
 * （同一行里每一个方块每回合只能参与一次合并）。每次有效滑动后新生成一个
 * 2（90%）或 4（10%）。四个方向都动不了就结束。
 *
 * 凑出 2048 只会在 HUD 上报，不会结束本局 —— 还能继续往上冲 4096。
 * ---------------------------------------------------------------------------
 */

(function (window) {
  'use strict';

  var KIT = window.LY_GAME_KIT;
  if (!KIT) return;

  var N = 4;
  var VIEW = 400;
  var PAD = 14;
  var GAP = 12;
  var CELL = (VIEW - PAD * 2 - GAP * (N - 1)) / N;

  var COLORS = {
    2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f',
    64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850',
    1024: '#edc53f', 2048: '#edc22e', 4096: '#3c3a32'
  };

  function at(st, x, y) { return st.grid[y * N + x]; }
  function put(st, x, y, v) { st.grid[y * N + x] = v; }

  function empties(st) {
    var out = [];
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (!at(st, x, y)) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function maxTile(st) {
    var m = 0;
    for (var i = 0; i < st.grid.length; i++) if (st.grid[i] > m) m = st.grid[i];
    return m;
  }

  function spawn(st) {
    var free = empties(st);
    if (!free.length) return null;
    var idx = Math.floor(st.rng() * free.length);
    if (idx >= free.length) idx = free.length - 1;
    var cell = free[idx];
    put(st, cell.x, cell.y, st.rng() < 0.9 ? 2 : 4);
    st.pops.push({ x: cell.x, y: cell.y, kind: 'new' });
    st.animDirty = true;
    return cell;
  }

  /* 一条线（4 格，已按移动方向排好序）：压缩 → 相邻合并 → 补零 */
  function mergeLine(vals) {
    var dense = [];
    var i;
    for (i = 0; i < vals.length; i++) if (vals[i]) dense.push(vals[i]);

    var out = [];
    var gained = 0;
    var merged = [];
    for (i = 0; i < dense.length; i++) {
      if (i + 1 < dense.length && dense[i] === dense[i + 1]) {
        out.push(dense[i] * 2);
        merged.push(out.length - 1);
        gained += dense[i] * 2;
        i++;
      } else {
        out.push(dense[i]);
      }
    }
    while (out.length < N) out.push(0);
    return { out: out, gained: gained, merged: merged };
  }

  /* 取 4 条线；每条线里的格子顺序 = 沿 dir 移动时的先后 */
  function linesOf(dir) {
    var lines = [];
    for (var i = 0; i < N; i++) {
      var line = [];
      for (var j = 0; j < N; j++) {
        if (dir === 'left') line.push({ x: j, y: i });
        else if (dir === 'right') line.push({ x: N - 1 - j, y: i });
        else if (dir === 'up') line.push({ x: i, y: j });
        else line.push({ x: i, y: N - 1 - j });
      }
      lines.push(line);
    }
    return lines;
  }

  function move(st, dir) {
    if (st.over) return false;

    var lines = linesOf(dir);
    var changed = false;
    var gained = 0;
    var pops = [];
    var i, j;

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var vals = [];
      for (j = 0; j < N; j++) vals.push(at(st, line[j].x, line[j].y));

      var r = mergeLine(vals);
      gained += r.gained;
      for (j = 0; j < N; j++) {
        var p = line[j];
        if (at(st, p.x, p.y) !== r.out[j]) changed = true;
        put(st, p.x, p.y, r.out[j]);
      }
      for (j = 0; j < r.merged.length; j++) {
        var mp = line[r.merged[j]];
        pops.push({ x: mp.x, y: mp.y, kind: 'merge' });
      }
    }

    if (!changed) return false;

    st.moves++;
    st.score += gained;
    st.pops = pops;
    if (gained) st.animDirty = true;
    spawn(st);

    var top = maxTile(st);
    if (top > st.top) st.top = top;
    if (!hasMove(st)) st.over = true;
    return true;
  }

  function hasMove(st) {
    if (empties(st).length) return true;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var v = at(st, x, y);
        if (x + 1 < N && at(st, x + 1, y) === v) return true;
        if (y + 1 < N && at(st, x, y + 1) === v) return true;
      }
    }
    return false;
  }

  function reset(st) {
    st.grid = new Array(N * N).fill(0);
    st.score = 0;
    st.moves = 0;
    st.top = 0;
    st.over = false;
    st.pops = [];
    st.animDirty = true;
    st.animAt = 0;
    spawn(st);
    spawn(st);
    st.pops = [];
    return st;
  }

  function create() {
    var st = { rng: Math.random };
    return reset(st);
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function cellPos(i) { return PAD + i * (CELL + GAP); }

  function draw(c, st, now) {
    if (st.animDirty) { st.animAt = now; st.animDirty = false; }
    var t = st.animAt ? Math.min(1, (now - st.animAt) / 140) : 1;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VIEW, VIEW);
    c.fillStyle = '#bbada0';
    c.fillRect(0, 0, VIEW, VIEW);

    var x, y, i;
    c.fillStyle = 'rgba(238,228,218,0.35)';
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        roundRect(c, cellPos(x), cellPos(y), CELL, CELL, 6);
        c.fill();
      }
    }

    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        var v = at(st, x, y);
        if (!v) continue;

        var pop = 1;
        for (i = 0; i < st.pops.length; i++) {
          if (st.pops[i].x === x && st.pops[i].y === y) {
            pop = st.pops[i].kind === 'new' ? 0.6 + 0.4 * t : 1 + 0.12 * (1 - t);
            break;
          }
        }

        var size = CELL * pop;
        var cx = cellPos(x) + (CELL - size) / 2;
        var cy = cellPos(y) + (CELL - size) / 2;

        c.fillStyle = COLORS[v] || '#3c3a32';
        roundRect(c, cx, cy, size, size, 6);
        c.fill();

        var text = String(v);
        var font = text.length >= 4 ? 22 : text.length === 3 ? 27 : 33;
        c.fillStyle = v <= 4 ? '#776e65' : '#f9f6f2';
        c.font = '700 ' + font + 'px "Helvetica Neue", Arial, "PingFang SC", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, cellPos(x) + CELL / 2, cellPos(y) + CELL / 2 + 1);
      }
    }
  }

  function fmt(n) { return n == null ? '0' : String(n); }

  window.LY_GAME_2048 = {
    create: create, reset: reset, move: move, hasMove: hasMove,
    mergeLine: mergeLine, spawn: spawn, at: at, put: put, N: N
  };

  KIT.register({
    id: 'g2048',
    mode: 'idle',
    autoStart: true,
    view: { w: VIEW, h: VIEW },
    pointerMode: 'swipe',
    hudLabels: ['分数', '最高分', '最大方块'],
    hint: '方向键 / WASD 滑动 · 手机上直接划屏幕 · 凑出 2048 后可以继续往上冲',
    pad: { confirm: '重开' },

    create: create,
    reset: reset,
    draw: draw,

    key: function (st, action) {
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        move(st, action);
        return true;
      }
      if (action === 'confirm') { reset(st); return true; }
      return false;
    },

    over: function (st) { return !!st.over; },
    overTitle: function () { return '没有可移动的方向了'; },
    score: function (st) { return st.score; },
    bestValue: function (st) { return st.score; },
    hud: function (st, best) {
      return [fmt(st.score), fmt(best), fmt(st.top)];
    }
  });

})(window);
