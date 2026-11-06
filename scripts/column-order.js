'use strict';

/**
 * 专栏（分类）页按「顺序」排列，而不是按发布时间。
 *
 * 为什么需要这个：DSP 这个专栏是按讲义顺序写的，但文章是断续发布的
 * ——（七）可能比（三）先写完，标签页按日期排出来就成了 七、三、五、六、四。
 * 读者要的是「从第一节读到最后一节」，所以排序键必须是标题里的序号。
 *
 * 序号从哪来：
 *   1. front-matter 的 `order` 字段（显式指定，优先级最高）
 *   2. 标题里的序号标记，支持四种数字体系：
 *        阿拉伯   （3）  3.   第3讲   Part 3
 *        中文     （三） 三、  第三讲
 *        罗马     （III） Chapter IV
 *        英文     （Three） Lesson Two
 *
 * 没有序号的专栏（比如以后随手写的杂记）不会受影响：有序号的排前面，
 * 没序号的按时间正序排在后面 —— 这样「顺序」和「时间」两种专栏都能用。
 *
 * 这个文件同时承担两件事：给模板提供排序助手 + 去掉分类页的分页路由
 * （列表要一页放完，翻页和「正序/倒序」是冲突的，见下面的说明）。
 */

/* ============================== 数字解析 ============================== */

const CN_DIGIT = {
  '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
};
const CN_UNIT = { '十': 10, '百': 100, '千': 1000 };

/**
 * 中文数字转数值：一 / 十 / 十二 / 二十三 / 一百零五
 * 逐字累加，遇到「单位」就把当前数字乘上去；「十」开头按 1 计（十一 = 11）。
 */
function cnToNumber(token) {
  const s = String(token).trim();
  if (!s) return null;

  let section = 0;   // 已结算的部分（百位以上）
  let num = 0;       // 还没乘单位的数字
  let seen = false;

  for (const ch of s) {
    if (Object.prototype.hasOwnProperty.call(CN_DIGIT, ch)) {
      num = CN_DIGIT[ch];
      seen = true;
    } else if (Object.prototype.hasOwnProperty.call(CN_UNIT, ch)) {
      if (num === 0) num = 1;          // 「十一」里的「十」
      section += num * CN_UNIT[ch];
      num = 0;
      seen = true;
    } else {
      return null;                     // 混进了别的字，说明这压根不是数字
    }
  }
  return seen ? section + num : null;
}

const EN_ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const EN_TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

