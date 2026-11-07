/*!
 * 小游戏入口（按需加载）
 * ---------------------------------------------------------------------------
 * 唯一知道「引擎在哪、每款游戏在哪」的地方。页面加载时只会下载这一个文件
 * （约 2KB），引擎和具体游戏都要等到真的点开某一款才去下载。
 *
 * 路径不是硬编码的：head.ejs 用 url_for 把 hub / games 目录的地址塞进
 * window.LY_GAMES，这样站点挂在子路径下也不会挂。
 *
 * 职责：
 *   1. 按需加载 js/games/kit.js 和 js/games/<id>.js
 *   2. 给页面上所有 [data-game] 卡片绑点击
 *   3. 把 localStorage 里的最高分回填到 [data-best] 上
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  if (window.LY_GAME_HUB) return;

  var cfg = window.LY_GAMES || {};
  var base = cfg.dir || '/js/games/';
  var games = cfg.games || [];

  var kitPromise = null;
  var gamePromises = {};
  var cssPromise = null;

  function known(id) {
    for (var i = 0; i < games.length; i++) {
      if (games[i].id === id) return true;
    }
    return false;
  }

  function enabled() {
    return cfg.enabled !== false;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
      document.head.appendChild(el);
    });
  }

  /* 机台样式（.gk-*）不在 custom_css 里，不然不玩游戏的人每页都要多下 7KB。
     游戏中心页会自己 link 一份，所以先查一下有没有，别插两遍。

     注意这里**不等样式加载完**：<link> 插进去就算完事，函数立刻 resolve。
     一来样式晚到几百毫秒顶多是机台闪一下原始样子，二来万一样式请求一直挂着
     （网络卡、被拦），等它会把「点开游戏」这件事一起卡死 —— 不值得。 */
  function ensureCss() {
    if (cssPromise) return cssPromise;
    var href = cfg.css || '/css/games.css';
    var links = document.querySelectorAll('link[href]');
    for (var i = 0; i < links.length; i++) {
      if ((links[i].getAttribute('href') || '').indexOf('games.css') >= 0) {
        cssPromise = Promise.resolve();
        return cssPromise;
      }
    }
    var el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
    cssPromise = Promise.resolve();
    return cssPromise;
  }

  function loadKit() {
    if (window.LY_GAME_KIT) return Promise.resolve(window.LY_GAME_KIT);
    if (kitPromise) return kitPromise;
    /* 样式和引擎各走各的：样式不参与 Promise.all，免得它拖住开机台 */
    ensureCss();
    kitPromise = loadScript(base + 'kit.js').then(function () {
      if (!window.LY_GAME_KIT) throw new Error('引擎已加载但没有挂出接口');
      return window.LY_GAME_KIT;
    });
    /* 失败后清掉缓存，下次点击还能重试，而不是永远卡住 */
    kitPromise.catch(function () {
      kitPromise = null;
      cssPromise = null;
    });
    return kitPromise;
  }

  function loadGame(id) {
    if (!known(id)) return Promise.reject(new Error('未知游戏：' + id));
    return loadKit().then(function (kit) {
      if (kit.has(id)) return kit;
      if (gamePromises[id]) return gamePromises[id];
      var p = loadScript(base + id + '.js').then(function () {
        if (!kit.has(id)) throw new Error('模块已加载但没有注册：' + id);
        return kit;
      });
      p.catch(function () { delete gamePromises[id]; });
      gamePromises[id] = p;
      return p;
    });
  }

  /* 打开一款游戏。返回 Promise，失败时 reject（调用方负责提示） */
  function play(id) {
    if (!enabled()) return Promise.reject(new Error('站点已关闭小游戏'));
    return loadGame(id).then(function (kit) { return kit.play(id); });
  }

  /* 预热：把引擎先拉下来，点开游戏时就不用等了 */
  function preload() {
    if (!enabled()) return Promise.resolve(null);
    return loadKit().catch(function () { return null; });
  }

  function close() {
    if (window.LY_GAME_KIT) window.LY_GAME_KIT.close();
  }

  /* ------------------------------ 页面胶水 ------------------------------ */

  function bestOf(id) {
    try {
      var v = parseFloat(localStorage.getItem('ly_game_best_' + id));
      return isNaN(v) ? null : v;
    } catch (e) {
      return null;
    }
  }

  function fillBests(root) {
    var nodes = (root || document).querySelectorAll('[data-best]');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-best');
      var v = bestOf(id);
      var meta = null;
      for (var j = 0; j < games.length; j++) if (games[j].id === id) meta = games[j];
      if (v == null) { nodes[i].textContent = '还没玩过'; continue; }
      /* 扫雷比的是用时，越小越好，展示成秒 */
      nodes[i].textContent = (meta && meta.bestMode === 'low')
        ? Math.round(v / 1000) + ' 秒'
        : String(Math.round(v));
    }
  }

  function setNotice(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  function bindCards(root) {
    var scope = root || document;
    var cards = scope.querySelectorAll('[data-game]');
    var notice = document.getElementById('gm-notice');

    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        card.addEventListener('click', function (e) {
          e.preventDefault();
          var id = card.getAttribute('data-game');
          var was = card.getAttribute('data-loading');
          if (was === '1') return;
          card.setAttribute('data-loading', '1');
          setNotice(notice, '');
          play(id).catch(function (err) {
            setNotice(notice, '打不开这款游戏：' + ((err && err.message) || err) + '，请刷新重试。');
          }).then(function () {
            card.removeAttribute('data-loading');
          });
        });
      })(cards[i]);
    }
    fillBests(scope);
    return cards.length;
  }

  function boot() {
    var n = bindCards(document);
    /* 只在真的有游戏卡片的页面上预热引擎。别的页面（含每一篇文章）连这 20KB
       都不该下载 —— 那些页面上的入口是站内链接，不是即开即玩的机台。 */
    if (!n) return;
    if (window.requestIdleCallback) window.requestIdleCallback(preload, { timeout: 2500 });
    else window.setTimeout(preload, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.LY_GAME_HUB = {
    play: play,
    preload: preload,
    close: close,
    loaded: function () { return !!window.LY_GAME_KIT; },
    bindCards: bindCards,
    fillBests: fillBests,
    ensureCss: ensureCss,
    base: base
  };

})(window, document);
