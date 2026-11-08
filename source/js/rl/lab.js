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

  /* ---------------- 横向对比用的离线模拟 ----------------
   * 三种策略在同一副真实均值上各跑 REPEAT 次取平均。
   * 用独立的随机源：借用面板那份 rand 会打乱读者正在跑的这局。
   * 后悔值按期望算（μ* − μ_a），不含单次奖励噪声——否则同一策略
   * 跑两次能差出一倍，比较表看起来像在掷骰子。 */
  function argmaxOf(q, rd) {
    var m = -Infinity, cand = [];
    for (var i = 0; i < q.length; i++) {
      if (q[i] > m + 1e-12) { m = q[i]; cand = [i]; }
      else if (Math.abs(q[i] - m) <= 1e-12) { cand.push(i); }
    }
    return cand[Math.floor(rd() * cand.length)];
  }

  function simulatePolicy(kind, mu, steps, opt, seed) {
    var rd = rng(seed);
    var gs = gaussFactory(rd);
    var k = mu.length;
    var best = 0;
    for (var i = 1; i < k; i++) if (mu[i] > mu[best]) best = i;

    var q = [], n = [];
    for (i = 0; i < k; i++) {
      q[i] = (kind === 'optimistic') ? OPTIMISTIC_Q0 : 0;
      n[i] = 0;
    }

    var regret = 0, win = [], winSum = 0;

    for (var t = 1; t <= steps; t++) {
      var a;
      if (kind === 'ucb') {
        var bestA = -1, bestV = -Infinity, untried = -1;
        for (i = 0; i < k; i++) {
          if (n[i] === 0) { untried = i; break; }
          var v = q[i] + opt.c * Math.sqrt(Math.log(t + 1) / n[i]);
          if (v > bestV) { bestV = v; bestA = i; }
        }
        a = untried >= 0 ? untried : bestA;
      } else if (kind === 'optimistic') {
        a = argmaxOf(q, rd);
      } else {
        a = (rd() < opt.eps) ? Math.floor(rd() * k) : argmaxOf(q, rd);
      }

      var r = mu[a] + gs();
      n[a] += 1;
      q[a] = q[a] + (r - q[a]) / n[a];
      regret += mu[best] - mu[a];

      var hit = (a === best) ? 1 : 0;
      win.push(hit);
      winSum += hit;
      if (win.length > WIN) winSum -= win.shift();
    }

    return {
      pick: argmaxOf(q, rd),
      hit: win.length ? winSum / win.length : 0,
      regret: regret
    };
  }

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
      compareBox.style.display = 'none';
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

    // 三种策略的横向对比：只在自动模式结算后出现。
    // 单跑一种只能得到一个数，看不出差在哪；并排才看得出
    // 「探索的钱花去了哪里」这件事上的区别。
    var compareBox = el('div', 'rl-compare');
    compareBox.style.display = 'none';

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
    root.appendChild(compareBox);
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

      hint.textContent = '跑满了。第一块是这次训练的成绩单，第二块是三种策略在同一副牌上的对比。';

      btnAgain.textContent = '换一副牌重跑';
      // 插到对比表之前，而不是 controls 之前：后者会越过对比表，
      // 把成绩单排到比较表下面去。
      root.insertBefore(resultBox, compareBox);
      // 成绩单只判这一种策略；横向比一比才知道差在哪
      renderCompare();
      compareBox.style.display = '';
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

    /* ---------------- 三种策略的横向对比 ---------------- */
    // 成绩单判的是「当前这一种」跑得怎么样，回答不了「换个策略会不会更好」。
    // 同一副真实均值上各跑 REPEAT 次取平均，才比得出探索方式的差别。
    // 30 次不够：乐观初值锁错一次就多出五百点后悔，30 次里锁错次数
    // 抖 ±3 就足以让排名翻面。100 次才把这张表的结论压稳。
    var REPEAT = 100;

    // 第 i 次重复时，三种策略共用同一段随机流（公共随机数）。
    // 这样比较的是策略差异，而不是三份独立运气；否则光是噪声
    // 就能让排名在两个方向之间来回跳。种子按大素数错开，
    // 避免线性同余的相邻种子产生相似序列。
    var SIM_SEED = 991;
    var SEED_STEP = 7919;

    function renderCompare() {
      var defs = [
        { id: 'egreedy', name: 'ε-greedy', note: 'ε = ' + f2(S.eps) },
        { id: 'optimistic', name: '乐观初值', note: 'Q₀ = 5' },
        { id: 'ucb', name: 'UCB', note: 'c = ' + f2(S.c) }
      ];

      defs.forEach(function (d) {
        var known = 0, hit = 0, reg = 0;
        for (var i = 0; i < REPEAT; i++) {
          var o = simulatePolicy(d.id, MU, AUTO_STEPS,
            { eps: S.eps, c: S.c }, SIM_SEED + i * SEED_STEP);
          if (o.pick === BEST) known++;
          hit += o.hit;
          reg += o.regret;
        }
        d.known = known;
        d.hit = hit / REPEAT;
        d.regret = reg / REPEAT;
      });

      var sorted = defs.slice().sort(function (a, b) { return a.regret - b.regret; });
      var bestD = sorted[0];

      // 推荐谁：先看「认对的次数」，再看押中率。平均后悔值不能当唯一判据，
      // 它会把偶尔锁死的灾难摊薄成一个不难看的数。
      var rec = defs.slice().sort(function (a, b) {
        if (b.known !== a.known) return b.known - a.known;
        return b.hit - a.hit;
      })[0];

      compareBox.innerHTML = '';
      compareBox.appendChild(el('div', 'rl-compare-hd',
        '同一副牌，三种策略各跑 ' + REPEAT + ' 次'));
      compareBox.appendChild(el('div', 'rl-compare-sub',
        '每次 ' + AUTO_STEPS + ' 步，取平均。后悔值越低越好。'));

      var tb = el('table', 'rl-compare-tb');
      var thead = el('thead');
      var trh = el('tr');
      ['策略', '认出最优', '近期押中率', '后悔值'].forEach(function (h) {
        trh.appendChild(el('th', null, h));
      });
      thead.appendChild(trh);
      tb.appendChild(thead);

      var tbody = el('tbody');
      defs.forEach(function (d) {
        var tr = el('tr');
        if (d === rec) tr.className = 'win';
        var td0 = el('td');
        td0.appendChild(el('b', null, d.name));
        td0.appendChild(el('span', 'sub', d.note));
        tr.appendChild(td0);
        tr.appendChild(el('td', null, d.known + ' / ' + REPEAT));
        tr.appendChild(el('td', null, Math.round(d.hit * 100) + '%'));
        tr.appendChild(el('td', null, f2(d.regret)));
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      compareBox.appendChild(tb);

      var p = el('p', 'rl-compare-note');
      var txt = '如果只能选一个，选 <b>' + rec.name + '</b>：' + REPEAT + ' 次里认对 ' +
        rec.known + ' 次，押中率 ' + Math.round(rec.hit * 100) + '%。';

      if (bestD === rec) {
        txt += '它的平均后悔值也是三者中最低的（' + f2(bestD.regret) + '）。';
      } else if (bestD.known < REPEAT) {
        txt += '平均后悔值最低的是 <b>' + bestD.name + '</b>（' + f2(bestD.regret) +
          '），但它有 ' + (REPEAT - bestD.known) + ' 次锁死在错的臂上，之后几百步全压在那里——' +
          '平均分好看，是因为失败被摊薄了。';
      } else {
        txt += '平均后悔值最低的是 <b>' + bestD.name + '</b>（' + f2(bestD.regret) + '）。';
      }

      txt += '三者的差别不在谁更聪明，而在探索的钱花到了哪里：' +
        'UCB 只往不确定的地方试，ε-greedy 按固定比例乱试，乐观初值每个臂只试一次就再不回头。' +
        '<span class="d">这是十臂、奖励平稳、八百步的成绩。臂数变多或奖励会漂移时排序会变——' +
        '乐观初值每臂只有一次观测，最先掉队。</span>';
      p.innerHTML = txt;
      compareBox.appendChild(p);
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
    // 线上由 custom_css 全站注入，这里只是兜底：已经引过就不再插第二个
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href && links[i].href.indexOf(CSS_HREF) >= 0) return;
    }
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

  /* =======================================================================
     实验二：网格世界 —— 状态里到底该放什么
     -----------------------------------------------------------------------
     同一张地图、同一套 Q-learning、同样的回合数，只改一件事：
     状态编码里含不含钥匙。
     含：一百次全部走到终点。不含：一次也走不到。
     差别只来自一处「别名状态」——站在门口时，带没带钥匙是两件事，
     坐标却只有一个。把两件事压成一个状态，任何算法都救不回来。
     ======================================================================= */

  var G_MAP = [
    '....###',   // y = 4
    '....#G#',   // y = 3
    '....D.#',   // y = 2
    '....###',   // y = 1
    'S..K...'    // y = 0
  ];
  var G_W = 7;
  var G_H = 5;
  var G_DIR = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // 上 下 右 左
  var G_START = { x: 0, y: 0 };
  var G_EPISODE = 300;
  var G_MAXSTEP = 80;
  var G_ROLLOUT = 40;         // 训练后走一局，最多记 40 步
  var G_BATCH = 20;           // 一次统计里训几遍（不同种子）
  var G_GAMMA = 0.95;
  var G_ALPHA = 0.15;
  var G_SEED = 20261107;      // 固定种子：文章里写的数字，和面板上跑出来的一致

  function gCell(x, y) {
    if (x < 0 || y < 0 || x >= G_W || y >= G_H) return '#';
    return G_MAP[G_H - 1 - y].charAt(x);
  }

  /* 训练时每一步都去 charAt 一次会慢到点一次按钮卡三秒，
     所以开局把地图摊平成整数表，之后只做整数运算。 */
  var G_TILE = (function () {
    var code = { '.': 0, '#': 1, 'D': 2, 'K': 3, 'G': 4 };
    var a = new Uint8Array(G_W * G_H);
    for (var y = 0; y < G_H; y++) {
      for (var x = 0; x < G_W; x++) {
        a[y * G_W + x] = code[G_MAP[G_H - 1 - y].charAt(x)] || 0;
      }
    }
    return a;
  })();

  function gStep(s, a, noKey) {
    var nx = s.x + G_DIR[a][0], ny = s.y + G_DIR[a][1];
    var c = gCell(nx, ny);
    var t = { x: s.x, y: s.y, key: s.key };
    if (c === '#') return { s2: t, r: -3, done: 0, kind: 'wall' };
    if (c === 'D' && !s.key) return { s2: t, r: -6, done: 0, kind: 'door' };
    t.x = nx; t.y = ny;
    if (c === 'K' && !noKey) t.key = 1;
    if (c === 'G') return { s2: t, r: 50, done: 1, kind: 'goal' };
    return { s2: t, r: -1, done: 0, kind: '' };
  }

  // 状态编码。naive 只记坐标，strict 才把钥匙算进去。
  function gCode(s, naive) {
    return naive ? s.x + ',' + s.y : s.x + ',' + s.y + ',' + s.key;
  }

  /* Q 存成定长数组，下标 = ((y*W + x)*2 + key)*4 + 动作。
     naive 只占 key=0 那一半，容量差一倍，正好对应「状态数 25 vs 44」。 */
  function gSlot(x, y, key, naive) {
    return ((y * G_W + x) * 2 + (naive ? 0 : key)) * 4;
  }

  var G_NCELL = G_W * G_H * 2;          // 状态槽数（含带钥匙 / 不带钥匙）

  function gTrain(naive, seed) {
    var rand = rng(seed || G_SEED);   // 两种定义共用一段随机流，比较的才是编码本身
    var Q = new Float64Array(G_NCELL * 4);
    var visited = new Uint8Array(G_NCELL);
    // 每个「状态—动作」只记第一次见到的结果；见到第二种就记一笔歧义
    var seenSig = new Int32Array(G_NCELL * 4).fill(-1);
    var MARK = 0x7fffffff;
    var clashN = 0;

    for (var ep = 0; ep < G_EPISODE; ep++) {
      var eps = 0.30 + (0.05 - 0.30) * ep / (G_EPISODE - 1);
      var x = G_START.x, y = G_START.y, key = 0;
      for (var t = 0; t < G_MAXSTEP; t++) {
        var base = gSlot(x, y, key, naive);
        var cellIdx = base >> 2;
        visited[cellIdx] = 1;

        // 两条随机数：一条决定探不探索，一条决定选哪个动作——和旧版一格不差
        var a;
        if (rand() < eps) {
          a = (rand() * 4) | 0;
        } else {
          var best = Q[base];
          for (var i = 1; i < 4; i++) if (Q[base + i] > best) best = Q[base + i];
          var ties = 0;
          for (var j = 0; j < 4; j++) if (Math.abs(Q[base + j] - best) <= 1e-9) ties++;
          var pick = (rand() * ties) | 0, seenTie = 0;
          a = 0;
          for (var k2 = 0; k2 < 4; k2++) {
            if (Math.abs(Q[base + k2] - best) <= 1e-9) {
              if (seenTie === pick) { a = k2; break; }
              seenTie++;
            }
          }
        }

        // 一步转移（与 gStep 等价，只是为了快，不建对象）
        var nx = x + G_DIR[a][0], ny = y + G_DIR[a][1];
        var tile = (nx < 0 || ny < 0 || nx >= G_W || ny >= G_H) ? 1 : G_TILE[ny * G_W + nx];
        var r, done = 0, sx = x, sy = y;
        if (tile === 1) {
          r = -3;                                   // 撞墙，原地不动
        } else if (tile === 2 && !key) {
          r = -6;                                   // 没钥匙撞门，原地不动
        } else {
          x = nx; y = ny; sx = nx; sy = ny;
          if (tile === 3) key = 1;                  // 捡钥匙
          if (tile === 4) { r = 50; done = 1; }
          else r = -1;
        }

        // 歧义检测：同一个状态、同一个动作，出现了两种不同的结果
        var sig = (sy * G_W + sx) * 5 + (r === -3 ? 0 : r === -6 ? 1 : r === -1 ? 2 : 3);
        var ck = base + a, prev = seenSig[ck];
        if (prev < 0) {
          seenSig[ck] = sig;
        } else if (prev !== sig && prev !== MARK) {
          clashN++;
          seenSig[ck] = MARK;                       // 同一处只记一次
        }

        var nb = gSlot(x, y, key, naive);
        var mx = Q[nb];
        for (var q = 1; q < 4; q++) if (Q[nb + q] > mx) mx = Q[nb + q];
        var tgt = done ? r : r + G_GAMMA * mx;
        Q[ck] += G_ALPHA * (tgt - Q[ck]);

        if (done) break;
      }
    }

    /* 训练完关掉探索，用学到的策略从起点走一局。
       走法一定，结果就一定——同一个种子跑一百遍是一模一样的，
       所以「成功率」不该按一百局算：要数的是「换成不同种子，几次能走通」。 */
    var trace = [{ x: G_START.x, y: G_START.y }];
    var ts = { x: G_START.x, y: G_START.y, key: 0 };
    var reached = false;
    for (var t3 = 0; t3 < G_ROLLOUT; t3++) {
      var gb = gSlot(ts.x, ts.y, ts.key, naive);
      var ba = 0, bm = Q[gb];
      for (var g2 = 1; g2 < 4; g2++) if (Q[gb + g2] > bm + 1e-9) { bm = Q[gb + g2]; ba = g2; }
      var r3 = gStep(ts, ba, false);
      ts = r3.s2;
      trace.push({ x: ts.x, y: ts.y });
      if (r3.done) { reached = true; break; }
    }

    var nStates = 0;
    for (var v = 0; v < G_NCELL; v++) if (visited[v]) nStates++;

    return {
      naive: naive,
      states: nStates,
      clash: clashN,
      won: reached,
      len: reached ? trace.length - 1 : 0,
      trace: trace,
      reached: reached
    };
  }

  /* 一次训练看不出名堂：同一个算法换个种子，结果可能翻面。
     所以按「一批种子」统计——数这批里有几次能走通，
     再挑一条没走通的轨迹画到地图上。 */
  function gBatch(naive, seeds) {
    var won = 0, stepSum = 0, fails = 0, states = 0, clash = 0;
    var failTrace = null, okTrace = null, failSeed = 0;
    for (var i = 0; i < seeds.length; i++) {
      var m = gTrain(naive, seeds[i]);
      states = m.states;
      clash = m.clash;
      if (m.reached) {
        won++;
        stepSum += m.len;
        if (!okTrace) okTrace = m.trace;
      } else {
        fails++;
        if (!failTrace) { failTrace = m.trace; failSeed = i + 1; }
      }
    }
    return {
      won: won,
      of: seeds.length,
      fails: fails,
      failSeed: failSeed,
      len: won ? stepSum / won : 0,
      states: states,
      clash: clash,
      // 地图优先画「没走通」的那一条：打转的样子比走通更有信息量
      trace: failTrace || okTrace,
      reached: !failTrace
    };
  }

  // 演示轨迹：一条拿到钥匙，一条没有。两条前七步完全相同。
  var G_PATH_KEY = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [4, 2], [5, 2], [5, 3]];
  var G_PATH_NOKEY = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [4, 2]];

  function mountGrid(root) {
    var P = palette();
    var GOLD = cssVar('--rl-gold', '#b8862b');
    var WARN = cssVar('--rl-warn', '#c0533f');
    var DOOR = cssVar('--rl-door', '#6f63a8');

    var S = { naive: true };
    var M = null;                     // 训练过一次之后才有
    var batchNo = 0;

    root.innerHTML = '';

    var hd = el('div', 'rl-head');
    hd.appendChild(el('b', null, '网格世界 · 同一个世界，两种记法'));
    hd.appendChild(el('span', null, '只改一件事：状态里写不写「有没有钥匙」'));
    root.appendChild(hd);

    /* 控件放在地图上面：点完按钮，眼睛往下就是地图，
       不用为了看结果把页面滚走，也不会把刚看过的地方弄丢。 */
    var ctrl = el('div', 'rl-controls');

    var fld = el('div', 'rl-field wide');
    fld.appendChild(el('label', null, '状态里含钥匙吗'));
    var tabs = el('div', 'rl-tabs');
    var tabNaive = el('button', 'rl-tab on', '只有坐标');
    var tabFull = el('button', 'rl-tab', '坐标 + 钥匙');
    tabNaive.type = 'button';
    tabFull.type = 'button';
    tabs.appendChild(tabNaive);
    tabs.appendChild(tabFull);
    fld.appendChild(tabs);
    ctrl.appendChild(fld);

    var btns = el('div', 'rl-btns one');
    var btnRun = el('button', 'rl-btn primary', '训练 ' + G_BATCH + ' 次');
    btnRun.type = 'button';
    btns.appendChild(btnRun);
    ctrl.appendChild(btns);

    root.appendChild(ctrl);

    var stage = el('div', 'rl-stage');
    var cv = el('canvas', 'rl-canvas');
    stage.appendChild(cv);
    root.appendChild(stage);

    var legend = el('p', 'rl-hint');
    legend.innerHTML =
      '<span style="color:' + GOLD + '">━ 拿到钥匙的路线</span>　' +
      '<span style="color:' + P.faint + '">┅ 没拿到钥匙时走的路</span>　' +
      '<span style="color:' + WARN + '">✕ 过不去</span>';
    root.appendChild(legend);

    var readout = el('p', 'rl-readout');
    root.appendChild(readout);

    var hint = el('p', 'rl-hint');
    root.appendChild(hint);

    var resultBox = el('div', 'rl-result');
    resultBox.style.display = 'none';
    root.appendChild(resultBox);

    /* ---------------- 画布 ---------------- */

    function geo(w, h) {
      var cw = Math.min((w - 34) / G_W, 54);
      return {
        cw: cw,
        ox: (w - cw * G_W) / 2,
        oy: (h - cw * G_H) / 2
      };
    }

    function draw() {
      var g0 = fit(cv, G_H * 54 + 26);
      var ctx = g0.ctx, w = g0.w, h = g0.h;
      var G = geo(w, h);
      var cw = G.cw, ox = G.ox, oy = G.oy;

      function CX(x) { return ox + (x + 0.5) * cw; }
      function CY(y) { return oy + (G_H - 1 - y + 0.5) * cw; }

      // 格心一支箭头，a 用 G_DIR 的下标（0 上 1 下 2 右 3 左）。
      // 字母已经挪到格子左上角，这里可以占满中心
      function arrowCell(x, y, a, color) {
        var X = CX(x), Y = CY(y);
        var vx = G_DIR[a][0], vy = -G_DIR[a][1];   // 画布 y 朝下
        var L = cw * 0.26;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X - vx * L * 0.62, Y - vy * L * 0.62);
        ctx.lineTo(X + vx * L * 0.2, Y + vy * L * 0.2);
        ctx.stroke();
        var tipX = X + vx * L * 0.52, tipY = Y + vy * L * 0.52;
        var px = -vy, py = vx;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - vx * 4.2 + px * 3.2, tipY - vy * 4.2 + py * 3.2);
        ctx.lineTo(tipX - vx * 4.2 - px * 3.2, tipY - vy * 4.2 - py * 3.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 底格
      for (var y = 0; y < G_H; y++) {
        for (var x = 0; x < G_W; x++) {
          var c = gCell(x, y);
          var px = ox + x * cw, py = oy + (G_H - 1 - y) * cw;
          ctx.fillStyle = (c === '#') ? 'rgba(128,128,128,0.13)' : 'transparent';
          ctx.fillRect(px, py, cw, cw);

          if (c === '#') {
            // 墙：细斜纹，和地面区分开，又不至于压过路线
            ctx.save();
            ctx.beginPath();
            ctx.rect(px, py, cw, cw);
            ctx.clip();
            ctx.strokeStyle = P.edge;
            ctx.lineWidth = 1;
            for (var k = -cw; k < cw * 2; k += 7) {
              ctx.beginPath();
              ctx.moveTo(px + k, py);
              ctx.lineTo(px + k + cw, py + cw);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      }

      // 网格线
      ctx.strokeStyle = P.edge;
      ctx.lineWidth = 1;
      for (var i = 0; i <= G_W; i++) {
        ctx.beginPath();
        ctx.moveTo(ox + i * cw, oy);
        ctx.lineTo(ox + i * cw, oy + G_H * cw);
        ctx.stroke();
      }
      for (var j = 0; j <= G_H; j++) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + j * cw);
        ctx.lineTo(ox + G_W * cw, oy + j * cw);
        ctx.stroke();
      }

      // 两条路线：没钥匙的在下层（虚线），拿钥匙的在上层（实线）
      function poly(pts, color, dash, off) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (var n = 0; n < pts.length; n++) {
          var X = CX(pts[n][0]) + off;
          var Y = CY(pts[n][1]) + off;
          if (n) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 训练前画「两条理想路线」当铺垫；训练后换成学到的走法，两者只在图上占同一块地方
      var model = null;
      if (M) model = S.naive ? M.naive : M.full;

      if (!model) {
        poly(G_PATH_NOKEY, P.faint, [4, 3], -3.4);
        poly(G_PATH_KEY, GOLD, null, 3.4);
      } else {
        // 每个走过的格子画一支箭头，指向学到的那一步。
        // 打转的地方会留下两支相对的箭头——这正是「学不会」的样子。
        var seenStep = {};
        for (var q = 0; q + 1 < model.trace.length; q++) {
          var p0 = model.trace[q], p1 = model.trace[q + 1];
          var sk = p0.x + ',' + p0.y;
          if (seenStep[sk]) continue;
          seenStep[sk] = 1;
          var ddx = p1.x - p0.x, ddy = p1.y - p0.y;
          var ai = ddy > 0 ? 0 : (ddy < 0 ? 1 : (ddx > 0 ? 2 : 3));
          arrowCell(p0.x, p0.y, ai, model.reached ? GOLD : WARN);
        }
        // 没走到终点：最后一格上打叉，说明这一局就停在这里
        if (!model.reached) {
          var lp = model.trace[model.trace.length - 1];
          var lx = CX(lp.x), ly = CY(lp.y);
          ctx.save();
          ctx.strokeStyle = WARN;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(lx - 5, ly - 5); ctx.lineTo(lx + 5, ly + 5);
          ctx.moveTo(lx + 5, ly - 5); ctx.lineTo(lx - 5, ly + 5);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 终点
      var gx = CX(5), gy = CY(3);
      ctx.save();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(gx, gy, cw * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 门：两条路线在这里分岔，正是全图的病灶
      var dx = CX(4), dy = CY(2);
      ctx.save();
      ctx.fillStyle = DOOR;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(dx - cw / 2 + 1, dy - cw / 2 + 1, cw - 2, cw - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = DOOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dx - cw * 0.1, dy - cw / 2 + 3);
      ctx.lineTo(dx - cw * 0.1, dy + cw / 2 - 3);
      ctx.stroke();
      ctx.restore();

      // 没钥匙时撞门：门右侧画叉
      var mx = CX(4) + cw * 0.42, my = CY(2);
      ctx.save();
      ctx.strokeStyle = WARN;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(mx - 4, my - 4); ctx.lineTo(mx + 4, my + 4);
      ctx.moveTo(mx + 4, my - 4); ctx.lineTo(mx - 4, my + 4);
      ctx.stroke();
      ctx.restore();

      // 起点、钥匙、终点字母：放在格子左上角，把格心让给箭头
      var lx0 = cw * 0.3, ly0 = cw * 0.26;
      label(ctx, 'S', CX(0) - lx0, CY(0) - ly0, P.ink, 12, 'center');
      label(ctx, 'K', CX(3) - lx0, CY(0) - ly0, GOLD, 12, 'center');
      label(ctx, 'G', CX(5) - lx0, CY(3) - ly0, GOLD, 12, 'center');

      // 门格上的两种画法：一个状态，还是两个
      if (S.naive) {
        ctx.save();
        ctx.strokeStyle = WARN;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(dx - cw / 2 + 1, dy - cw / 2 + 1, cw - 2, cw - 2);
        ctx.restore();
        // 一个格子只能存一个值，这里画 1 表示「一种状态」；
        // 门格上永远不会有箭头（它进不去），所以这个数字不会被箭头压住
        label(ctx, '1', dx, dy, WARN, 13, 'center');
      } else if (!model) {
        ctx.save();
        ctx.strokeStyle = DOOR;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(dx - cw / 2 + 5, dy);
        ctx.lineTo(dx + cw / 2 - 5, dy);
        ctx.stroke();
        ctx.restore();
        // 拆成两个：上 0 下 1，对应有没有钥匙
        label(ctx, '0', dx, dy - cw * 0.24, DOOR, 11, 'center');
        label(ctx, '1', dx, dy + cw * 0.24, DOOR, 11, 'center');
      }
    }

    /* ---------------- 读数、结论与对比表 ---------------- */

    // 没走到终点时，找出它在哪两格之间反复横跳
    function stuckPair(trace) {
      var cnt = {}, best = '', bn = 0;
      for (var i = 1; i < trace.length; i++) {
        var a = trace[i - 1], b = trace[i];
        var k = a.x + ',' + a.y + '|' + b.x + ',' + b.y;
        cnt[k] = (cnt[k] || 0) + 1;
        if (cnt[k] > bn) { bn = cnt[k]; best = k; }
      }
      if (!best) return null;
      var p = best.split('|');
      return { a: p[0], b: p[1], n: bn };
    }

    function syncLegend() {
      legend.innerHTML = M
        ? '<span style="color:' + GOLD + '">→ 学到的一步</span>　' +
          '<span style="color:' + WARN + '">✕ 停在这里</span>　' +
          '<span style="color:' + P.faint + '">箭头从 S 出发，指向它学到的那一步</span>'
        : '<span style="color:' + GOLD + '">━ 拿到钥匙的路线</span>　' +
          '<span style="color:' + P.faint + '">┅ 没拿到钥匙时走的路</span>　' +
          '<span style="color:' + WARN + '">✕ 过不去</span>';
    }

    function renderReadout() {
      if (!M) {
        readout.innerHTML = '还没训练。上面两个标签只改状态的写法，' +
          '点按钮 = 两种写法各训 ' + G_BATCH + ' 次，看几次能走到终点。';
        return;
      }
      var m = S.naive ? M.naive : M.full;
      var sp = m.reached ? null : stuckPair(m.trace);
      var head = m.won === m.of
        ? G_BATCH + ' 次全部走通'
        : G_BATCH + ' 次里 <b>' + m.won + '</b> 次走通';
      readout.innerHTML = head + '。地图上画的是' +
        (m.reached ? '其中一次' : '第 ' + m.failSeed + ' 次（没走通）') +
        '的走法' +
        (sp ? '：在 (' + sp.a + ') 与 (' + sp.b + ') 之间来回' : '') +
        '。共 ' + m.states + ' 个状态' +
        (m.clash
          ? '，其中 <b style="color:' + WARN + '">' + m.clash + ' 处</b>同一个状态对应两种结果'
          : '，没有一处歧义');
    }

    function renderResult() {
      resultBox.innerHTML = '';

      // 先给结论，再给表格。表格是细节，读者不该被迫自己比对
      var vd = el('div', 'rl-verdict');
      vd.appendChild(el('div', 'rl-verdict-hd', '这一批的结果'));

      function addRow(d) {
        var all = d.m.won === d.m.of;
        var r = el('div', 'rl-verdict-row ' + (all ? 'good' : 'bad'));

        var nm = el('div', 'v-name');
        nm.appendChild(el('b', null, d.name));
        nm.appendChild(el('span', 'sub', d.note));
        r.appendChild(nm);

        var rt = el('div', 'v-rate');
        rt.innerHTML = '<b>' + d.m.won + '</b>/' + d.m.of + ' 次走通';
        r.appendChild(rt);

        var why = el('div', 'v-why');
        if (all) {
          why.textContent = '每次都走通，平均 ' + f2(d.m.len) + ' 步';
        } else if (d.m.won === 0) {
          var sp = stuckPair(d.m.trace);
          why.textContent = sp
            ? '一次都没走通，全卡在 (' + sp.a + ') 与 (' + sp.b + ') 之间打转'
            : G_ROLLOUT + ' 步也走不到终点';
        } else {
          var sp2 = stuckPair(d.m.trace);
          why.textContent = '另外 ' + d.m.fails + ' 次没走通' +
            (sp2 ? '，图上这一次卡在 (' + sp2.a + ') 与 (' + sp2.b + ') 之间' : '');
        }
        r.appendChild(why);
        return r;
      }

      vd.appendChild(addRow({ m: M.naive, name: '只有坐标', note: '(x, y)' }));
      vd.appendChild(addRow({ m: M.full, name: '坐标 + 钥匙', note: '(x, y, key)' }));
      resultBox.appendChild(vd);

      var tb = el('table', 'rl-compare-tb');
      var thead = el('thead');
      var trh = el('tr');
      ['状态定义', '状态数', '歧义处', G_BATCH + ' 次走通', '走通时步数'].forEach(function (t) {
        trh.appendChild(el('th', null, t));
      });
      thead.appendChild(trh);
      tb.appendChild(thead);

      var body = el('tbody');
      [
        { m: M.naive, name: '只有坐标', note: '(x, y)', on: S.naive },
        { m: M.full, name: '坐标 + 钥匙', note: '(x, y, key)', on: !S.naive }
      ].forEach(function (d) {
        var tr = el('tr');
        if (d.on) tr.className = 'win';
        var td0 = el('td');
        td0.appendChild(el('b', null, d.name));
        td0.appendChild(el('span', 'sub', d.note));
        tr.appendChild(td0);
        tr.appendChild(el('td', null, String(d.m.states)));
        tr.appendChild(el('td', null, String(d.m.clash)));
        tr.appendChild(el('td', null, d.m.won + '/' + d.m.of));
        tr.appendChild(el('td', null, d.m.len ? f2(d.m.len) : '—'));
        body.appendChild(tr);
      });
      tb.appendChild(body);
      resultBox.appendChild(tb);

      var note = el('p', 'rl-compare-note');
      note.innerHTML = '两行的算法、奖励、回合数、每轮的随机种子完全相同，' +
        '唯一的差别是下面一行把钥匙写进了状态。' +
        '<span class="d">「走通」= 训练结束后关掉探索，从起点按学到的策略走一局。' +
        '一局只有一个结果，所以数的是「' + G_BATCH + ' 次里几次」，不是「一百局里几局」。</span>';
      resultBox.appendChild(note);
    }

    function syncHint() {
      hint.innerHTML = S.naive
        ? '门只有一格，红框里那个 1 就是它的全部身份。带没带钥匙被压进同一个状态，' +
          '于是「在门口往右」这一个动作对应两种结果——算法只能看到两者的平均值。'
        : '把钥匙写进状态，门口那一格被一条线分成上下两半：0 是没钥匙，1 是有钥匙。' +
          '同一动作只剩一种结果，这个数才有意义。';
    }

    function sync() {
      tabNaive.classList.toggle('on', S.naive);
      tabFull.classList.toggle('on', !S.naive);
      syncLegend();
      renderReadout();
      syncHint();
      draw();
      if (M) renderResult();
    }

    tabNaive.onclick = function () { S.naive = true; sync(); };
    tabFull.onclick = function () { S.naive = false; sync(); };

    // 文章里的数字来自第一批种子；之后每批接着往后走，用来验证结论不是碰巧
    var nextSeed = G_SEED;
    function nextSeeds() {
      var out = [];
      for (var i = 0; i < G_BATCH; i++) {
        out.push(nextSeed);
        nextSeed = (nextSeed * 7919) % 2147483647;
      }
      return out;
    }

    function runBatch() {
      var seeds = nextSeeds();
      M = { naive: gBatch(true, seeds), full: gBatch(false, seeds) };
      btnRun.disabled = false;
      btnRun.textContent = '换一批种子再训';
      resultBox.style.display = '';
      resultBox.classList.remove('rl-fresh');
      void resultBox.offsetWidth;          // 重启动画，第二次点也有淡入
      resultBox.classList.add('rl-fresh');
      sync();
    }

    btnRun.onclick = function () {
      if (btnRun.disabled) return;
      // 先让浏览器把「训练中」画出来再开算：这批要跑几百万步
      btnRun.disabled = true;
      btnRun.textContent = '训练中…';
      setTimeout(runBatch, 30);
    };

    // 测试和自动化脚本可以同步跑完，不必等那 30 毫秒
    root._runBatch = runBatch;

    redraws.push(draw);
    sync();
  }

  window.LY_RL = { register: register, boot: boot };
  register('bandit', mountBandit);
  register('grid', mountGrid);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
