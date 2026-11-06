/*!
 * 专栏（分类）页的「正序 / 倒序」切换
 * ---------------------------------------------------------------------------
 * 列表由服务端按序号正序渲染（没打开 JS 也能正常读，只是不能翻转）。
 * 这里只做两件事：记住读者的选择、按选择重排 DOM。
 *
 * 为什么不直接 reverse()：连续点两次必须回到原样，而 reverse 是原地操作，
 * 一旦中途出现「先渲染后保存」的时序问题就会翻错。所以每个 <li> 带一个
 * 固定的 data-i，重排时永远按 data-i 升序/降序拿一遍，幂等、可重复执行。
 * ---------------------------------------------------------------------------
 */

(function (window, document) {
  'use strict';

  var KEY = 'ly_column_order';
  var DEFAULT = 'asc';           // 默认正序：课程目录应该从第一节开始读

  function readStore() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'asc' || v === 'desc' ? v : DEFAULT;
    } catch (e) {
      return DEFAULT;
    }
  }

  function writeStore(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {}
  }

  function setup(root) {
    var list = root.querySelector('.col-list-items');
    if (!list) return;           // 空专栏：没有可切换的东西，按钮也不该在

    var items = Array.prototype.slice.call(list.children).filter(function (el) {
      return el.nodeType === 1 && el.hasAttribute('data-i');
    });
    if (items.length < 2) return;

    /* 按 data-i 预先排一遍，之后的重排都基于这份「原始顺序」 */
    items.sort(function (a, b) {
      return (+a.getAttribute('data-i')) - (+b.getAttribute('data-i'));
    });

    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-order]'));

    function paint(order) {
      var seq = order === 'desc' ? items.slice().reverse() : items.slice();
      var frag = document.createDocumentFragment();
      seq.forEach(function (el) { frag.appendChild(el); });
      list.appendChild(frag);

      buttons.forEach(function (btn) {
        var on = btn.getAttribute('data-order') === order;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var next = btn.getAttribute('data-order') === 'desc' ? 'desc' : 'asc';
        writeStore(next);
        paint(next);
      });
    });

    /* 首屏：把上次的选择补上。服务端只能按正序渲染，所以倒序读者会看到
       一次瞬间翻转 —— 这个脚本紧跟在列表后面执行，翻转发生在首次绘制附近，
       肉眼基本看不到闪烁。 */
    paint(readStore());
  }

  function boot() {
    var roots = document.querySelectorAll('[data-column-list]');
    Array.prototype.forEach.call(roots, setup);
  }

  /* 和 skins.js 一样：脚本挂在 body 末尾（custom_js），轮到它时 DOM 通常已经
     就绪，先直接跑；万一被挪到前面再退回 DOMContentLoaded */
  if (document.querySelector('[data-column-list]')) boot();
  else document.addEventListener('DOMContentLoaded', boot);

})(window, document);
