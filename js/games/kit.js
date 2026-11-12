/*!
 * 小游戏引擎（Game Kit）
 * ---------------------------------------------------------------------------
 * 这一层负责所有「跟玩法无关」的杂事：机台外壳、HUD、遮罩文案、方向键面板、
 * rAF 循环、键盘 / 滑动 / 指针输入、最高分持久化、ESC 关闭、焦点管理。
 *
 * 一款游戏只要 register 一个 def，实现下面这些钩子即可：
 *
 *   id            必填，要和 source/_data/games.json 里的 id 对上
 *   mode          'tick'（固定步长，如贪吃蛇）| 'frame'（每帧，如打砖块）| 'idle'（纯事件驱动）
 *   view          { w, h } canvas 逻辑尺寸（CSS 会按比例缩放）
 *   autoStart     true 表示打开即开始，不用先按空格
 *   hudLabels     三个 HUD 格子的标题，默认 ['SCORE','BEST','LEVEL']
 *   bestMode      'high'（默认，越大越好）| 'low'（越小越好，如扫雷用时）
 *   pointerMode   'swipe'（拖动出方向）| 'point'（把坐标给游戏）| 'none'
 *   hint          机台底部的操作提示
 *   pad           方向键面板的按钮文案，如 { up: '旋转', confirm: '暂停' }
 *   stepMs        mode='tick' 的默认步长（游戏也可以自己在 st 上放 tickMs 覆盖，用来提速）
 *
 *   create(opts)  -> st            建立本局状态（opts = { best }）
 *   reset(st)                      把 st 复位成新一局
 *   tick(st, now)                  推进一格（mode='tick'）
 *   step(st, dt, now)              推进一帧，dt 单位毫秒（mode='frame'）
 *   key(st, action, down) -> bool  返回 true 表示这个按键被游戏吃掉了（引擎不再处理）
 *   pointer(st, pt, kind)          仅 pointerMode='point' 时调用，pt 是 canvas 逻辑坐标
 *   draw(c, st, now)               画一帧
 *   over(st) -> bool               本局是否结束
 *   score(st) -> number
 *   bestValue(st) -> number|null   要记进最高分的值，返回 null 表示这局不记
 *   overTitle(st) -> string        结束遮罩的标题，默认 'GAME OVER'
 *
 * action 取值：'up' 'down' 'left' 'right' 'confirm' 'restart' 'pause'
 * 按键映射：方向键 / WASD → 四向；空格 / 回车 → confirm；R → restart；P → pause
 *
 * 这一层同样刻意做到「不加载就不存在」：脚本由 games-hub.js 按需插入。
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  if (window.LY_GAME_KIT) return;

  var MASK_ID = 'gk-mask';
  var KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    ' ': 'confirm', Spacebar: 'confirm', Enter: 'confirm',
    r: 'restart', R: 'restart',
    p: 'pause', P: 'pause'
  };

  var defs = Object.create(null);
  var mask = null;
  var refs = {};
  var rt = null;              // 当前这一局的运行时；null = 没在玩
  var ctx = null;
  var rafId = 0;
  var lastFrame = 0;
  var acc = 0;
  var lastFocus = null;
  var keysBound = false;
  var hudCache = ['', '', ''];
  var overlayKey = '';

  var CLOSE_SVG =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"/></svg>';

  /* ------------------------------ 元数据 ------------------------------ */

  function meta(id) {
    var cfg = window.LY_GAMES || {};
    var list = cfg.games || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function bestKey(id) { return 'ly_game_best_' + id; }

  function readBest(def) {
    try {
      var v = parseFloat(localStorage.getItem(bestKey(def.id)));
      return isNaN(v) ? null : v;
    } catch (e) {
      return null;
    }
  }

  function writeBest(def, v) {
    try {
      localStorage.setItem(bestKey(def.id), String(v));
    } catch (e) {}
  }

  function isBetter(def, value, best) {
    if (value == null) return false;
    if (best == null) return true;
    return def.bestMode === 'low' ? value < best : value > best;
  }

  /* ------------------------------ 注册 ------------------------------ */

  function register(def) {
    if (!def || !def.id) return null;
    /* 缺省的钩子补成空实现，游戏那边就不用到处写守卫 */
    def.mode = def.mode || 'idle';
    def.view = def.view || { w: 400, h: 400 };
    def.hudLabels = def.hudLabels || ['SCORE', 'BEST', 'LEVEL'];
    def.pointerMode = def.pointerMode || 'none';
    def.pad = def.pad || {};
    defs[def.id] = def;
    return def;
  }

  /* ------------------------------ DOM ------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 外层遮罩只建一次（它上面的点击处理也只绑一次）；
     里面的机台在换游戏时整块重建 —— 标题、HUD 标题、方向键面板文案、
     canvas 尺寸都是逐游戏不同的，复用会有「玩完贪吃蛇再开俄罗斯方块，
     HUD 还写着 SCORE/LEVEL」这种脏状态。 */
  function ensureMask(def) {
    if (mask) return mask;
    if (!document.body) return null;

    mask = document.createElement('div');
    mask.className = 'gk-mask';
    mask.id = MASK_ID;
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');

    mask.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t === mask || t.closest('.gk-close')) { close(); return; }
      var act = t.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'start') primaryAction();
        else if (a === 'restart') doRestart();
        else if (a === 'pause') togglePause();
        return;
      }
      var dir = t.closest('[data-dir]');
      if (dir) onAction(dir.getAttribute('data-dir'), true);
    });

    document.body.appendChild(mask);
    return mask;
  }

  function renderCabinet(def) {
    var m = meta(def.id) || {};
    var labels = def.hudLabels;
    var pad = def.pad;

    function hudCell(i) {
      return '<div class="gk-hud-cell"><span>' + esc(labels[i]) + '</span>' +
        '<b data-hud="' + i + '">—</b></div>';
    }

    function dirBtn(action, glyph, label) {
      return '<button type="button" class="gk-btn gk-btn-' + action + '" data-dir="' + action +
        '" aria-label="' + esc(pad[action] || label) + '">' + glyph +
        (pad[action] ? '<i>' + esc(pad[action]) + '</i>' : '') + '</button>';
    }

    mask.setAttribute('aria-label', m.name || def.id);
    mask.innerHTML =
      '<div class="gk-cabinet" tabindex="-1">' +
        '<div class="gk-head">' +
          '<span class="gk-title">' + esc(m.name || def.id) + '</span>' +
          '<button type="button" class="gk-close" aria-label="关闭">' + CLOSE_SVG + '</button>' +
        '</div>' +
        '<div class="gk-hud">' + hudCell(0) + hudCell(1) + hudCell(2) + '</div>' +
        '<div class="gk-screen">' +
          '<canvas class="gk-canvas" width="' + def.view.w + '" height="' + def.view.h + '" ' +
            'aria-label="' + esc(m.name || def.id) + '游戏画面"></canvas>' +
          '<div class="gk-overlay" data-overlay>' +
            '<span class="gk-overlay-text" data-overlay-text></span>' +
            '<span class="gk-overlay-tip" data-overlay-tip></span>' +
          '</div>' +
        '</div>' +
        '<div class="gk-pad">' +
          '<div class="gk-dpad">' +
            dirBtn('up', '\u25b2', '上') +
            dirBtn('left', '\u25c0', '左') +
            dirBtn('down', '\u25bc', '下') +
            dirBtn('right', '\u25b6', '右') +
          '</div>' +
          '<button type="button" class="gk-btn gk-btn-confirm" data-dir="confirm">' +
            esc(pad.confirm || '确定') + '</button>' +
        '</div>' +
        '<div class="gk-foot">' +
          '<button type="button" data-act="start">开始</button>' +
          '<button type="button" data-act="restart">重开</button>' +
          '<button type="button" data-act="pause">暂停</button>' +
          '<span class="gk-hint">' + esc(def.hint || '') + '</span>' +
        '</div>' +
      '</div>';

    refs.cabinet = mask.querySelector('.gk-cabinet');
    refs.canvas = mask.querySelector('.gk-canvas');
    refs.screen = mask.querySelector('.gk-screen');
    refs.overlay = mask.querySelector('[data-overlay]');
    refs.overlayText = mask.querySelector('[data-overlay-text]');
    refs.overlayTip = mask.querySelector('[data-overlay-tip]');
    refs.startBtn = mask.querySelector('[data-act="start"]');
    refs.pauseBtn = mask.querySelector('[data-act="pause"]');
    refs.hud = mask.querySelectorAll('[data-hud]');
    refs.canvas.style.aspectRatio = def.view.w + ' / ' + def.view.h;
    refs.builtFor = def.id;

    /* jsdom 里没有 2d 上下文，拿不到就退化成「无画面」模式：
       逻辑照跑、HUD 照更新，只是画不出来，而不是整个机台崩掉 */
    ctx = refs.canvas.getContext ? refs.canvas.getContext('2d') : null;

    /* 方向键面板支持「按住」—— 打砖块要的是持续输入，不是一次点击。
       用 pointer 事件统一鼠标和触摸。节点每次都是新的，所以不会重复绑。 */
    mask.querySelectorAll('[data-dir]').forEach(function (btn) {
      var action = btn.getAttribute('data-dir');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.classList.add('on');
        if (btn.setPointerCapture && e.pointerId != null) {
          try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        }
        onAction(action, true);
      });
      var up = function () {
        btn.classList.remove('on');
        onAction(action, false);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });

    bindPointer(def);
  }

  /* ------------------------------ 输入 ------------------------------ */

  function onKeydown(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    var action = KEY_MAP[e.key];
    if (!action) return;
    /* 方向键会滚动页面，空格会滚屏，一律拦掉 */
    e.preventDefault();
    if (e.repeat && (action === 'confirm' || action === 'restart')) return;
    onAction(action, true);
  }

  function onKeyup(e) {
    if (!isOpen()) return;
    var action = KEY_MAP[e.key];
    if (!action) return;
    onAction(action, false);
  }

  /* 统一入口：键盘、方向键面板、滑动都走这里 */
  function onAction(action, down) {
    if (!rt || !down) {
      /* 抬起只告诉游戏，避免引擎重复触发 confirm */
      if (rt && rt.def.key) rt.def.key(rt.st, action, false, rt);
      return;
    }
    if (rt.over && (action === 'confirm' || action === 'restart')) {
      primaryAction();
      return;
    }
    if (rt.def.key && rt.def.key(rt.st, action, true, rt)) {
      syncSoft();
      return;
    }
    if (action === 'confirm') primaryAction();
    else if (action === 'restart') doRestart();
    else if (action === 'pause') togglePause();
    syncSoft();
  }

  function bindPointer(def) {
    if (def.pointerMode === 'none' || !refs.screen) return;
    var swipe = null;

    /* 扫雷要右键插旗，别让浏览器菜单弹出来盖住画面 */
    refs.screen.addEventListener('contextmenu', function (e) {
      if (rt && def.pointerMode === 'point') e.preventDefault();
    });

    refs.screen.addEventListener('pointerdown', function (e) {
      if (!rt) return;
      /* 滑动手势只对主键生效；右键不动摇杆起点 */
      swipe = e.button ? null : { x: e.clientX, y: e.clientY };
      if (def.pointerMode === 'point') {
        var pt = toLogical(e);
        if (pt) {
          pt.button = e.button || 0;
          if (def.pointer) def.pointer(rt.st, pt, 'down', rt);
        }
        e.preventDefault();
      }
      syncSoft();
    });

    refs.screen.addEventListener('pointermove', function (e) {
      if (!rt) return;
      if (def.pointerMode === 'point') {
        var pt = toLogical(e);
        if (pt) {
          /* pointermove 的 button 恒为 -1，沿用按下时那一个 */
          pt.button = e.buttons & 2 ? 2 : 0;
          if (def.pointer) def.pointer(rt.st, pt, 'move', rt);
        }
        return;
      }
      if (!swipe) return;
      /* 滑动：位移超过阈值就发一次方向，并把起点挪到当前位置，
         这样一次长拖可以连续转向（当虚拟摇杆用） */
      var dx = e.clientX - swipe.x;
      var dy = e.clientY - swipe.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) onAction(dx > 0 ? 'right' : 'left', true);
      else onAction(dy > 0 ? 'down' : 'up', true);
      swipe = { x: e.clientX, y: e.clientY };
    });

    var end = function (e) {
      if (!rt) return;
      if (def.pointerMode === 'point' && def.pointer && swipe) {
        var pt = toLogical(e);
        if (pt) {
          pt.button = e.button || 0;
          def.pointer(rt.st, pt, 'up', rt);
        }
      }
      swipe = null;
      syncSoft();
    };
    refs.screen.addEventListener('pointerup', end);
    refs.screen.addEventListener('pointercancel', end);
  }

  /* 客户端坐标 → canvas 逻辑坐标 */
  function toLogical(e) {
    var c = refs.canvas;
    if (!c || !c.getBoundingClientRect) return null;
    var r = c.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var def = rt && rt.def;
    var vw = def ? def.view.w : c.width;
    var vh = def ? def.view.h : c.height;
    return {
      x: (e.clientX - r.left) / r.width * vw,
      y: (e.clientY - r.top) / r.height * vh
    };
  }

  function bindKeys() {
    if (keysBound) return;
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('keyup', onKeyup, true);
    keysBound = true;
  }

  function unbindKeys() {
    if (!keysBound) return;
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('keyup', onKeyup, true);
    keysBound = false;
  }

  /* ------------------------------ 生命周期 ------------------------------ */

  function isOpen() { return !!(mask && mask.classList.contains('show')); }

  function confirmLabel() {
    if (!rt) return '开始';
    if (rt.over) return '再来一局';
    if (rt.paused) return '继续';
    if (rt.started) return '暂停';
    return '开始';
  }

  function primaryAction() {
    if (!rt) return;
    if (rt.over) { doRestart(); setStarted(true); return; }
    if (!rt.started) { setStarted(true); return; }
    togglePause();
  }

  function setStarted(on) {
    if (!rt) return;
    rt.started = !!on;
    rt.paused = false;
    acc = 0;
    syncSoft();
  }

  function togglePause() {
    if (!rt || !rt.started || rt.over) return;
    rt.paused = !rt.paused;
    acc = 0;
    syncSoft();
  }

  function doRestart() {
    if (!rt) return;
    rt.def.reset(rt.st);
    rt.started = !!rt.def.autoStart;
    rt.paused = false;
    rt.over = false;
    rt.recorded = false;
    rt.newRecord = false;
    acc = 0;
    hudCache = ['', '', ''];
    overlayKey = '';
    syncSoft();
  }

  function play(id) {
    var def = defs[id];
    if (!def || !document.body) return null;
    if (!ensureMask(def)) return null;
    if (refs.builtFor !== id) renderCabinet(def);

    rt = {
      id: id,
      def: def,
      best: readBest(def),
      started: false,
      paused: false,
      over: false,
      recorded: false,
      newRecord: false,
      st: def.create({ best: readBest(def) })
    };
    rt.started = !!def.autoStart;

    acc = 0;
    lastFrame = 0;
    hudCache = ['', '', ''];
    overlayKey = '';

    mask.classList.add('show');
    document.body.classList.add('gk-lock');
    lastFocus = document.activeElement;

    bindKeys();
    startLoop();
    draw(window.performance && window.performance.now ? window.performance.now() : Date.now());
    syncSoft();
    if (refs.cabinet.focus) {
      try { refs.cabinet.focus(); } catch (e) {}
    }
    return rt;
  }

  function close() {
    if (!mask) return;
    mask.classList.remove('show');
    document.body.classList.remove('gk-lock');
    stopLoop();
    unbindKeys();
    if (rt) rt.paused = true;
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  /* ------------------------------ 循环 ------------------------------ */

  function frame(now) {
    rafId = window.requestAnimationFrame(frame);
    if (!rt) return;

    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    lastFrame = now;
    if (dt > 250) dt = 250;          /* 切走标签页回来别一次补一大堆 */

    var def = rt.def;
    if (rt.started && !rt.paused && !rt.over) {
      if (def.mode === 'tick') {
        acc += dt;
        var guard = 0;
        while (guard++ < 16) {
          var stepMs = rt.st.tickMs || def.stepMs || 150;
          if (acc < stepMs) break;
          acc -= stepMs;
          if (def.tick) def.tick(rt.st, now);
          if (def.over(rt.st)) { markOver(); break; }
        }
        /* 兜底再看一眼：有些游戏是**被输入**结束的（比如手动认输、点了不该点的格子），
           不是每个 tick 都恰好会撞上。不看这一眼的话，结束遮罩最晚要等一整个
           步长才出现 —— 贪吃蛇最长 150ms，看起来就像「卡了一下」。 */
        if (!rt.over && def.over(rt.st)) markOver();
      } else if (def.mode === 'frame') {
        if (def.step) def.step(rt.st, dt, now);
        if (def.over(rt.st)) markOver();
      } else {
        /* mode='idle'（如 2048）：不在循环里推进状态，但仍然要检查终局 ——
           否则「四个方向都动不了」这种由输入触发的结束永远不会被上报 */
        acc = 0;
        if (def.over && def.over(rt.st)) markOver();
      }
    } else {
      acc = 0;
    }

    if (typeof def.animate === 'function' && !rt.over) def.animate(rt.st, dt, now);
    draw(now);
    syncHud();
    syncOverlay();
    syncButtons();
  }

  function markOver() {
    if (!rt || rt.over) return;
    rt.over = true;
    rt.paused = false;
    acc = 0;
    recordBest();
    overlayKey = '';
  }

  function recordBest() {
    if (!rt || rt.recorded || !rt.def.bestValue) return;
    rt.recorded = true;
    var value = rt.def.bestValue(rt.st);
    if (value == null) return;
    if (isBetter(rt.def, value, rt.best)) {
      rt.best = value;
      rt.newRecord = true;
      writeBest(rt.def, value);
    }
  }

  function draw(now) {
    if (!rt) return;
    /* 没有 2d 上下文（jsdom / 老浏览器）就跳过绘制，逻辑不受影响 */
    if (ctx && rt.def.draw) rt.def.draw(ctx, rt.st, now);
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

  /* ------------------------------ 视图同步 ------------------------------ */

  function syncHud() {
    if (!rt || !refs.hud) return;
    var def = rt.def;
    var values = def.hud
      ? def.hud(rt.st, rt.best, rt)
      : [String(def.score ? def.score(rt.st) : 0), rt.best == null ? '—' : String(rt.best), '—'];
    for (var i = 0; i < refs.hud.length; i++) {
      var v = values[i] == null ? '—' : String(values[i]);
      if (v === hudCache[i]) continue;
      hudCache[i] = v;
      refs.hud[i].textContent = v;
    }
  }

  function syncOverlay() {
    if (!rt || !refs.overlay) return;
    var def = rt.def;
    var text = '';
    var tip = '';
    var tone = '';

    if (rt.over) {
      text = def.overTitle ? def.overTitle(rt.st) : 'GAME OVER';
      tip = (def.overTip ? def.overTip(rt.st) : ('得分 ' + (def.score ? def.score(rt.st) : 0))) +
        (rt.newRecord ? ' \u00b7 新纪录！' : '') + ' \u00b7 按空格再来一局';
      tone = 'is-over';
    } else if (rt.paused) {
      text = 'PAUSED';
      tip = '按空格继续';
    } else if (!rt.started) {
      text = def.startText || 'PRESS START';
      tip = def.hint || '';
    }

    var key = text + '\u0000' + tip + '\u0000' + tone;
    if (key === overlayKey) return;
    overlayKey = key;

    refs.overlay.style.display = text ? '' : 'none';
    if (!text) return;
    refs.overlayText.textContent = text;
    refs.overlayText.classList.toggle('is-over', tone === 'is-over');
    refs.overlayTip.textContent = tip;
  }

  function syncSoft() {
    syncHud();
    syncOverlay();
    syncButtons();
  }

  function syncButtons() {
    if (!rt || !refs.startBtn) return;
    var label = confirmLabel();
    if (refs.startBtn.textContent !== label) refs.startBtn.textContent = label;
    var paused = !!rt.paused;
    refs.pauseBtn.disabled = !rt.started || rt.over;
    if (refs.pauseBtn.textContent !== (paused ? '继续' : '暂停')) {
      refs.pauseBtn.textContent = paused ? '继续' : '暂停';
    }
  }

  window.LY_GAME_KIT = {
    register: register,
    play: play,
    close: close,
    isOpen: isOpen,
    current: function () { return rt ? rt.id : null; },
    defs: function () { return Object.keys(defs); },
    has: function (id) { return !!defs[id]; },
    /* 测试与调试用 */
    rt: function () { return rt; },
    el: function () { return mask; },
    refs: function () { return refs; }
  };

})(window, document);
