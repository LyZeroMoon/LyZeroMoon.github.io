/*!
 * 打砖块
 * ---------------------------------------------------------------------------
 * 规则：挡板在下面，球在砖墙和挡板之间弹。把砖全部敲掉就过关，球掉下去一条命，
 * 三条命用完结束。
 *
 * 物理按「帧」推进（mode='frame'），位移按毫秒折算，所以在 60Hz 和 120Hz 的屏幕上
 * 速度是一样的。球每帧的位移可能比砖还厚，直接判定会「穿过去」，
 * 所以内部按不超过半径一半的步长拆成小步走。
 *
 * 挡板两种操作：左右键（按住持续移动，engine 把 autorepeat 放行了）
 * 和直接在画面里拖动（pointerMode='point'，手机上就是拖）。
 * ---------------------------------------------------------------------------
 */

(function (window) {
  'use strict';

  var KIT = window.LY_GAME_KIT;
  if (!KIT) return;

  var W = 400;
  var H = 440;
  var COLS = 10;
  var ROWS = 6;
  var BW = W / COLS;
  var BH = 18;
  var TOP = 52;
  var PADDLE_W = 76;
  var PADDLE_H = 12;
  var PADDLE_Y = H - 26;
  var BALL_R = 6;
  var BASE_SPEED = 230;
  var SPEED_STEP = 20;
  var START_LIVES = 3;

  var ROW_COLORS = ['#ff2e97', '#ff7a3c', '#ffd60a', '#3ddc84', '#22d3ee', '#7b5cff'];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function brickRect(st, i) {
    var x = (i % COLS) * BW;
    var y = TOP + Math.floor(i / COLS) * BH;
    return { x: x, y: y, w: BW, h: BH };
  }

  function aliveCount(st) {
    var n = 0;
    for (var i = 0; i < st.bricks.length; i++) if (st.bricks[i]) n++;
    return n;
  }

  function buildBricks(st) {
    st.bricks = new Array(COLS * ROWS).fill(1);
    /* 前两行给个金属感的硬度（只是颜色，不额外加耐久）: */
    st.brickTotal = st.bricks.length;
  }

  function resetBall(st) {
    st.ball = {
      x: st.paddleX,
      y: PADDLE_Y - BALL_R - 1,
      vx: 0,
      vy: 0,
      stuck: true
    };
  }

  function reset(st) {
    st.paddleX = W / 2;
    st.lives = START_LIVES;
    st.score = 0;
    st.level = 1;
    st.over = false;
    st.input = { left: false, right: false };
    st.pointerX = null;
    st.speed = BASE_SPEED;
    st.hitFlash = null;
    st.hitAt = -1;
    st.levelAt = -1;
    st.serveAt = 0;
    st.serves = 0;
    buildBricks(st);
    resetBall(st);
    return st;
  }

  function create() {
    return reset({});
  }

  function launch(st) {
    if (!st.ball.stuck || st.over) return false;
    st.ball.stuck = false;
    /* 左右交替发球，角度在 55°~72° 之间轮换：既不会一开局就垂直打转，
       也不会贴着水平线满场飞 */
    st.serves = (st.serves || 0) + 1;
    var dir = st.serves % 2 ? 1 : -1;
    var deg = 55 + (st.serves * 7) % 18;
    var ang = (Math.PI / 180) * deg;
    st.ball.vx = dir * st.speed * Math.cos(ang);
    st.ball.vy = -st.speed * Math.sin(ang);
    return true;
  }

  /* ------------------------------ 逻辑 ------------------------------ */

  function movePaddle(st, dt) {
    var half = PADDLE_W / 2;
    if (st.pointerX != null) {
      st.paddleX = clamp(st.pointerX, half, W - half);
    } else {
      var v = 0;
      if (st.input.left) v -= 1;
      if (st.input.right) v += 1;
      if (v) st.paddleX = clamp(st.paddleX + v * 420 * (dt / 1000), half, W - half);
    }
    if (st.ball.stuck) {
      st.ball.x = st.paddleX;
      st.ball.y = PADDLE_Y - BALL_R - 1;
    }
  }

  function bounceWalls(st) {
    var b = st.ball;
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    else if (b.x + BALL_R > W) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
  }

  /* 返回被敲掉的砖的下标，没有则 -1 */
  function bounceBricks(st, prevX, prevY) {
    var b = st.ball;
    for (var i = 0; i < st.bricks.length; i++) {
      if (!st.bricks[i]) continue;
      var r = brickRect(st, i);
      var ex = r.x - BALL_R;
      var ey = r.y - BALL_R;
      var ew = r.w + BALL_R * 2;
      var eh = r.h + BALL_R * 2;
      if (b.x <= ex || b.x >= ex + ew || b.y <= ey || b.y >= ey + eh) continue;

      /* 从哪边进来的：上一帧还在左右外侧 → 横向弹，否则纵向弹 */
      if (prevX <= ex || prevX >= ex + ew) {
        b.vx = b.x < r.x + r.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
        b.x = b.x < r.x + r.w / 2 ? ex : ex + ew;
      } else {
        b.vy = prevY <= ey ? -Math.abs(b.vy) : Math.abs(b.vy);
        b.y = prevY <= ey ? ey : ey + eh;
      }
      st.bricks[i] = 0;
      st.score += 10 * st.level;
      st.hitFlash = { i: i };
      st.hitAt = st.now || 0;
      return i;
    }
    return -1;
  }

  function bouncePaddle(st, prevY) {
    var b = st.ball;
    if (b.vy <= 0) return false;
    if (prevY + BALL_R > PADDLE_Y) return false;      /* 上一帧就已在挡板之下，别追认 */
    if (b.y + BALL_R < PADDLE_Y) return false;
    if (b.y - BALL_R > PADDLE_Y + PADDLE_H) return false;
    var half = PADDLE_W / 2;
    var dx = b.x - st.paddleX;
    if (Math.abs(dx) > half + BALL_R) return false;

    /* 打得越靠边，反弹角越斜 —— 这是打砖块唯一的手感来源 */
    var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || st.speed;
    var t = clamp(dx / half, -1, 1);
    var deg = 90 - t * 58;
    var ang = (Math.PI / 180) * deg;
    var sign = t > 0 ? 1 : (t < 0 ? -1 : (b.vx < 0 ? -1 : 1));
    b.vx = Math.cos(ang) * sp * sign;
    b.vy = -Math.sin(ang) * sp;
    if (Math.abs(b.vy) < sp * 0.32) b.vy = -sp * 0.32;   /* 别让它贴着挡板横着飞 */
    b.y = PADDLE_Y - BALL_R - 0.5;
    return true;
  }

  function loseLife(st) {
    st.lives--;
    if (st.lives <= 0) {
      st.lives = 0;
      st.over = true;
      return;
    }
    resetBall(st);
  }

  function nextLevel(st) {
    st.level++;
    st.speed = BASE_SPEED + (st.level - 1) * SPEED_STEP;
    st.score += 100 * (st.level - 1);
    st.levelAt = st.now || 0;
    buildBricks(st);
    resetBall(st);
  }

  /* 推进一帧。dt 单位毫秒 */
  function step(st, dt, now) {
    if (now != null) st.now = now;
    if (st.over) return;
    if (dt > 60) dt = 60;            /* 掉帧时不要一次穿太多 */
    st.serveAt += dt;

    movePaddle(st, dt);

    var b = st.ball;
    if (b.stuck) {
      /* 没发球就不用跑物理，但挡板能动 */
      return;
    }

    var remaining = (Math.min(dt, 60) / 1000) * Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var stepLen = Math.max(1, BALL_R / 2);
    var n = Math.min(64, Math.max(1, Math.ceil(remaining / stepLen)));
    var unit = (dt / 1000) / n;

    for (var i = 0; i < n; i++) {
      var px = b.x;
      var py = b.y;
      b.x += b.vx * unit;
      b.y += b.vy * unit;

      bounceWalls(st);
      bounceBricks(st, px, py);
      bouncePaddle(st, py);

      if (b.y - BALL_R > H) { loseLife(st); return; }

      /* 砖敲空了就下一关：砖墙重建、球速提一档 */
      if (aliveCount(st) === 0) { nextLevel(st); return; }
    }
  }

  function launchOrServe(st) {
    if (st.over) return false;
    if (st.ball.stuck) return launch(st);
    return false;
  }

  /* ------------------------------ 绘制 ------------------------------ */

  function roundRect(c, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
  }

  function draw(c, st, now) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#07060f';
    c.fillRect(0, 0, W, H);

    /* 砖墙 */
    for (var i = 0; i < st.bricks.length; i++) {
      if (!st.bricks[i]) continue;
      var r = brickRect(st, i);
      var color = ROW_COLORS[Math.floor(i / COLS) % ROW_COLORS.length];
      var flash = st.hitFlash && st.hitFlash.i === i && now - st.hitAt < 150;
      c.fillStyle = flash ? '#ffffff' : color;
      roundRect(c, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 3);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.26)';
      c.fillRect(r.x + 3, r.y + 3, r.w - 6, 2.5);
    }

    /* 过关横幅 */
    if (st.levelAt >= 0 && now - st.levelAt < 1100) {
      var k = 1 - (now - st.levelAt) / 1100;
      c.fillStyle = 'rgba(255,214,10,' + (0.85 * k).toFixed(3) + ')';
      c.font = '700 24px "Courier New", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('LEVEL ' + st.level, W / 2, H / 2 - 20);
    }

    /* 挡板 */
    var px = st.paddleX - PADDLE_W / 2;
    c.save();
    c.shadowColor = 'rgba(255,46,151,0.9)';
    c.shadowBlur = 14;
    c.fillStyle = '#ff2e97';
    roundRect(c, px, PADDLE_Y, PADDLE_W, PADDLE_H, 6);
    c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillRect(px + 5, PADDLE_Y + 2, PADDLE_W - 10, 2);

    /* 球 */
    var b = st.ball;
    c.save();
    c.shadowColor = 'rgba(34,211,238,0.95)';
    c.shadowBlur = 16;
    c.fillStyle = '#e6fbff';
    c.beginPath();
    c.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    c.fill();
    c.restore();

    if (b.stuck && !st.over) {
      c.fillStyle = 'rgba(230,226,255,0.72)';
      c.font = '600 12px "Courier New", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('按空格发球（或点一下画面）', W / 2, PADDLE_Y - 40);
    }

    /* 底部剩几条命 */
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    for (var l = 0; l < st.lives; l++) {
      c.fillStyle = 'rgba(255,46,151,0.85)';
      c.beginPath();
      c.arc(16 + l * 16, H - 12, 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  window.LY_GAME_BREAKOUT = {
    create: create, reset: reset, step: step, launch: launch, launchOrServe: launchOrServe,
    aliveCount: aliveCount, nextLevel: nextLevel, loseLife: loseLife,
    brickRect: brickRect, W: W, H: H, COLS: COLS, ROWS: ROWS, BALL_R: BALL_R,
    PADDLE_Y: PADDLE_Y, PADDLE_W: PADDLE_W, BASE_SPEED: BASE_SPEED, START_LIVES: START_LIVES
  };

  KIT.register({
    id: 'breakout',
    mode: 'frame',
    autoStart: true,
    view: { w: W, h: H },
    pointerMode: 'point',
    hudLabels: ['分数', '最高', '剩余砖块'],
    hint: '左右键移动挡板 · 在画面里拖动也行 · 空格 / 点击发球 · 三条命',
    pad: { confirm: '发球' },

    create: create,
    reset: reset,
    step: step,
    draw: draw,

    pointer: function (st, pt, kind) {
      if (st.over) return;
      if (kind === 'down') {
        st.pointerX = pt.x;
        launchOrServe(st);
      } else if (kind === 'move') {
        st.pointerX = pt.x;
      } else if (kind === 'up') {
        st.pointerX = null;
      }
    },

    key: function (st, action, down) {
      if (action === 'left' || action === 'right') {
        st.input[action] = !!down;
        if (down) st.pointerX = null;         /* 用键盘就把指针控制让开 */
        return true;
      }
      if (action === 'confirm' && down) {
        if (st.ball && st.ball.stuck) { launch(st); return true; }
        return false;                          /* 已经在飞就交给引擎暂停 */
      }
      return false;
    },

    over: function (st) { return !!st.over; },
    overTitle: function () { return '三条命用完了'; },
    overTip: function (st) { return '得分 ' + st.score + ' · 打到第 ' + st.level + ' 关'; },
    score: function (st) { return st.score; },
    bestValue: function (st) { return st.score; },
    hud: function (st, best) {
      return [String(st.score), best == null ? '0' : String(best), String(aliveCount(st))];
    }
  });

})(window);
