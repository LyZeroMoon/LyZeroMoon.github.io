/*!
 * 右上角的界面风格（皮肤）切换器
 * ---------------------------------------------------------------------------
 * 配置来自 <html> 之前注入的 window.LY_UI（由 themes/fluid/layout/_partials/
 * head.ejs 输出），里面只有站点允许的皮肤，所以这里不需要再做白名单过滤。
 *
 * 谁说了算：
 *   站点默认   → source/_data/ui.json 的 default 字段，站主在后台「外观」页改
 *   访客选择   → localStorage['ly_ui_skin']，只在浏览器本地，不上报
 *   访客的选择永远优先于站点默认；点「恢复默认」清掉本地记录即可回到站点默认
 *
 * 首屏的 data-ui 由 head.ejs 里的内联脚本设置（早于首次绘制，防闪烁），
 * 这里只负责切换交互，不再重复首屏逻辑。
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'ly_ui_skin';
  var TOGGLE_ID = 'ui-toggle-btn';
  var MASK_ID = 'ui-mask';
  var root = document.documentElement;

  var cfg = window.LY_UI || {};
  var skins = (cfg.skins || []).filter(function (s) { return s && s.id; });
  if (!skins.length) return;

  var ids = skins.map(function (s) { return s.id; });
  var siteDefault = ids.indexOf(cfg.default) >= 0 ? cfg.default : ids[0];
  var allowSwitch = cfg.allowSwitch !== false;

  var mask = null;
  var lastFocus = null;

  /* 主题的 iconfont 里没有 check / close，这两个小图标直接用内联 SVG，
     免得为两个符号去动字体图标库 */
  var TICK_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<path d="M2.5 8.6l3.6 3.6 7.4-8.4" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CLOSE_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round"/></svg>';

  /* ------------------------------ 存取 ------------------------------ */

  function readStore() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStore(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  /* 本地记录可能指向已被站主删掉的皮肤，统一收敛到合法值 */
  function resolve(id) {
    return ids.indexOf(id) >= 0 ? id : siteDefault;
  }

  function current() {
    return resolve(root.getAttribute('data-ui'));
  }

  function skinById(id) {
    for (var i = 0; i < skins.length; i++) {
      if (skins[i].id === id) return skins[i];
    }
    return null;
  }

  /* 主题的 color-schema.js 会按 --navbar-bg-color 刷新浏览器地址栏配色，
     换皮之后这个值变了，得跟着同步一次，否则移动端状态栏颜色会停在上一个皮肤 */
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var color = getComputedStyle(root).getPropertyValue('--navbar-bg-color').trim();
    if (color) meta.setAttribute('content', color);
  }

  /* ------------------------------ 应用 ------------------------------ */

  function apply(id, options) {
    var opts = options || {};
    var next = resolve(id);
    var prev = root.getAttribute('data-ui');

    root.setAttribute('data-ui', next);
    syncThemeColor();

    if (next !== prev) {
      /* 只在切换这一下开过渡，平时不干扰主题自己的动画设定 */
      root.classList.add('ui-animating');
      window.setTimeout(function () {
        root.classList.remove('ui-animating');
      }, 450);
    }

    if (opts.persist === 'set') writeStore(next);
    else if (opts.persist === 'clear') writeStore(null);

    renderState();
    return next;
  }

  /* ------------------------------ 面板 ------------------------------ */

  function swatchHtml(skin) {
    var a = skin.accent || '#888';
    var b = skin.accent2 || '#eee';
    return '<span class="ui-swatch">' +
      '<i style="background-color:' + esc(a) + '"></i>' +
      '<i style="background-color:' + esc(b) + '"></i>' +
      '</span>';
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildMask() {
    if (mask) return mask;

    var list = skins.map(function (skin) {
      return '<button type="button" class="ui-item" data-skin="' + esc(skin.id) + '">' +
        swatchHtml(skin) +
        '<span class="ui-meta">' +
          '<span class="ui-name">' + esc(skin.name || skin.id) + '</span>' +
          (skin.desc ? '<span class="ui-desc">' + esc(skin.desc) + '</span>' : '') +
        '</span>' +
        '<span class="ui-tick">' + TICK_SVG + '</span>' +
      '</button>';
    }).join('');

    mask = document.createElement('div');
    mask.className = 'ui-mask';
    mask.id = MASK_ID;
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '界面风格');
    mask.innerHTML =
      '<div class="ui-panel">' +
        '<div class="ui-panel-head">' +
          '<h3>界面风格</h3>' +
          '<button type="button" class="ui-close" aria-label="关闭">' +
            CLOSE_SVG +
          '</button>' +
        '</div>' +
        '<div class="ui-list">' + list + '</div>' +
        '<div class="ui-panel-foot">' +
          '<span id="ui-foot-note"></span>' +
          '<button type="button" id="ui-reset">恢复默认</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);

    mask.addEventListener('click', function (e) {
      if (e.target === mask) {
        close();
        return;
      }
      var closeBtn = e.target.closest ? e.target.closest('.ui-close') : null;
      if (closeBtn) {
        close();
        return;
      }
      if (e.target.closest && e.target.closest('#ui-reset')) {
        apply(siteDefault, { persist: 'clear' });
        return;
      }
      var item = e.target.closest ? e.target.closest('.ui-item') : null;
      if (item) apply(item.getAttribute('data-skin'), { persist: 'set' });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    return mask;
  }

  function renderState() {
    if (!mask) return;
    var now = current();
    var stored = readStore();
    /* 本地没有记录、或者记录的就是站点默认 —— 都算「跟随站点默认」 */
    var following = !stored || resolve(stored) === siteDefault;

    mask.querySelectorAll('.ui-item').forEach(function (el) {
      el.classList.toggle('on', el.getAttribute('data-skin') === now);
    });

    var note = mask.querySelector('#ui-foot-note');
    if (note) {
      var skin = skinById(siteDefault);
      note.textContent = following
        ? '正在跟随站点默认风格'
        : '站点默认：' + ((skin && skin.name) || siteDefault);
    }

    var reset = mask.querySelector('#ui-reset');
    if (reset) reset.classList.toggle('ui-hidden', following);
  }

  function isOpen() {
    return !!(mask && mask.classList.contains('show'));
  }

  function open() {
    /* 站主关掉切换开关时，按钮压根不会渲染；这里再拦一道，
       免得有别的入口（或调试调用）把面板放出来 */
    if (!allowSwitch) return;
    buildMask().classList.add('show');
    document.body.classList.add('ui-lock');
    lastFocus = document.activeElement;
    renderState();
    var on = mask.querySelector('.ui-item.on') || mask.querySelector('.ui-item');
    if (on) on.focus();
  }

  function close() {
    if (!mask) return;
    mask.classList.remove('show');
    document.body.classList.remove('ui-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  /* ------------------------------ 绑定 ------------------------------ */

  /* 返回是否已经绑上（按钮可能还没出现在 DOM 里） */
  function bind() {
    var btn = document.getElementById(TOGGLE_ID);
    var mobileBtn = document.getElementById('mobile-ui-toggle-btn');
    if (!btn && !mobileBtn) return false;

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggle();
      });
    }

    if (mobileBtn) {
      mobileBtn.addEventListener('click', function (e) {
        e.preventDefault();
        /* 移动端是整屏网格菜单，先把它收起来再弹面板，不然两层叠一起 */
        var gridMenu = document.getElementById('mobile-grid-menu');
        if (gridMenu) gridMenu.classList.remove('show');
        document.body.classList.remove('mobile-menu-open');
        open();
      });
    }
    return true;
  }

  if (allowSwitch) {
    /* 这个脚本挂在 body 末尾（custom_js），轮到它执行时按钮通常已经在了，
       所以先试一次直接绑；实在没有（脚本被挪到 head 之类）再退回 DOMContentLoaded。
       不靠 readyState 判断 —— 它的取值在不同环境下并不一致。 */
    if (!bind()) {
      document.addEventListener('DOMContentLoaded', bind);
    }
  }

  /* 供调试和自动化测试使用；head.ejs 的内联脚本已处理首屏，不重复调用 */
  window.LY_UI_API = {
    apply: apply,
    open: open,
    close: close,
    current: current,
    siteDefault: function () { return siteDefault; },
    storageKey: STORAGE_KEY,
    skins: ids.slice()
  };

})(window, document);
