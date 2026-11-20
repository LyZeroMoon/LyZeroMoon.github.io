/*!
 * 圣诞皮肤的两处动态效果
 * ---------------------------------------------------------------------------
 * 只在 <html data-ui="xmas"> 时启动，其它皮肤下一个字节都不执行。
 *   1. 飘雪层：10 片六角晶体（大、慢、自转）+ 28 颗雪粒，纯 DOM + CSS 动画
 *   2. 鼠标雪尘：指针走过扬起细雪，带重力下落，越走越散（canvas 单层）
 *
 * 三条约束：
 *   - prefers-reduced-motion: reduce → 整段直接 return，页面完全静止
 *   - 触屏（pointer: coarse）不挂拖尾：手划过去留一路雪，只会脏屏幕
 *   - 拖尾粒子封顶 180，用离屏贴图 drawImage 代替每帧 createRadialGradient，
 *     否则长页面滚起来会有明显的掉帧
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  var root = document.documentElement;
  if (root.getAttribute('data-ui') !== 'xmas') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ==========================================================================
     一、飘雪
     ========================================================================== */

  var FLAKE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#e8f3ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 1.8V22.2M3.2 6.9l17.6 10.2M20.8 6.9L3.2 17.1"/>' +
    '<path d="M12 6.2L9.4 3.6M12 6.2l2.6-2.6M12 17.8l-2.6 2.6M12 17.8l2.6 2.6"/>' +
    '<path d="M6.4 8.8L5.25 10.8M6.4 8.8L7.55 6.8M17.6 8.8l1.15 2M17.6 8.8L16.45 6.8"/>' +
    '<path d="M6.4 15.2l-1.15-2M6.4 15.2l1.15 2M17.6 15.2l1.15-2M17.6 15.2l-1.15 2"/>' +
    '</svg>';

  function rnd(a, b) {
    return Math.random() * (b - a) + a;
  }

  function makeSnow() {
    var box = document.createElement('div');
    box.className = 'ly-snow';
    box.setAttribute('aria-hidden', 'true');

    var url = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FLAKE_SVG) + '")';
    var i, fl, b, s;

    // 六角晶体：外层负责下落，内层负责自转（两个 transform 动画不能挤在一个元素上）
    for (i = 0; i < 10; i++) {
      fl = document.createElement('i');
      fl.className = 'flake';
      var sz = rnd(16, 30).toFixed(1);
      var du = rnd(20, 32).toFixed(1);
      fl.style.cssText =
        'width:' + sz + 'px;height:' + sz + 'px;' +
        'left:' + rnd(0, 95).toFixed(2) + '%;' +
        'animation-duration:' + du + 's;' +
        'animation-delay:-' + rnd(0, +du).toFixed(1) + 's;';
      fl.style.setProperty('--o', rnd(0.58, 0.9).toFixed(2));
      fl.style.setProperty('--dx', rnd(-30, 60).toFixed(0) + 'px');

      b = document.createElement('b');
      b.style.cssText =
        'background-image:' + url + ';' +
        'animation-duration:' + rnd(16, 32).toFixed(1) + 's;' +
        'animation-delay:-' + rnd(0, 16).toFixed(1) + 's;';
      fl.appendChild(b);
      box.appendChild(fl);
    }

    // 雪粒：近大远小
    for (i = 0; i < 28; i++) {
      s = document.createElement('i');
      var sz2 = rnd(3, 8.5).toFixed(1);
      var du2 = rnd(11, 26).toFixed(1);
      s.style.cssText =
        'width:' + sz2 + 'px;height:' + sz2 + 'px;' +
        'left:' + rnd(0, 97).toFixed(2) + '%;' +
        'animation-duration:' + du2 + 's;' +
        'animation-delay:-' + rnd(0, +du2).toFixed(1) + 's;';
      s.style.setProperty('--o', rnd(0.35, 0.8).toFixed(2));
      s.style.setProperty('--dx', rnd(-35, 35).toFixed(0) + 'px');
      if (Math.random() > 0.8) s.style.filter = 'blur(0.8px)';
      box.appendChild(s);
    }

    document.body.appendChild(box);
  }

  /* ==========================================================================
     二、鼠标雪尘
     ========================================================================== */

  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var MAX = 180;

  function makeTrail() {
    if (coarse) return;

    var cv = document.createElement('canvas');
    cv.className = 'ly-snowdust';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);

    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;

    /* 雪花贴图：一张 128px 的径向渐变，绘制时按粒子半径缩放。
       实测比每帧为每颗粒子新建 createRadialGradient 快 3 倍以上。 */
    var SPRITE = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var g = c.getContext('2d');
      var rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.22, 'rgba(226,240,255,0.34)');
      rg.addColorStop(0.55, 'rgba(200,225,250,0.09)');
      rg.addColorStop(1, 'rgba(180,215,250,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      return c;
    })();

    /* 六角晶体贴图：6 条主臂 + 每臂两对小分叉。
       用 canvas 路径画一次存成贴图，之后每帧只 drawImage + 旋转 ——
       比每帧重新 stroke 十几条线快得多。 */
    var FLAKE = (function () {
      var S = 96;
      var c = document.createElement('canvas');
      c.width = c.height = S;
      var g = c.getContext('2d');
      var arm = S * 0.44;

      g.translate(S / 2, S / 2);
      g.strokeStyle = 'rgba(236,247,255,0.96)';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = 'rgba(206,232,255,0.85)';
      g.shadowBlur = 6;

      for (var i = 0; i < 6; i++) {
        g.save();
        g.rotate(i * Math.PI / 3);

        g.lineWidth = 2.1;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -arm);
        g.stroke();

        // 主臂上的分叉，越靠外越短 —— 这是「六角晶体」和「六角星」的区别
        g.lineWidth = 1.5;
        for (var k = 1; k <= 2; k++) {
          var y = -arm * (k / 2.35);
          var len = arm * (0.3 - 0.08 * (k - 1));
          var ang = 0.62;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(Math.sin(ang) * len, y - Math.cos(ang) * len);
          g.moveTo(0, y);
          g.lineTo(-Math.sin(ang) * len, y - Math.cos(ang) * len);
          g.stroke();
        }
        g.restore();
      }

      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(0, 0, 1.8, 0, 6.2832);
      g.fill();

      return c;
    })();

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var ps = [];
    var px = 0, py = 0, hasPrev = false;

    // 约 9% 的粒子换成六角晶体，其余是雪粉
    var FLAKE_RATE = 0.09;

    function spawn(x, y, vx, vy) {
      if (ps.length >= MAX) return;
      // 不是每一步都落雪：连成一串实心白线就失去「雪」的颗粒感了
      if (Math.random() > 0.72) return;
      var isFlake = Math.random() < FLAKE_RATE;
      ps.push({
        x: x + rnd(-3, 3),
        y: y + rnd(-3, 3),
        vx: vx * 0.06 + rnd(-15, 15),
        vy: vy * 0.06 + rnd(-8, 18),
        // 雪粉：小的多、大的少（rand² 的作用）；晶体：明显更大
        r: isFlake ? rnd(6, 11) : 1 + Math.random() * Math.random() * 3.4,
        a: isFlake ? rnd(0.55, 0.85) : rnd(0.5, 0.9),
        flake: isFlake,
        rot: rnd(0, 6.2832),
        spin: rnd(-1.5, 1.5),
        life: 0,
        // 晶体落得更慢、活得更久，才看得出它在转
        max: isFlake ? rnd(1.5, 2.4) : rnd(0.6, 1.15)
      });
    }

    function feed(x, y, dx, dy) {
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.min(5, Math.max(1, Math.round(dist / 9)));
      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        spawn(x - dx * (1 - t), y - dy * (1 - t), dx, dy);
      }
    }

    window.addEventListener('pointermove', function (e) {
      // 只有真鼠标/触控笔才留痕
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (!hasPrev) { px = e.clientX; py = e.clientY; hasPrev = true; return; }
      var dx = e.clientX - px, dy = e.clientY - py;
      if (dx * dx + dy * dy < 0.5) return;
      feed(e.clientX, e.clientY, dx, dy);
      px = e.clientX;
      py = e.clientY;
    }, { passive: true });

    document.addEventListener('mouseleave', function () { hasPrev = false; });

    var last = performance.now();

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        // 晶体轻、面积大，受到的阻力更强，落得慢一点
        p.vy += (p.flake ? 26 : 46) * dt;
        p.vx *= 1 - (p.flake ? 2.4 : 1.6) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.flake) p.rot += p.spin * dt;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var j = 0; j < ps.length; j++) {
        var q = ps[j];
        var k = 1 - q.life / q.max;

        if (q.flake) {
          // 淡入很快、淡出平缓：刚落下来那一下最亮
          ctx.globalAlpha = q.a * Math.min(1, k * 1.6);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.drawImage(FLAKE, -q.r, -q.r, q.r * 2, q.r * 2);
          ctx.restore();
        } else {
          var rr = q.r * 4.8;
          ctx.globalAlpha = Math.min(1, q.a * k * 1.05);
          ctx.drawImage(SPRITE, q.x - rr, q.y - rr, rr * 2, rr * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  makeSnow();
  makeTrail();
})(window, document);
