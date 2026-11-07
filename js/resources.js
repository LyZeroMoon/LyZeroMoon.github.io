/* ============================================================
   资源库前台：把 source/_data/resources.json 渲染成文件管理器
   只由 themes/fluid/layout/resources.ejs 页面级引入
   ============================================================ */

(function () {
  'use strict';

  var app = document.getElementById('res-app');
  if (!app) return;

  var dataEl = document.getElementById('res-data');
  var raw = {};
  try { raw = JSON.parse((dataEl && dataEl.textContent) || '{}') || {}; } catch (e) { raw = {}; }

  var ROOT = String(raw.root || '/');
  if (ROOT.charAt(ROOT.length - 1) !== '/') ROOT += '/';

  var SVG_FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 7.2A1.7 1.7 0 0 1 4.7 5.5h3.8l1.7 2.1h8.1A1.7 1.7 0 0 1 20 9.3v7.5a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 16.8z"/></svg>';
  var SVG_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6.2 3.5h7.3L18 8v12.5H6.2z"/><path d="M13.5 3.5V8H18"/></svg>';
  var SVG_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 10.6 12 4l8 6.6V20H4z"/></svg>';

  /* ---------- 路径工具 ---------- */

  function normPath(p) {
    return String(p == null ? '' : p)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/{2,}/g, '/')
      .trim();
  }
  function parentOf(p) {
    p = normPath(p);
    var i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }
  function baseName(p) {
    p = normPath(p);
    var i = p.lastIndexOf('/');
    return i < 0 ? p : p.slice(i + 1);
  }
  function extOf(name) {
    var m = String(name || '').split(/[?#]/)[0].match(/\.([A-Za-z0-9]{1,6})$/);
    return m ? m[1] : '';
  }

  /* ---------- 目录树：把「声明的文件夹」和「条目所在路径」合并 ---------- */

  var FOLDERS = {};

  function touch(path) {
    path = normPath(path);
    if (!path) return null;
    if (!FOLDERS[path]) {
      FOLDERS[path] = { path: path, title: baseName(path), desc: '', order: 1000, declared: false };
    }
    return FOLDERS[path];
  }
  function touchChain(path) {
    var segs = normPath(path).split('/').filter(Boolean);
    var acc = '';
    for (var i = 0; i < segs.length; i++) {
      acc = acc ? acc + '/' + segs[i] : segs[i];
      touch(acc);
    }
  }

  var rawFolders = Array.isArray(raw.folders) ? raw.folders : [];
  rawFolders.forEach(function (f) {
    if (!f) return;
    var path = normPath(f.path || f.title);
    if (!path) return;
    touchChain(path);
    var node = FOLDERS[path];
    if (f.title) node.title = String(f.title).trim();
    if (f.desc) node.desc = String(f.desc).trim();
    if (f.order != null && !isNaN(Number(f.order))) node.order = Number(f.order);
    node.declared = true;
  });

  var ITEMS = [];
  var rawItems = Array.isArray(raw.items) ? raw.items : [];
  rawItems.forEach(function (it) {
    if (!it) return;
    var o = {
      title: String(it.title || '').trim(),
      path: normPath(it.path),
      author: String(it.author || '').trim(),
      format: String(it.format || '').trim().toUpperCase(),
      size: Number(it.size) || 0,
      link: String(it.link || '').trim(),
      file: String(it.file || '').trim(),
      desc: String(it.desc || '').trim(),
      tags: Array.isArray(it.tags) ? it.tags.map(String).filter(Boolean) : [],
      date: String(it.date || '').trim(),
      star: !!it.star
    };
    if (!o.title && !o.file && !o.link) return;
    if (!o.title) o.title = baseName(o.file || o.link);
    if (!o.format) o.format = extOf(o.file || o.link).toUpperCase();
    if (o.path) touchChain(o.path);
    ITEMS.push(o);
  });

  /* ---------- 查询 ---------- */

  function childFolders(path) {
    path = normPath(path);
    return Object.keys(FOLDERS)
      .filter(function (p) { return parentOf(p) === path; })
      .map(function (p) { return FOLDERS[p]; })
      .sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title, 'zh');
      });
  }
  function folderItems(path) {
    path = normPath(path);
    return ITEMS.filter(function (it) { return it.path === path; });
  }
  function countUnder(path) {
    path = normPath(path);
    var prefix = path ? path + '/' : '';
    var n = 0;
    ITEMS.forEach(function (it) {
      if (path) { if (it.path === path || it.path.indexOf(prefix) === 0) n++; }
      else n++;
    });
    return n;
  }
  function subFolderCount(path) {
    path = normPath(path);
    var prefix = path ? path + '/' : '';
    var n = 0;
    Object.keys(FOLDERS).forEach(function (p) {
      if (path) { if (p.indexOf(prefix) === 0) n++; }
      else n++;
    });
    return n;
  }

  function itemUrl(it) {
    if (it.file) {
      var p = it.file.replace(/\\/g, '/').replace(/^\/+/, '');
      if (p.indexOf('source/') === 0) p = p.slice(7);
      return encodeURI(ROOT + p);
    }
    return it.link || '';
  }
  function itemSource(it) {
    if (it.file) return '站内';
    var l = it.link;
    if (!l) return '';
    try { return new URL(l, location.href).hostname.replace(/^www\./, ''); } catch (e) { return '外部'; }
  }
  function itemExternal(it) { return !it.file && !!it.link; }

  /* ---------- 格式化 ---------- */

  function humanSize(n) {
    n = Number(n) || 0;
    if (n <= 0) return '';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    // 字节 / KB 取整就行；MB 以上留一位小数，17.6 MB 比 18 MB 更有用
    if (i <= 1) return Math.round(v) + ' ' + u[i];
    var s = v.toFixed(1);
    if (/\.0$/.test(s)) s = String(Math.round(v));
    return s + ' ' + u[i];
  }
  function shortDate(s) {
    var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }
  function hashFor(path) {
    path = normPath(path);
    return path ? '#/' + path.split('/').map(encodeURIComponent).join('/') : '#/';
  }
  function pathFromHash() {
    var h = location.hash || '';
    if (h === '#' || h === '#/' || h === '') return '';
    var s = h.replace(/^#\/?/, '');
    try { s = s.split('/').map(decodeURIComponent).join('/'); } catch (e) { /* 保留原样 */ }
    return normPath(s);
  }

  /* ---------- DOM 小工具 ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svgBox(cls, svg) {
    var n = el('span', 'res-ico' + (cls ? ' ' + cls : ''));
    n.innerHTML = svg;
    return n;
  }
  function fmtBox(fmt) {
    if (fmt && fmt.length <= 5) {
      var n = el('span', 'res-ico');
      n.setAttribute('data-fmt', fmt);
      n.appendChild(el('span', 'ext', fmt));
      return n;
    }
    return svgBox('', SVG_FILE);
  }
  function folderBox() {
    return svgBox('folder', SVG_FOLDER);
  }

  /* ---------- 状态 ---------- */

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem('ly_res_' + key);
      localStorage.setItem('ly_res_' + key, val);
    } catch (e) { /* 隐私模式下忽略 */ }
    return val;
  }

  var view = store('view') === 'list' ? 'list' : 'grid';
  var sort = store('sort') || 'name';
  var query = '';
  var current = pathFromHash();

  if (!FOLDERS[current] && current) current = '';

  var bodyEl = document.getElementById('res-body');
  var crumbsEl = document.getElementById('res-crumbs');
  var noteEl = document.getElementById('res-note');
  var qEl = document.getElementById('res-q');
  var sortEl = document.getElementById('res-sort');

  function sortItems(list) {
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (sort === 'date') {
        var da = a.date || '', db = b.date || '';
        if (da !== db) return db.localeCompare(da);
      } else if (sort === 'size') {
        if ((a.size || 0) !== (b.size || 0)) return (b.size || 0) - (a.size || 0);
      }
      return a.title.localeCompare(b.title, 'zh');
    });
    return arr;
  }

  /* ---------- 渲染：面包屑 ---------- */

  function renderCrumbs() {
    crumbsEl.innerHTML = '';
    var segs = current ? current.split('/') : [];
    var acc = '';

    var home = el('button', 'res-crumb' + (current ? '' : ' now'));
    home.type = 'button';
    home.innerHTML = SVG_HOME;
    home.appendChild(document.createTextNode('资源'));
    if (current) home.addEventListener('click', function () { location.hash = '#/'; });
    crumbsEl.appendChild(home);

    segs.forEach(function (name, i) {
      acc = acc ? acc + '/' + name : name;
      crumbsEl.appendChild(el('span', 'sep', '/'));
      var last = i === segs.length - 1;
      if (last) {
        crumbsEl.appendChild(el('span', 'res-crumb now', name));
      } else {
        var b = el('button', 'res-crumb', name);
        b.type = 'button';
        var target = acc;
        b.addEventListener('click', function () { location.hash = hashFor(target); });
        crumbsEl.appendChild(b);
      }
    });
  }

  /* ---------- 渲染：说明条 ---------- */

  function renderNote(folderCount, itemCount, hit) {
    noteEl.innerHTML = '';
    noteEl.hidden = false;

    if (query) {
      noteEl.appendChild(el('span', 't', '搜索「' + query + '」'));
      noteEl.appendChild(el('span', '', hit + ' 项结果'));
      var back = el('a', 'sp', '清除搜索');
      back.href = '#/';
      back.style.cursor = 'pointer';
      back.addEventListener('click', function (e) {
        e.preventDefault();
        qEl.value = '';
        query = '';
        render();
      });
      noteEl.appendChild(back);
      return;
    }

    if (current) {
      var node = FOLDERS[current];
      noteEl.appendChild(el('span', 't', node ? node.title : baseName(current)));
      if (node && node.desc) noteEl.appendChild(el('span', '', node.desc));
      noteEl.appendChild(el('span', 'sp', itemCount + ' 个文件 · ' + folderCount + ' 个子文件夹'));
    } else {
      noteEl.appendChild(el('span', 't', '资料库'));
      noteEl.appendChild(el('span', '', '共 ' + countUnder('') + ' 个文件 · ' + subFolderCount('') + ' 个文件夹'));
    }
  }

  /* ---------- 渲染：网格卡片 ---------- */

  function folderCard(node) {
    var a = el('a', 'res-card');
    a.href = hashFor(node.path);
    a.appendChild(folderBox());
    var info = el('div', 'res-info');
    info.appendChild(el('span', 'res-name', node.title));
    var n = countUnder(node.path);
    var sub = subFolderCount(node.path);
    var parts = [];
    if (n) parts.push(n + ' 个文件');
    if (sub) parts.push(sub + ' 个文件夹');
    if (node.desc) parts.push(node.desc);
    if (parts.length) info.appendChild(el('span', 'res-sub', parts.join(' · ')));
    a.appendChild(info);
    return a;
  }

  function itemCard(it) {
    var url = itemUrl(it);
    var a = el('a', 'res-card');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    if (it.file) a.setAttribute('download', '');
    a.appendChild(fmtBox(it.format));

    var info = el('div', 'res-info');
    info.appendChild(el('span', 'res-name', it.title));
    var sub = [];
    if (it.author) sub.push(it.author);
    if (it.size) sub.push(humanSize(it.size));
    if (sub.length) info.appendChild(el('span', 'res-sub', sub.join(' · ')));
    if (it.desc) info.appendChild(el('span', 'res-desc', it.desc));
    a.appendChild(info);

    var src = itemSource(it);
    if (src) {
      var flag = el('span', 'res-flag' + (itemExternal(it) ? ' ext' : ''), src);
      a.appendChild(flag);
    }
    return a;
  }

  /* ---------- 渲染：列表行 ---------- */

  function folderRow(node) {
    var row = el('div', 'res-row');
    row.appendChild(folderBox());
    var a = el('a', 'col-name', node.title);
    a.href = hashFor(node.path);
    row.appendChild(a);
    row.appendChild(el('span', 'col-by', node.desc || ''));
    row.appendChild(el('span', 'col-tag', '文件夹'));
    var n = countUnder(node.path);
    row.appendChild(el('span', 'col-size', n ? n + ' 项' : '—'));
    row.appendChild(el('span', 'col-date', ''));
    row.appendChild(el('span', 'col-act', ''));
    return row;
  }

  function itemRow(it) {
    var url = itemUrl(it);
    var row = el('div', 'res-row');
    row.appendChild(fmtBox(it.format));

    var a = el('a', 'col-name', it.title);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    row.appendChild(a);

    row.appendChild(el('span', 'col-by', it.author || ''));
    row.appendChild(el('span', 'col-tag', it.format || '文件'));
    row.appendChild(el('span', 'col-size', humanSize(it.size) || '—'));
    row.appendChild(el('span', 'col-date', shortDate(it.date)));

    var acts = el('span', 'col-act');
    var open = el('button', 'res-act', itemExternal(it) ? '前往' : '打开');
    open.type = 'button';
    open.addEventListener('click', function () { window.open(url, '_blank', 'noopener'); });
    acts.appendChild(open);

    var copy = el('button', 'res-act', '复制链接');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var abs = itemExternal(it) ? url : location.origin + url;
      copyText(abs, copy);
    });
    acts.appendChild(copy);
    row.appendChild(acts);
    return row;
  }

  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
      document.body.removeChild(ta);
    }
  }

  /* ---------- 渲染：主体 ---------- */

  function section(label, count) {
    var s = el('div', 'res-sec');
    s.appendChild(document.createTextNode(label));
    if (count != null) s.appendChild(el('span', 'n', count));
    return s;
  }

  function emptyState(big, html) {
    var box = el('div', 'res-empty');
    box.appendChild(el('span', 'big', big));
    var p = el('p', '');
    p.innerHTML = html;
    box.appendChild(p);
    return box;
  }

  function render() {
    renderCrumbs();

    var grid = (view === 'grid');
    bodyEl.innerHTML = '';

    /* 全局搜索：跨所有文件夹找，并标出它在哪里 */
    if (query) {
      var q = query.toLowerCase();
      var hitFolders = Object.keys(FOLDERS).map(function (p) { return FOLDERS[p]; }).filter(function (f) {
        return f.title.toLowerCase().indexOf(q) >= 0 || f.desc.toLowerCase().indexOf(q) >= 0 || f.path.toLowerCase().indexOf(q) >= 0;
      });
      var hitItems = ITEMS.filter(function (it) {
        return it.title.toLowerCase().indexOf(q) >= 0 ||
          it.author.toLowerCase().indexOf(q) >= 0 ||
          it.desc.toLowerCase().indexOf(q) >= 0 ||
          it.path.toLowerCase().indexOf(q) >= 0 ||
          it.tags.join(' ').toLowerCase().indexOf(q) >= 0;
      });

      renderNote(hitFolders.length, hitItems.length, hitFolders.length + hitItems.length);

      if (!hitFolders.length && !hitItems.length) {
        bodyEl.appendChild(emptyState('没有找到匹配的内容', '换个关键词试试，比如书名、作者或文件夹名。'));
        return;
      }

      if (hitFolders.length) {
        bodyEl.appendChild(section('文件夹', hitFolders.length));
        var fw = grid ? el('div', 'res-grid') : el('div', 'res-list');
        hitFolders.forEach(function (f) { fw.appendChild(grid ? folderCard(f) : folderRow(f)); });
        bodyEl.appendChild(fw);
      }
      if (hitItems.length) {
        bodyEl.appendChild(section('文件', hitItems.length));
        var iw = grid ? el('div', 'res-grid') : el('div', 'res-list');
        sortItems(hitItems).forEach(function (it) { iw.appendChild(grid ? itemCard(it) : itemRow(it)); });
        bodyEl.appendChild(iw);
      }
      return;
    }

    var folders = childFolders(current);
    var items = sortItems(folderItems(current));
    renderNote(folders.length, items.length);

    if (!folders.length && !items.length) {
      if (!ITEMS.length && !rawFolders.length) {
        bodyEl.appendChild(emptyState('资料库还是空的', '打开 <a href="' + ROOT + 'admin/">写作后台</a> 的「资源」标签，<br>新建一个文件夹，就能开始往里放电子书了。'));
      } else {
        bodyEl.appendChild(emptyState('这个文件夹还是空的', '进「<a href="' + ROOT + 'admin/">写作后台</a>」往里加文件，或者回到 <a href="#/">资料库根目录</a>。'));
      }
      return;
    }

    if (folders.length) {
      bodyEl.appendChild(section('文件夹', folders.length));
      var fBox = grid ? el('div', 'res-grid') : el('div', 'res-list');
      folders.forEach(function (f) { fBox.appendChild(grid ? folderCard(f) : folderRow(f)); });
      bodyEl.appendChild(fBox);
    }
    if (items.length) {
      bodyEl.appendChild(section('文件', items.length));
      var iBox = grid ? el('div', 'res-grid') : el('div', 'res-list');
      items.forEach(function (it) { iBox.appendChild(grid ? itemCard(it) : itemRow(it)); });
      bodyEl.appendChild(iBox);
    }
  }

  /* ---------- 交互 ---------- */

  function syncViewButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.res-view button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === view);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.res-view button'), function (b) {
    b.addEventListener('click', function () {
      view = b.getAttribute('data-view');
      store('view', view);
      syncViewButtons();
      render();
    });
  });

  sortEl.value = sort;
  sortEl.addEventListener('change', function () {
    sort = sortEl.value;
    store('sort', sort);
    render();
  });

  var qTimer = null;
  qEl.addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () {
      query = qEl.value.trim();
      render();
    }, 140);
  });

  window.addEventListener('hashchange', function () {
    current = pathFromHash();
    if (!FOLDERS[current] && current) { location.hash = '#/'; return; }
    query = '';
    qEl.value = '';
    render();
  });

  /* 从别的页面带 hash 进来时，初始 current 已在解析；这里只兜底非法路径 */
  if (current && !FOLDERS[current]) current = '';

  syncViewButtons();
  render();
})();