/** 英文数字：one / twenty-one / Twenty One */
function enToNumber(token) {
  const parts = String(token).trim().toLowerCase()
    .replace(/[-\u2010-\u2015]/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ');
  if (!parts[0]) return null;

  if (parts.length === 1) {
    if (Object.prototype.hasOwnProperty.call(EN_ONES, parts[0])) return EN_ONES[parts[0]];
    if (Object.prototype.hasOwnProperty.call(EN_TENS, parts[0])) return EN_TENS[parts[0]];
    return null;
  }
  if (parts.length === 2 &&
      Object.prototype.hasOwnProperty.call(EN_TENS, parts[0]) &&
      Object.prototype.hasOwnProperty.call(EN_ONES, parts[1]) &&
      EN_ONES[parts[1]] < 10) {
    return EN_TENS[parts[0]] + EN_ONES[parts[1]];
  }
  return null;
}

/* 合法罗马数字的写法约束，避免把标题里的普通大写字母当成数字 */
const ROMAN_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
const ROMAN_VAL = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** 罗马数字：I / IV / XII / XL */
function romanToNumber(token) {
  const s = String(token).trim().toUpperCase();
  if (!s || !ROMAN_RE.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN_VAL[s[i]];
    const next = ROMAN_VAL[s[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return total > 0 ? total : null;
}

/** 任意数字写法 → 整数；识别不了返回 null（很重要：不能把普通词当 0） */
function numeralToNumber(token) {
  if (token === null || token === undefined) return null;

  const s = String(token).trim()
    /* 全角数字转半角 */
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[．。]/g, '.');

  if (!s) return null;
  if (/^\d{1,4}$/.test(s)) return parseInt(s, 10);

  const cn = cnToNumber(s);
  if (cn !== null) return cn;

  /* 中文数字先判，再判罗马：这两者字符集不重叠，顺序其实无所谓，
     但「I」既是罗马数字也像英文单词，必须让罗马先吃到 */
  const ro = romanToNumber(s);
  if (ro !== null) return ro;

  const en = enToNumber(s);
  if (en !== null) return en;

  return null;
}

/* ============================== 从标题提取 ============================== */

/**
 * 按「可信度」从高到低试几种常见写法，取第一个能解析成数字的。
 * 只认结构化位置（括号里、第X讲、行首编号），不在正文里乱找数字 ——
 * 否则「离散时间系统六大性质」里的「六」会被误当成序号。
 */
function parseOrdinal(title) {
  if (!title) return null;
  const t = String(title);
  let m;

  /* 1. 括号里的序号：（一）(2) （III） （Three） */
  const bracket = /[（(]([^（()）]{1,24})[）)]/g;
  while ((m = bracket.exec(t))) {
    const n = numeralToNumber(m[1]);
    if (n !== null) return n;
  }

  /* 2. 第X讲 / 第X章 / 第X节 / 第X篇 / 第X课 */
  m = t.match(/第\s*([0-9\uFF10-\uFF19]{1,4}|[〇零一二两三四五六七八九十百千]{1,6}|[ivxlcdmIVXLCDM]{1,7})\s*[讲章节课篇部回话]/);
  if (m) {
    const n = numeralToNumber(m[1]);
    if (n !== null) return n;
  }

  /* 3. Part 3 / Chapter IV / Lesson Two / Vol.2 / Ep.5 */
  m = t.match(/\b(?:part|chapter|chap|lesson|section|episode|ep|vol|volume|unit)\s*\.?\s*([0-9\uFF10-\uFF19]{1,4}|[ivxlcdmIVXLCDM]{1,7}|[A-Za-z]+(?:[-\s][A-Za-z]+)?)/i);
  if (m) {
    const n = numeralToNumber(m[1]);
    if (n !== null) return n;
  }

  /* 4. 行首编号：#3 / 3. / 三、 / 3) */
  m = t.match(/^\s*#\s*([0-9\uFF10-\uFF19]{1,3}|[〇零一二两三四五六七八九十百千]{1,6})(?=[\s.、．:：)）]|$)/);
  if (m) {
    const n = numeralToNumber(m[1]);
    if (n !== null) return n;
  }

  m = t.match(/^\s*([0-9\uFF10-\uFF19]{1,3}|[〇零一二两三四五六七八九十百千]{1,6})\s*[.、．:：)）]\s*/);
  if (m) {
    const n = numeralToNumber(m[1]);
    if (n !== null) return n;
  }

  return null;
}

/** 某篇文章的序号：front-matter `order` 优先，其次解析标题 */
function ordinalOf(post) {
  if (!post) return null;

  const raw = post.order;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const n = numeralToNumber(String(raw).trim());
    if (n !== null) return n;
  }
  return parseOrdinal(post.title);
}

/** 排序：有序号的按序号升序 → 无序号的时间升序 → 同序号的按标题 */
function compareRows(a, b) {
  const ao = a.ord;
  const bo = b.ord;

  if (ao !== null && bo !== null) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== null) {
    return -1;                      // 有序号的永远在前面
  } else if (bo !== null) {
    return 1;
  }

  const da = a.post.date ? new Date(a.post.date).getTime() : 0;
  const db = b.post.date ? new Date(b.post.date).getTime() : 0;
  if (da !== db) return da - db;

  return String(a.post.title || '').localeCompare(String(b.post.title || ''), 'zh');
}

/* ============================== 模板助手 ============================== */

if (typeof hexo !== 'undefined' && hexo && hexo.extend) {
  /**
   * 用法：colSortedPosts(cat.posts.toArray())
   * 返回 [{ post, ord }]，已按顺序排好。
   */
  hexo.extend.helper.register('colSortedPosts', function (posts) {
    const list = (posts || []).map(function (post) {
      return { post: post, ord: ordinalOf(post) };
    });
    list.sort(compareRows);
    return list;
  });

  /** 序号显示成两位数：3 → 03，方便对齐成一列 */
  hexo.extend.helper.register('colOrdLabel', function (ord) {
    if (ord === null || ord === undefined) return '';
    return ord < 10 ? '0' + ord : String(ord);
  });

  /**
   * 去掉分类页的分页路由。
   *
   * 专栏页现在一页列完所有文章 —— 「正序/倒序」是整体翻转，如果还分页，
   * 第 1 页只有 1~10 篇，翻转后变成 10~1，读者看到的不是「最后一节在最上面」，
   * 而是「第 10 节在最上面」，语义就错了。
   *
   * 只有分类页去掉，/archives/ 和标签页保持原来的分页。
   */
  hexo.extend.filter.register('after_generate', function () {
    const dir = String((hexo.config && hexo.config.category_dir) || 'categories')
      .replace(/^\/+|\/+$/g, '');
    const pageRe = new RegExp('^' + escapeRe(dir) + '/.+/page/\\d+/(index\\.html)?$');

    let removed = 0;
    hexo.route.list().forEach(function (path) {
      if (pageRe.test(path)) {
        hexo.route.remove(path);
        removed++;
      }
    });
    if (removed) {
      hexo.log.info('[column-order] 分类页不再分页，已移除 ' + removed + ' 个分页路由');
    }
  });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 导出纯函数，方便脱离 Hexo 单测 */
module.exports = {
  cnToNumber,
  enToNumber,
  romanToNumber,
  numeralToNumber,
  parseOrdinal,
  ordinalOf,
  compareRows,
};
