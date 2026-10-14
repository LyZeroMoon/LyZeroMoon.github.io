'use strict';

/**
 * 双向链接：[[笔记名]] / [[笔记名|显示文字]]
 *
 * 为什么要分两阶段做（这是踩过坑才改的）：
 *
 * Hexo 在 before_generate 阶段 locals 还没加载全 —— 实测 5 篇文章只加载了 2 篇，
 * 而且漏的是哪几篇每次还不一样。所以「在正文渲染时就查表换链接」这条路，
 * 会在文章多起来之后随机漏掉一部分，还很难发现。
 *
 * 改成两阶段：
 *   阶段一 before_post_render —— 只把 [[...]] 换成不依赖索引的占位标记，
 *                              顺便把 | 提前吃掉（免得被表格语法当成列分隔符）
 *   阶段二 after_render:html  —— 此时 locals 已完整（实测 5/5），
 *                              再把标记解析成真实链接，并填入反向链接
 *
 * 反向链接同理：布局里只留一个注释标记，等阶段二数据齐了再填内容。
 */

const fs = require('fs');
const path = require('path');

const LINK_RE = /\[\[([^\[\]\n]+?)\]\]/g;
const MARK = '<!--WIKI-BACKLINKS-->';

/* 目标先做 base64url 编码塞进属性，彻底绕开 HTML 转义与 markdown 解析的干扰 */
function enc(s) {
  return Buffer.from(String(s), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function dec(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return Buffer.from(t, 'base64').toString('utf8');
}

/* 标题归一化：忽略大小写与空白，让 [[离散时间系统 性质]] 也能匹配 */
function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
  });
}

function urlOf(model) {
  const p = String(model.path || '');
  if (!p) return null;
  return '/' + p.replace(/index\.html$/, '').replace(/^\/+/, '');
}

/* 文章模型的 path 是 "2026/10/13/xxx/"，而 after_render:html 拿到的
   data.path 是 "2026/10/13/xxx/index.html"，两边要归一化后才能对上 */
function pathKey(p) {
  return String(p || '').replace(/index\.html$/, '').replace(/^\/+/, '');
}

function toArray(q) {
  try {
    if (!q) return [];
    return typeof q.toArray === 'function' ? q.toArray() : (Array.isArray(q) ? q : []);
  } catch (e) { return []; }
}

/* 跳过代码内容，只处理正文。
   两种形态都要认：
   - Hexo 的代码高亮过滤器跑在本过滤器**之前**，所以 Markdown 的 ``` 块
     到这里时已经是 <pre><code class="hljs ..."> 了
   - 但行内代码和其它情况仍可能是原始反引号形态 */
