/*!
 * 强化学习实验室（RL Lab）—— 交互实验引擎
 * ===========================================================================
 * 目标不是「放个动画给读者看」，而是让读者真的动手：
 *   - 手动模式：自己点臂，亲手体验「不知道哪个好，只能试」
 *   - 自动模式：换策略、拖探索率，看 Q 值怎么一步步逼近真实均值
 *   - 每一步都打印出增量式更新公式的实际数字，公式不是摆设
 *
 * 用法（文章里）：
 *   <div class="rl-lab" data-lab="bandit"></div>
 *   <script src="/js/rl/lab.js" defer></script>
 *
 * 样式由本文件按需注入，没读这类文章的人不会多下任何东西。
 * 配色一律读 Fluid 的 CSS 变量，换皮肤 / 切暗色自动跟随。
 * ===========================================================================
 */

(function (window, document) {
  'use strict';

  if (window.LY_RL) return;

  var CSS_HREF = '/css/rl.css';
  var labs = Object.create(null);
  var redraws = [];          // 主题切换时要重画的实验

  /* =======================================================================
     基础工具
     ======================================================================= */

  function cssVar(name, fb) {
    var v = window.getComputedStyle(document.documentElement)
      .getPropertyValue(name);
    return (v && v.trim()) || fb;
  }

  function palette() {
    return {
      ink: cssVar('--text-color', '#333333'),
      faint: cssVar('--sec-text-color', '#8a8a8a'),
      edge: cssVar('--line-color', '#e0e0e0'),
      bg: cssVar('--board-bg-color', '#ffffff'),
      accent: cssVar('--post-link-color', '#2c6eb5')
    };
  }

  /* 高 DPI 画布：CSS 像素尺寸和物理像素分开，线条才不会糊 */
  function fit(cv, hCss) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = cv.clientWidth || 640;
    if (w < 220) w = 220;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(hCss * dpr);
    cv.style.height = hCss + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hCss);
    return { ctx: ctx, w: w, h: hCss };
  }

  function setFont(ctx, size, bold) {
    ctx.font = (bold ? '600 ' : '') + size + 'px -apple-system, "Segoe UI", ' +
      '"Microsoft YaHei", "PingFang SC", sans-serif';
  }

  function label(ctx, s, x, y, color, size, align, baseline) {
    setFont(ctx, size || 11, false);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(s, x, y);
  }

  function f2(x) {
    return (Math.round(x * 100) / 100).toFixed(2);
  }

  /* 标准正态：Box-Muller。用一个自带的线性同余发生器，
     保证每次刷新实验的随机序列都不同，但又能被 seed 复现 */
  function rng(seed) {
    var s = seed || (Date.now() % 2147483647);
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function gaussFactory(rand) {
    var spare = null;
    return function () {
      if (spare !== null) { var t = spare; spare = null; return t; }
      var u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      var m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    };
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  /* =======================================================================
     实验一：10 臂老虎机
     -----------------------------------------------------------------------
     教学主线：RL 里没有标签，只有试出来的奖励。既然只能试，就必然要面对
     「继续押注看起来最好的，还是花一次机会去确认别的是不是更好」。
     三种策略对应三种探索来源：随机 / 初值 / 不确定性。
     ======================================================================= */

  // 真实均值的取值池。每个实例开局抽一副，重开一局会重新洗牌——
  // 否则读者第二局已经知道答案，探索就消失了。
  var MU_BASE = [0.31, -0.62, 1.14, 0.48, -1.62, 0.87, 2.05, -0.34, 0.02, 1.38];
  var N_ARM = MU_BASE.length;
  var OPTIMISTIC_Q0 = 5;              // 乐观初值：故意高于一切真实均值

  // 手动模式给固定预算：没有终点的游戏没有张力，读者也不知道「这样算不算好」。
  // 50 次足够拉出高低，又不至于长到让人失去耐心。
  var BUDGET = 50;

  // 自动模式同样要有终点。以前它是无限跑的：曲线一直在动、数字一直在涨，
  // 但从来不告诉你「学成了没有」——读者只能盯着四个指标猜。
  // 800 步足够三类策略都跑到收敛，又不会长到让人等。
  var AUTO_STEPS = 800;

  // 判「最近学得怎么样」的滑动窗口。用累计比例不行：开头那段必须瞎试，
  // 累计值会被永久拖低，跑多久都到不了 100%，看不出收敛。
  var WIN = 200;

  function mountBandit(root) {
    var P = palette();
    var rand = rng();
    var gauss = gaussFactory(rand);

    // 每个实例自己持有一副真实均值，互不干扰：手动面板和自动面板本来就是两局
    var MU = MU_BASE.slice();
    var BEST = MU.indexOf(Math.max.apply(null, MU));

    // data-mode="auto" 让这个实例直接进训练界面，用于「三种策略对比」那一节
    var initMode = root.getAttribute('data-mode') === 'auto' ? 'auto' : 'manual';
    var customTitle = root.getAttribute('data-title');

    var S = {
      mode: initMode,                 // 'manual' | 'auto'
      algo: 'egreedy',                // 'egreedy' | 'optimistic' | 'ucb'
      eps: 0.10,
      c: 2.0,
      speed: 1,                       // 索引 → SPEEDS
      running: false,
      q: [],
      n: [],
      t: 0,
      gain: 0,
      recent: null,                   // 最近一次更新，用来生成公式读数
      ema: [],                        // [{t, v}] 学习曲线
      emaV: 0,
      pulse: null,
      best: 0,                        // 最优臂被拉动的次数
      win: [],                        // 最近 WIN 步是否押中（1/0），判「学会」用
      winSum: 0,
      done: false                     // 预算是否用完（手动 50 次 / 自动 800 步）
    };

    var SPEEDS = [2, 10, 40];
    var SPEED_LABEL = ['慢', '中', '快'];

    function shuffleMu() {
      MU = MU_BASE.slice();
      for (var i = N_ARM - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = MU[i]; MU[i] = MU[j]; MU[j] = t;
      }
      BEST = MU.indexOf(Math.max.apply(null, MU));
    }

    function resetQ() {
      for (var i = 0; i < N_ARM; i++) {
        S.q[i] = (S.algo === 'optimistic') ? OPTIMISTIC_Q0 : 0;
        S.n[i] = 0;
      }
    }

    // reshuffle：换一副新的真实均值。只在「再来一局」时用，
    // 否则读者重玩时会照着上一局的答案点，后悔值永远是 0。
    function reset(hard, reshuffle) {
      if (reshuffle) shuffleMu();
      resetQ();
      S.t = 0;
      S.gain = 0;
      S.ema = [];
      S.emaV = 0;
      S.best = 0;
      S.win = [];
      S.winSum = 0;
      S.recent = null;
      S.pulse = null;
      S.done = false;
      if (hard) { S.running = false; }
      resultBox.style.display = 'none';
      syncProgress();
      cvArms.classList.toggle('clickable', S.mode === 'manual');
      renderReadout();
      renderStats();
      drawArms();
      drawCurve();
      syncButtons();
    }

    /* ---------------- 一次交互：抽一次奖励、更新一次估计 ---------------- */
    function pull(a) {
      var r = MU[a] + gauss();        // 真实奖励 = 真实均值 + 单位噪声
      var before = S.q[a];

      S.n[a] += 1;
      S.t += 1;
      S.gain += r;
      if (a === BEST) S.best += 1;

      // 滑动窗口：只留最近 WIN 步。这是「现在学得怎么样」的唯一证据，
      // 累计值会把开头的探索成本永远记在账上。
      var hit = (a === BEST) ? 1 : 0;
      S.win.push(hit);
      S.winSum += hit;
      if (S.win.length > WIN) S.winSum -= S.win.shift();

      // 增量式更新：Q ← Q + (1/N)(R − Q)，等价于「到目前为止的样本均值」
      S.q[a] = before + (r - before) / S.n[a];

      S.recent = {
        a: a, r: r, before: before, after: S.q[a], n: S.n[a]
      };

      // 学习曲线用指数滑动平均，单次奖励噪声太大看不出趋势。
      // 第一帧直接取该次奖励，否则从 0 起爬会让开局那段曲线失真。
      if (S.t === 1) S.emaV = r;
      else S.emaV += 0.02 * (r - S.emaV);

      // 每 4 步采一个点：曲线本来就是平滑的，没必要逐步存。
      // 超过上限时抽稀一半而不是砍掉开头，砍掉会让曲线从左边缘缺失一段。
      if (S.t % 4 === 1) {
        S.ema.push({ t: S.t, v: S.emaV });
        if (S.ema.length > 12000) {
          var thin = [];
          for (var q = 0; q < S.ema.length; q += 2) thin.push(S.ema[q]);
          S.ema = thin;
        }
      }

      S.pulse = { a: a, t0: performance.now() };
      return r;
    }

    /* ---------------- 策略 ---------------- */
    function argmaxQ() {
      var m = -Infinity, cand = [];
      for (var i = 0; i < N_ARM; i++) {
        if (S.q[i] > m + 1e-12) { m = S.q[i]; cand = [i]; }
        else if (Math.abs(S.q[i] - m) <= 1e-12) { cand.push(i); }
      }
      return cand[Math.floor(rand() * cand.length)];
    }

    function choose() {
      if (S.algo === 'egreedy') {
        if (rand() < S.eps) return Math.floor(rand() * N_ARM);
        return argmaxQ();
      }
      if (S.algo === 'optimistic') {
        return argmaxQ();             // ε = 0，探索全靠初值
      }
      // UCB：A = argmax[ Q(a) + c·√(ln t / N(a)) ]，没拉过的臂优先
      var bestA = -1, bestV = -Infinity, untried = -1;
      for (var i = 0; i < N_ARM; i++) {
        if (S.n[i] === 0) { untried = i; break; }
        var v = S.q[i] + S.c * Math.sqrt(Math.log(S.t + 1) / S.n[i]);
        if (v > bestV) { bestV = v; bestA = i; }
      }
      return untried >= 0 ? untried : bestA;
    }

    /* ---------------- DOM ---------------- */
    var head = el('div', 'rl-head');
    var title = el('b', null, customTitle ||
      (initMode === 'auto' ? '交互实验 · 三种探索策略' : '交互实验 · 10 臂老虎机'));
    var sub = el('span', null, initMode === 'auto'
      ? '切换策略，看谁更快锁定真实最优'
      : '真实均值是隐藏的，你只能靠试');
    var badge = el('span', 'rl-badge', 'RL LAB 01');
    head.appendChild(title);
    head.appendChild(sub);
    head.appendChild(badge);

    var tabs = el('div', 'rl-tabs');
    var tabManual = el('button', 'rl-tab on', '你手动试');
    var tabAuto = el('button', 'rl-tab', '让算法学');
    tabManual.type = tabAuto.type = 'button';
    tabs.appendChild(tabManual);
    tabs.appendChild(tabAuto);

    // 进度条：手动模式数机会，自动模式数训练步数——两者都必须有终点。
    var progress = el('div', 'rl-progress');
    var progressBar = el('div', 'bar');
    var progressFill = el('i');
    progressBar.appendChild(progressFill);
    var progressTxt = el('span', null, '机会 0 / 50');
    progress.appendChild(progressBar);
    progress.appendChild(progressTxt);

    var stage = el('div', 'rl-stage');
    var cvArms = el('canvas', 'rl-canvas');
    stage.appendChild(cvArms);

    var hint = el('div', 'rl-hint', '点任意一台机器，看看它给你多少钱。');

    var readout = el('div', 'rl-readout');

    // 结算面板：手动模式用完预算才出现
    var resultBox = el('div', 'rl-result');
    resultBox.style.display = 'none';
    var resultHd = el('div', 'rl-result-hd');
    var resultRow = el('div', 'rl-result-row');
    var resultNote = el('p', null);
    var btnAgain = el('button', 'rl-btn primary', '再来一局');
    btnAgain.type = 'button';
    resultBox.appendChild(resultHd);
    resultBox.appendChild(resultRow);
    resultBox.appendChild(resultNote);
    resultBox.appendChild(btnAgain);

    var controls = el('div', 'rl-controls');

    // 策略选择（自动模式才显示）
    var fieldAlgo = el('div', 'rl-field wide');
    var algoLabel = el('label', null);
    algoLabel.appendChild(document.createTextNode('探索策略'));
    fieldAlgo.appendChild(algoLabel);
    var seg = el('div', 'rl-seg');
    var algos = [
      { id: 'egreedy', txt: 'ε-greedy' },
      { id: 'optimistic', txt: '乐观初值' },
      { id: 'ucb', txt: 'UCB' }
    ];
    var algoBtns = {};
    algos.forEach(function (o) {
      var b = el('button', 'rl-tab sm' + (o.id === S.algo ? ' on' : ''), o.txt);
      b.type = 'button';
      b.onclick = function () {
        S.algo = o.id;
        Object.keys(algoBtns).forEach(function (k) {
          algoBtns[k].classList.toggle('on', k === o.id);
        });
        reset(true);
        syncFields();
        drawArms();
      };
      algoBtns[o.id] = b;
      seg.appendChild(b);
    });
    fieldAlgo.appendChild(seg);

    // 探索率
    var fieldEps = el('div', 'rl-field');
    var epsLabel = el('label', null);
    var epsName = el('span', null, '探索率 ε');
    var epsVal = el('b', null, '0.10');
    epsLabel.appendChild(epsName);
    epsLabel.appendChild(epsVal);
    var rangeEps = el('input', 'rl-range');
    rangeEps.type = 'range';
    rangeEps.min = '0'; rangeEps.max = '50'; rangeEps.step = '1';
    rangeEps.value = '10';
    rangeEps.oninput = function () {
      S.eps = (+rangeEps.value) / 100;
      epsVal.textContent = f2(S.eps);
    };
    fieldEps.appendChild(epsLabel);
    fieldEps.appendChild(rangeEps);

    // UCB 的 c
    var fieldC = el('div', 'rl-field');
    var cLabel = el('label', null);
    var cName = el('span', null, '置信系数 c');
    var cVal = el('b', null, '2.0');
    cLabel.appendChild(cName);
    cLabel.appendChild(cVal);
    var rangeC = el('input', 'rl-range');
    rangeC.type = 'range';
    rangeC.min = '2'; rangeC.max = '40'; rangeC.step = '1';
    rangeC.value = '20';
    rangeC.oninput = function () {
      S.c = (+rangeC.value) / 10;
      cVal.textContent = S.c.toFixed(1);
    };
    fieldC.appendChild(cLabel);
    fieldC.appendChild(rangeC);

    // 速度
    var fieldSpeed = el('div', 'rl-field');
    var spLabel = el('label', null);
    spLabel.appendChild(document.createTextNode('训练速度'));
    fieldSpeed.appendChild(spLabel);
    var segSpeed = el('div', 'rl-seg');
    var speedBtns = [];
    SPEED_LABEL.forEach(function (txt, i) {
      var b = el('button', 'rl-tab sm' + (i === 0 ? ' on' : ''), txt);
      b.type = 'button';
      b.onclick = function () {
        S.speed = i;
        speedBtns.forEach(function (x, j) { x.classList.toggle('on', j === i); });
      };
      speedBtns.push(b);
      segSpeed.appendChild(b);
    });
    fieldSpeed.appendChild(segSpeed);

    // 按钮
    var btns = el('div', 'rl-btns');
    var btnRun = el('button', 'rl-btn primary', '开始训练');
    var btnReset = el('button', 'rl-btn', '重置');
    btnRun.type = btnReset.type = 'button';
    btns.appendChild(btnRun);
    btns.appendChild(btnReset);

    controls.appendChild(fieldAlgo);
    controls.appendChild(fieldEps);
    controls.appendChild(fieldC);
    controls.appendChild(fieldSpeed);
    controls.appendChild(btns);

    // 指标
    var stats = el('div', 'rl-stats');
    var statDefs = [
      { k: 't', label: '试验次数' },
      { k: 'gain', label: '累计收益' },
      { k: 'avg', label: '近期均值' },
      { k: 'best', label: '近期押中率' }
    ];
    var statEls = {};
    statDefs.forEach(function (d) {
      var box = el('div', 'rl-stat');
      var em = el('em', null, d.label);
      var b = el('b', null, '0');
      box.appendChild(em);
      box.appendChild(b);
      stats.appendChild(box);
      statEls[d.k] = b;
    });

    // 曲线
    var curveBox = el('div', 'rl-curve-box');
    var cap = el('div', 'rl-curve-cap', '学习曲线：每步奖励的滑动平均');
    var cvCurve = el('canvas', 'rl-canvas');
    curveBox.appendChild(cap);
    curveBox.appendChild(cvCurve);

    root.appendChild(head);
    root.appendChild(tabs);
    root.appendChild(progress);
    root.appendChild(stage);
    root.appendChild(hint);
    root.appendChild(readout);
    root.appendChild(resultBox);
    root.appendChild(controls);
    root.appendChild(stats);
    root.appendChild(curveBox);

    /* ---------------- 渲染：臂面板 ---------------- */
    function drawArms() {
      var f = fit(cvArms, 268);
      var ctx = f.ctx, W = f.w, H = f.h;
      var padL = 34, padR = 14, padT = 34, padB = 64;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var yMax = 2.8, yMin = -2.4;

      // 手动模式在结算前不揭晓真值，否则读者一眼就看出哪根柱子该最高
      var showMu = (S.mode === 'auto') || S.done;

      function Y(v) {
        return padT + plotH * (yMax - v) / (yMax - yMin);
      }

      // 网格 + y 轴刻度
      ctx.strokeStyle = P.edge;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      [-2, 0, 2].forEach(function (v) {
        var y = Math.round(Y(v)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        label(ctx, v > 0 ? '+' + v : String(v), padL - 8, y, P.faint, 10, 'right');
      });
      ctx.setLineDash([]);

      var y0 = Y(0);
      var gap = plotW / N_ARM;
      var bw = Math.min(gap * 0.54, 34);

      for (var i = 0; i < N_ARM; i++) {
        var cx = padL + gap * (i + 0.5);
        var qv = S.q[i];
        var isRecent = S.recent && S.recent.a === i;

        // Q 柱
        ctx.globalAlpha = isRecent ? 0.95 : 0.62;
        ctx.fillStyle = qv >= 0 ? P.accent : P.faint;
        var h = Math.abs(Y(qv) - y0);
        if (h < 2 && S.n[i] > 0) h = 2;
        if (S.n[i] === 0) {
          // 还没试过：画一个空心占位
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = P.faint;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bw / 2, y0 - 14, bw, 14);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillRect(cx - bw / 2, Math.min(y0, Y(qv)), bw, h);
        }
        ctx.globalAlpha = 1;

        // 真实均值：一条短横线，读者能看出「估计在往它靠」。
        // 手动模式不能画——一画就等于把答案印在屏幕上，探索就没意义了。
        // 等这一局结算了再揭晓。
        if (showMu) {
          ctx.strokeStyle = P.ink;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - bw / 2 - 3, Y(MU[i]));
          ctx.lineTo(cx + bw / 2 + 3, Y(MU[i]));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // 拉动次数
        if (S.n[i] > 0) {
          label(ctx, '×' + S.n[i], cx, H - 46, P.faint, 10);
        }

        // 臂编号
        var isBest = (i === BEST) && (S.mode === 'auto' ? S.t > 60 : true);
        label(ctx, String(i + 1), cx, H - 30,
          isRecent ? P.accent : P.faint, 11);
      }

      // 真值最高的臂：自动模式跑够久才揭晓，手动模式等结算
      if ((S.mode === 'auto' && S.t > 60) || (S.mode === 'manual' && S.done)) {
        var bx = padL + gap * (BEST + 0.5);
        label(ctx, '真实最优', bx, padT - 20, P.ink, 10);
      }

      // 自动模式结算后，如果它认定的最优臂不是真值最高那台，把错的那台也标出来。
      // 这是「没学会」最直接的证据：两根柱子各挂一个名字，错位一眼看见。
      if (S.mode === 'auto' && S.done) {
        var pickA = argmaxQ();
        if (pickA !== BEST) {
          label(ctx, '它选的', padL + gap * (pickA + 0.5), padT - 6, P.accent, 10);
        }
      }

      // 图例：放画布左上角。右侧要留给「真实最优」的标注，
      // 窄屏下那块会跟图例撞在一起。
      var ly = 13;
      if (showMu) {
        var lx = padL + 2;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = P.accent;
        ctx.fillRect(lx, ly - 2, 10, 4);
        ctx.globalAlpha = 1;
        label(ctx, 'Q 估计', lx + 14, ly, P.faint, 10, 'left');
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx + 62, ly);
        ctx.lineTo(lx + 74, ly);
        ctx.stroke();
        ctx.globalAlpha = 1;
        label(ctx, '真实均值 μ', lx + 78, ly, P.faint, 10, 'left');
      } else {
        var mx = padL + 2;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = P.accent;
        ctx.fillRect(mx, ly - 2, 10, 4);
        ctx.globalAlpha = 1;
        label(ctx, 'Q 估计', mx + 14, ly, P.faint, 10, 'left');
      }

      // 点击脉冲
      if (S.pulse) {
        var age = performance.now() - S.pulse.t0;
        if (age < 420) {
          var px = padL + gap * (S.pulse.a + 0.5);
          var rad = 12 + age / 14;
          ctx.globalAlpha = Math.max(0, 1 - age / 420) * 0.7;
          ctx.strokeStyle = P.accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, y0 - 10, rad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    /* ---------------- 渲染：学习曲线 ---------------- */
    function drawCurve() {
      var f = fit(cvCurve, 158);
      var ctx = f.ctx, W = f.w, H = f.h;
      var padL = 38, padR = 14, padT = 14, padB = 26;
      var plotW = W - padL - padR, plotH = H - padT - padB;

      var xMax = Math.max(S.t, 40);
      var yMax = 2.8;

      // 轴
      ctx.strokeStyle = P.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + plotH);
      ctx.lineTo(W - padR, padT + plotH);
      ctx.stroke();

      label(ctx, '0', padL - 6, padT + plotH, P.faint, 10, 'right');
      label(ctx, '奖励', padL - 6, padT + 6, P.faint, 10, 'right');

      if (S.ema.length < 2) {
        label(ctx, '开始训练后这里会出现平均奖励曲线',
          (padL + W - padR) / 2, padT + plotH / 2, P.faint, 11);
        return;
      }

      function X(t) { return padL + plotW * (t / xMax); }
      function Y(v) { return padT + plotH * (1 - Math.max(0, v) / yMax); }

      // 参考线：真实最优均值
      ctx.strokeStyle = P.faint;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 4]);
      var yBest = Y(MU[BEST]);
      ctx.beginPath();
      ctx.moveTo(padL, yBest);
      ctx.lineTo(W - padR, yBest);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      label(ctx, '最优臂真值', padL + 4, yBest - 10, P.faint, 10, 'left');

      // 曲线
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      var step = Math.max(1, Math.floor(S.ema.length / (plotW * 1.5)));
      for (var i = 0; i < S.ema.length; i += step) {
        var p = S.ema[i];
        var x = X(p.t), y = Y(p.v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      var last = S.ema[S.ema.length - 1];
      ctx.lineTo(X(last.t), Y(last.v));
      ctx.stroke();

      // 终点圆点
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(X(last.t), Y(last.v), 3, 0, Math.PI * 2);
      ctx.fill();

      label(ctx, String(xMax) + ' 步', W - padR, padT + plotH + 14, P.faint, 10, 'right');
      label(ctx, '0', padL, padT + plotH + 14, P.faint, 10);
    }

    /* ---------------- 读数 / 指标 ---------------- */
    function renderReadout() {
      if (!S.recent) {
        readout.innerHTML = '<span class="d">还没拉过任何一台。' +
          '试一次，这里会显示 Q 值是怎么被修正的。</span>';
        return;
      }
      var r = S.recent;
      var an = 'a' + (r.a + 1);
      readout.innerHTML =
        'Q(' + an + ') ← Q(' + an + ') + (1/' + '<span class="k">' + r.n +
        '</span>)(R − Q(' + an + '))\n' +
        '        = ' + f2(r.before) + ' + (1/' + r.n + ')(' +
        '<span class="k">' + f2(r.r) + '</span> − ' + f2(r.before) + ') = ' +
        '<span class="k">' + f2(r.after) + '</span>' +
        '        <span class="d">这次奖励 R = ' + f2(r.r) + '</span>';
    }

    function renderStats() {
      statEls.t.textContent = S.t;
      statEls.gain.textContent = f2(S.gain);
      var recentAvg = S.t > 0 ? S.emaV : 0;
      statEls.avg.textContent = f2(recentAvg);
      // 报最近 WIN 步的押中率，不是全程累计。
      // 累计值被开头的探索期永久拖低，读者会以为「它一直没学会」；
      // 反而在真的收敛之后，这个数字才第一次有意义地往上爬。
      statEls.best.textContent = S.win.length
        ? Math.round(S.winSum / S.win.length * 100) + '%' : '—';
    }

    /* ---------------- 预算与结算 ---------------- */
    function syncProgress() {
      var manual = S.mode === 'manual';
      var total = manual ? BUDGET : AUTO_STEPS;
      var used = Math.min(S.t, total);
      progress.style.display = '';
      progressFill.style.width = (used / total * 100) + '%';
      progress.classList.toggle('full', used >= total);
      progressTxt.textContent = manual
        ? '机会 ' + used + ' / ' + BUDGET
        : '训练 ' + used + ' / ' + AUTO_STEPS + ' 步';
    }

    // 评语按「每拉一次平均亏掉多少」分档，不按绝对后悔值——
    // 这样即使以后改了预算，评语也不用跟着改。
    //
    // 几个锚点（50 次、最优臂 2.05）：
    //   全拉最优 → 0        每台拉一次后锁定 → 约 0.34
    //   全拉次优 → 0.67     纯随机乱拉      → 约 1.68
    function verdict(regret) {
      var per = regret / BUDGET;
      if (per <= 0.15) return '几乎没交学费。你很快就锁定了最好那台，之后没再浪费机会。';
      if (per <= 0.40) return '干净。花在探索上的钱不多，而且花在了该花的地方。';
      if (per <= 0.85) return '正常水平。为了搞清哪台好，总得先付点钱——多数人的第一次都落在这一段。';
      if (per <= 1.40) return '试得偏多。你可能反复回去确认已经确认过的事情，而确认本身是要收钱的。';
      return '你在摸底，不在赚钱。机会大量流向明显差劲的机器，这个成绩和乱点差别不大。';
    }

    function finish() {
      S.done = true;
      S.running = false;

      var perfect = MU[BEST] * BUDGET;      // 全程押最好那台的期望收益
      var regret = perfect - S.gain;

      resultHd.textContent = BUDGET + ' 次机会用完了';
      resultRow.innerHTML = '';
      [
        ['你赚了', f2(S.gain)],
        ['全程只拉最优臂', f2(perfect)],
        ['后悔值', f2(regret)]
      ].forEach(function (c) {
        var box = el('div', 'rl-cell');
        box.appendChild(el('em', null, c[0]));
        box.appendChild(el('b', null, c[1]));
        resultRow.appendChild(box);
      });

      resultNote.innerHTML = '';
      var l1 = el('span', null, verdict(regret));
      var l2 = el('span', 'd', '后悔值 = 完美收益 − 你的收益。' +
        '它不可能归零：不先花钱试，你根本不知道哪台最好。');
      resultNote.appendChild(l1);
      resultNote.appendChild(l2);
      resultBox.style.display = '';

      hint.textContent = '刚才那些黑线就是每台的真实均值——现在你看到答案了。' +
        '再来一局，这次你知道该怎么分配机会。';

      btnAgain.textContent = '再来一局';
      // 结论紧跟画布：读者刚点完，眼睛还在柱子上
      root.insertBefore(resultBox, controls);
      cvArms.classList.remove('clickable');
      drawArms();
      syncButtons();
    }

    /* ---------------- 自动模式结算：它到底学会了没有 ---------------- */
    // 「学会」要拆成两问，因为它们会分别坏掉：
    //   认对 —— argmax Q 指向的是不是真实最优（搞没搞清楚哪台好）
    //   用上 —— 最近 WIN 步的押中率（有没有真的照着做）
    // 只问其中一问，就会把「知道却不做」和「压根不知道」混成一件事。
    //
    // 0.75 这条线不是拍的：ε = 0.1 的 ε-greedy 收敛后押中率约
    // (1-ε) + ε/10 ≈ 0.91；ε = 0.3 时约 0.73。所以 0.75 正好把
    // 「探索还在浪费机会」和「探索已经收敛」分开。
    function finishAuto() {
      S.done = true;
      S.running = false;

      var pick = argmaxQ();
      var hit = S.win.length ? S.winSum / S.win.length : 0;
      var known = (pick === BEST);
      var applied = (hit >= 0.75);
      var pct = Math.round(hit * 100);

      resultHd.textContent = '训练 ' + AUTO_STEPS + ' 步结束';

      resultRow.innerHTML = '';
      [
        ['它认定最好', '第 ' + (pick + 1) + ' 台'],
        ['真实最优', '第 ' + (BEST + 1) + ' 台'],
        ['近期押中率', pct + '%'],
        ['它估的值', f2(S.q[pick])]
      ].forEach(function (c) {
        var box = el('div', 'rl-cell');
        box.appendChild(el('em', null, c[0]));
        box.appendChild(el('b', null, c[1]));
        resultRow.appendChild(box);
      });

      var l1, l2;
      if (known && applied) {
        l1 = '学会了。它认对了哪台最好，并把 ' + pct + '% 的机会压在它身上。';
        l2 = '它给这台估的值是 ' + f2(S.q[pick]) + '，真值是 ' + f2(MU[pick]) +
          '。这个数字不是谁告诉它的，是八百次拉动平均出来的。';
      } else if (known) {
        l1 = '认对了，但没照着做。它知道第 ' + (pick + 1) + ' 台最好，' +
          '只给了它 ' + pct + '% 的机会。';
        l2 = '探索率压不下来：它一边知道答案，一边把机会继续分给已知更差的机器。' +
          '把 ε 调小（或 c 调小）再跑一次，这个数字会上去。';
      } else {
        l1 = '没学会。它认定第 ' + (pick + 1) + ' 台最好，' +
          '但真正最好的是第 ' + (BEST + 1) + ' 台。';

        // 归因要分两种情况，否则会说错：
        // 对选中那台「严重高估」= 被开头几次运气骗了；
        // 「估得很准却还是选错」= 它压根没认真试过别的台。
        var over = S.q[pick] - MU[pick];
        var tried = S.n[BEST];
        var triedTxt = tried === 0 ? '一次都没拉过'
          : '只被拉了 ' + tried + ' 次';
        if (over > 0.2) {
          l2 = '它给第 ' + (pick + 1) + ' 台估了 ' + f2(S.q[pick]) +
            '，真值只有 ' + f2(MU[pick]) + '——高估了。头几次运气把估计抬上去，' +
            '之后机会一直往这台倾斜，它就再没回过头。八百步里第 ' + (BEST + 1) +
            ' 台' + triedTxt + '。';
        } else {
          l2 = '它对第 ' + (pick + 1) + ' 台的估计其实很准（' + f2(S.q[pick]) +
            '，真值 ' + f2(MU[pick]) + '），问题不在这里——它只是从没试过第 ' +
            (BEST + 1) + ' 台：八百步里' + triedTxt + '，' +
            '而那里才是 ' + f2(MU[BEST]) + '。这是探索不足。';
        }
      }
      resultNote.innerHTML = '';
      resultNote.appendChild(el('span', 'lead', l1));
      resultNote.appendChild(el('span', 'd', l2));
      resultBox.style.display = '';

      hint.textContent = '跑满了。下面这块是它的成绩单——认没认对，用没用上。';

      btnAgain.textContent = '换一副牌重跑';
      root.insertBefore(resultBox, controls);
      renderStats();
      syncProgress();
      syncButtons();

      // 读者点「开始训练」时视口停在按钮上，而成绩单在画布下方，
      // 不滚一下就会漏掉——「跑完了然后呢」正是这里最容易断的地方。
      // 「露出 30px 也算在视口里」是不行的，那点高度连标题都读不全，
      // 所以判据是「有没有完整露出来」。
      // 放在最后并包起来：万一环境不支持 scrollIntoView 的 options 形式，
      // 也不能让已经算好的结论卡在半成品状态。
      try {
        var rc = resultBox.getBoundingClientRect();
        if (rc.top < 8 || rc.bottom > window.innerHeight - 8) {
          resultBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      } catch (e) { /* 不支持就退化成不滚动，结论照样在画布下方 */ }
    }

    /* ---------------- 主循环 ---------------- */
    var raf = 0;

    function kick() {
      if (!raf) raf = requestAnimationFrame(loop);
    }

    function loop(ts) {
      raf = 0;
      var alive = false;

      if (S.running) {
        var n = SPEEDS[S.speed];
        for (var i = 0; i < n; i++) {
          // 一帧里可能跑多步，必须逐步检查，否则最后一步会冲过预算
          if (S.mode === 'auto' && S.t >= AUTO_STEPS) break;
          pull(choose());
        }
        if (S.mode === 'auto' && S.t >= AUTO_STEPS) finishAuto();
        alive = true;
      }
      if (S.pulse && ts - S.pulse.t0 < 440) alive = true;

      drawArms();
      drawCurve();
      if (S.running) { renderReadout(); renderStats(); syncProgress(); }

      if (alive) raf = requestAnimationFrame(loop);
    }

    /* ---------------- 交互 ---------------- */
    cvArms.addEventListener('click', function (ev) {
      if (S.mode !== 'manual' || S.done) return;
      var rect = cvArms.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var padL = 34, padR = 14;
      var plotW = rect.width - padL - padR;
      if (x < padL || x > rect.width - padR) return;
      var idx = Math.floor((x - padL) / (plotW / N_ARM));
      if (idx < 0 || idx >= N_ARM) return;

      pull(idx);
      renderReadout();
      renderStats();
      syncProgress();

      if (S.t >= BUDGET) {
        finish();
        kick();
        return;
      }

      hint.textContent = '第 ' + S.t + ' 次：你拉了第 ' + (idx + 1) +
        ' 台，拿到 ' + f2(S.recent.r) + '。它的估计值从 ' +
        f2(S.recent.before) + ' 修正到 ' + f2(S.recent.after) + '。';
      kick();       // 触发一次重绘 + 脉冲动画
    });

    function syncButtons() {
      btnRun.textContent = S.running ? '暂停' : (S.mode === 'manual' ? '自动跑' : '开始训练');
      // 跑完就锁住：要么重置重跑，要么换一副牌。让按钮还能继续点，
      // 读者会以为「再跑几步」能改结论——预算用完了就是没有更多证据了。
      btnRun.disabled = S.done;
      btnReset.disabled = false;
    }

    function syncFields() {
      var auto = S.mode === 'auto';
      fieldAlgo.style.display = auto ? '' : 'none';
      fieldEps.style.display = (auto && S.algo === 'egreedy') ? '' : 'none';
      fieldC.style.display = (auto && S.algo === 'ucb') ? '' : 'none';
      fieldSpeed.style.display = auto ? '' : 'none';
      // 手动模式不显示「最优臂占比」：读者第一次就可能点中真值最高的那台，
      // 这个指标会把答案提前泄露出去。
      statEls.best.parentNode.style.display = auto ? '' : 'none';
      cvArms.classList.toggle('clickable', !auto && !S.done);
      syncProgress();
      hint.textContent = auto
        ? '跑满 ' + AUTO_STEPS + ' 步会自动停，然后告诉你它学会了没有。'
        : '有 ' + BUDGET + ' 次机会，点柱子拉一次。目标只有一个：累计拿到最多的钱。';
    }

    function setMode(m) {
      S.mode = m;
      S.running = false;
      tabManual.classList.toggle('on', m === 'manual');
      tabAuto.classList.toggle('on', m === 'auto');
      syncFields();
      syncButtons();
      reset(true);
    }

    tabManual.onclick = function () { setMode('manual'); };
    tabAuto.onclick = function () { setMode('auto'); };

    btnRun.onclick = function () {
      if (S.mode === 'manual') { setMode('auto'); }
      S.running = !S.running;
      syncButtons();
      if (S.running) {
        // 从头跑才看得出学习过程
        if (S.t > 0 && S.algo !== 'optimistic') { /* 保留进度，接着跑 */ }
        kick();
      }
    };

    // 手动模式重置 = 换一副新题（否则就是照答案重抄一遍）；
    // 自动模式重置 = 同一副题从头跑，方便对比不同策略
    btnReset.onclick = function () {
      reset(true, S.mode === 'manual');
      drawArms();
      drawCurve();
    };

    btnAgain.onclick = function () {
      reset(true, true);
      drawArms();
      drawCurve();
    };

    setMode(initMode);
    drawArms();
    drawCurve();

    redraws.push(function () {
      P = palette();
      drawArms();
      drawCurve();
    });

    // 训练中如果切了主题，颜色要跟着变
    window.addEventListener('resize', function () {
      drawArms();
      drawCurve();
    });
  }

  /* =======================================================================
     注册与启动
     ======================================================================= */

  function register(id, fn) {
    labs[id] = fn;
  }

  function ensureCss() {
    if (document.querySelector('link[data-rl-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS_HREF;
    l.setAttribute('data-rl-css', '1');
    document.head.appendChild(l);
  }

  function boot() {
    var nodes = document.querySelectorAll('.rl-lab[data-lab]');
    if (!nodes.length) return;
    ensureCss();

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var id = n.getAttribute('data-lab');
      if (n.getAttribute('data-rl-ready') === '1') continue;
      if (!labs[id]) continue;
      n.setAttribute('data-rl-ready', '1');
      try {
        labs[id](n);
      } catch (e) {
        n.textContent = '实验加载失败：' + (e && e.message ? e.message : e);
      }
    }

    // 主题（换皮肤 / 明暗）切换 → 重画所有画布
    var obs = new MutationObserver(function () {
      for (var k = 0; k < redraws.length; k++) {
        try { redraws[k](); } catch (e) {}
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ui', 'data-user-color-scheme']
    });
  }

  window.LY_RL = { register: register, boot: boot };
  register('bandit', mountBandit);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