function mapOutsideCode(text, fn) {
  const kept = [];
  const stash = function (s) {
    kept.push(s);
    return '\u0000' + (kept.length - 1) + '\u0000';
  };

  let out = String(text);

  // 1. 已经是 HTML 的代码区域，整块收起来
  out = out.replace(/<pre\b[\s\S]*?<\/pre>/gi, stash);
  out = out.replace(/<code\b[\s\S]*?<\/code>/gi, stash);

  // 2. 仍是 Markdown 形态的围栏与行内代码
  const lines = out.split('\n');
  const res = [];
  let fence = null;

  for (const line of lines) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      const mark = m[1][0];
      if (!fence) fence = mark;
      else if (fence === mark) fence = null;
      res.push(line);
      continue;
    }
    if (fence) { res.push(line); continue; }

    const parts = line.split(/(`+[^`]*`+)/);
    for (let i = 0; i < parts.length; i += 2) parts[i] = fn(parts[i]);
    res.push(parts.join(''));
  }
  out = res.join('\n');

  // 3. 还原被收起来的代码
  return out.replace(/\u0000(\d+)\u0000/g, function (m, i) { return kept[Number(i)]; });
}

function readSource(src) {
  try {
    return fs.readFileSync(path.join(hexo.source_dir, src), 'utf8');
  } catch (e) { return ''; }
}

/* ---------- 阶段一：换成占位标记 ---------- */

hexo.extend.filter.register('before_post_render', function (data) {
  if (!data || typeof data.content !== 'string') return data;
  if (data.content.indexOf('[[') < 0) return data;

  data.content = mapOutsideCode(data.content, function (seg) {
    return seg.replace(LINK_RE, function (whole, inner) {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const label = (parts[1] || parts[0]).trim();
      if (!target) return whole;
      return '<a class="wikilink" data-wiki="' + enc(target) + '">' + esc(label) + '</a>';
    });
  });

  return data;
});

/* ---------- 索引 ---------- */

let cache = null;
let cacheSize = -1;

function buildIndex() {
  const models = toArray(hexo.locals.get('posts')).concat(toArray(hexo.locals.get('pages')));

  const byKey = new Map();
  const byPath = {};
  const records = [];

  models.forEach(function (m) {
    if (!m || !m.source) return;
    const url = urlOf(m);
    const title = String(m.title || '').trim();
    if (!url || !title) return;

    const rec = {
      title: title,
      url: url,
      source: m.source,
      path: String(m.path || ''),
      isNote: /^notes\//.test(m.source)
    };
    records.push(rec);
    byPath[pathKey(rec.path)] = rec;
    byPath[pathKey(m.source)] = rec;

    const keys = [norm(title)];
    const base = String(m.source).replace(/^.*\//, '').replace(/\.md$/i, '');
    if (base) keys.push(norm(base));
    keys.forEach(function (k) {
      if (k && !byKey.has(k)) byKey.set(k, rec);
    });
  });

  const incoming = {};
  records.forEach(function (rec) {
    mapOutsideCode(readSource(rec.source), function (seg) {
      let m;
      LINK_RE.lastIndex = 0;
      while ((m = LINK_RE.exec(seg)) !== null) {
        const t = m[1].split('|')[0].trim();
        if (!t) continue;
        const hit = byKey.get(norm(t));
        if (!hit) continue;
        if (!incoming[hit.source]) incoming[hit.source] = [];
        if (incoming[hit.source].some(function (x) { return x.source === rec.source; })) continue;
        incoming[hit.source].push(rec);
      }
      return seg;
    });
  });

  return { byKey: byKey, byPath: byPath, records: records, incoming: incoming, missing: [] };
}

/* locals 是渐进加载的，条数变了就重建，保证拿到的是完整的那一份 */
function getIndex() {
  const size = toArray(hexo.locals.get('posts')).length + toArray(hexo.locals.get('pages')).length;
  if (!cache || size !== cacheSize) {
    const kept = cache ? cache.missing.slice() : [];
    cache = buildIndex();
    cache.missing = kept;
    cacheSize = size;
  }
  return cache;
}

function backlinksHtml(rec) {
  const list = cache.incoming[rec.source] || [];
  if (!list.length) return '';
  const items = list.map(function (r) {
    return '<li><a href="' + esc(r.url) + '">' + esc(r.title) + '</a>' +
      '<span class="wiki-tag">' + (r.isNote ? '笔记' : '文章') + '</span></li>';
  }).join('');
  return '<section class="wiki-backlinks"><h3>提到这篇的 ' + list.length + ' 处</h3>' +
    '<ul>' + items + '</ul></section>';
}

/* ---------- 阶段二：解析链接 + 填反向链接 ---------- */

hexo.extend.filter.register('after_render:html', function (str, data) {
  if (!str || typeof str !== 'string') return str;

  const idx = getIndex();
  const rec = data && data.path ? idx.byPath[pathKey(data.path)] : null;

  if (str.indexOf('data-wiki=') >= 0) {
    str = str.replace(
      /<a class="wikilink" data-wiki="([A-Za-z0-9_-]+)">([\s\S]*?)<\/a>/g,
      function (m, token, label) {
        const target = dec(token);
        const hit = idx.byKey.get(norm(target));
        if (hit) {
          return '<a class="wikilink" href="' + esc(hit.url) + '" title="' + esc(hit.title) +
            '">' + label + '</a>';
        }
        idx.missing.push({ page: data && data.path, target: target });
        return '<span class="wikilink wikilink-missing" title="还没有这篇：' + esc(target) +
          '">' + label + '</span>';
      });
  }

  if (str.indexOf(MARK) >= 0) {
    str = str.replace(MARK, rec ? backlinksHtml(rec) : '');
  }

  return str;
});

/* 布局里调用它只为留个标记，真正内容由阶段二填 */
hexo.extend.helper.register('wiki_backlinks', function () {
  return MARK;
});

/* 构建结束把断链汇总打出来，指向没写的笔记正好是一份待办清单。
   注意 after_generate 触发在路由渲染**之前**，所以不能依赖阶段二累积的
   missing，这里自己扫一遍（此时 locals 已完整）。 */
hexo.extend.filter.register('after_generate', function () {
  const idx = getIndex();
  const byTarget = {};

  idx.records.forEach(function (rec) {
    mapOutsideCode(readSource(rec.source), function (seg) {
      let m;
      LINK_RE.lastIndex = 0;
      while ((m = LINK_RE.exec(seg)) !== null) {
        const t = m[1].split('|')[0].trim();
        if (t && !idx.byKey.get(norm(t))) byTarget[t] = (byTarget[t] || 0) + 1;
      }
      return seg;
    });
  });

  const names = Object.keys(byTarget).sort();
  if (!names.length) return;
  console.log('  \x1b[33m↳ 有 ' + names.length + ' 条被 [[ ]] 指向、但还没写的笔记：\x1b[0m');
  console.log(names.map(function (t) {
    return '      · ' + t + '  ×' + byTarget[t];
  }).join('\n'));
});
