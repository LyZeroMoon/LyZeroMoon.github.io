'use strict';

/**
 * 把 LaTeX 原生的 \[...\] / \(...\) 改写成 markdown-it-katex 认识的 $$...$$ / $...$。
 *
 * 为什么需要这个：
 *   站点用的公式方案是 hexo-renderer-markdown-it + @traptitech/markdown-it-katex，
 *   而它**只认 $...$ 与 $$...$$ 两种分隔符**（Fluid 的 katex 分支也只注入
 *   katex.min.css，渲染全在构建期完成，没有前端 auto-render 兜底）。
 *   可是 \( ... \) 和 \[ ... \] 才是 LaTeX 文档里更常见的写法，多数编辑器和
 *   AI 输出公式时用的也是这一套。于是会踩两层坑：
 *
 *     1. 完全不被识别，公式原样躺在正文里；
 *     2. Markdown 先把 \[ 当成「转义的方括号」吃掉 —— \[ 变 [ 、\( 变 ( ，
 *        连 \, 都会变成 ,（逗号是 ASCII 标点，属于 CommonMark 的可转义字符）。
 *        最终页面上就成了「[ X(z)=\sum_{n} x[n],z^{-n} ]」这种彻底看不懂的东西。
 *
 *   第 2 条是真正的元凶：即使后面补了客户端 auto-render 也救不回来，
 *   因为到那时 \[ ... \] 早就不存在了。所以必须在 Markdown 解析**之前**改写。
 *
 * 转换规则：
 *   \[ ... \]  →  $$ ... $$      块级公式；若 \[ 不在行首，前后补换行
 *   \( ... \)  →  $ ... $        行内公式；内部首尾空白会 trim
 *                                （KaTeX 不接受 `$ x $` 这种带空格的写法）
 *   - `\(...\)` 内部含换行的，自动升级成块级
 *   - 代码块（``` / ~~~ 围栏）与行内代码整段跳过，绝不改动
 *   - 已经写好的 $...$ / $$...$$ 整段跳过，不会重复处理、也不会二次转义
 *   - 找不到配对收尾的原样保留：宁可显示成 `[`，也不能吐出落单的 `$$`
 *     把后半篇文档一起吞进公式里
 *
 * 执行时机：before_post_render，优先级 1。
 *   必须早于 math-pipe-guard（优先级 5）—— 这样 \( |z| > 1 \) 会先变成
 *   $|z|>1$，再交给 pipe-guard 把裸竖线换成 \vert，表格才不会被切坏。
 *   也早于内置的 backtick_code_block（默认 10），所以这里看到的还是原始 Markdown，
 *   围栏判断按 ``` / ~~~ 认。
 */

/* 从 from 开始找配对收尾（\] 或 \)），返回收尾反斜杠的下标；找不到返回 -1。
   \\ 整体跳过，避免把 `a \\[2pt] b` 里的 `[` 误当成块级公式开头。
   途中撞上**同类型的开头**（找 \] 时又见到 \[）就放弃这一对：
   说明前面那个多半是写漏收尾的孤儿，与其让它把后面正常的一对一起吞掉，
   不如把它留成字面量，让后面的正常配对。 */
function findClose(s, from, closer, opener) {
  for (var i = from; i < s.length; i++) {
    if (s[i] !== '\\') continue;
    var n = s[i + 1];
    if (n === '\\') { i++; continue; }
    if (n === closer) return i;
    if (n === opener) return -1;
    i++;
  }
  return -1;
}

/* 这个 \ 前面（同一行内）是否只有空白 —— 决定块级公式能不能落在行首 */
function atLineStart(s, i) {
  for (var k = i - 1; k >= 0; k--) {
    if (s[k] === '\n') return true;
    if (s[k] !== ' ' && s[k] !== '\t') return false;
  }
  return true;
}

/* 处理一段「确定不在围栏代码块里」的文本。行内代码在这里面按反引号切出去 */
function convertSegment(s) {
  var out = '';
  var i = 0;
  var n = s.length;

  while (i < n) {
    var c = s[i];

    /* 已经写好的公式：整段原样搬走 */
    if (c === '$') {
      if (s[i + 1] === '$') {
        var e2 = s.indexOf('$$', i + 2);
        if (e2 > 0) { out += s.slice(i, e2 + 2); i = e2 + 2; continue; }
        out += '$$'; i += 2; continue;
      }
      var e1 = s.indexOf('$', i + 1);
      if (e1 > i + 1 && s[e1 + 1] !== '$') { out += s.slice(i, e1 + 1); i = e1 + 1; continue; }
      out += c; i++; continue;
    }

    /* 行内代码：整段跳过 */
    if (c === '`') {
      var tick = /^(`+)/.exec(s.slice(i))[1];
      var end = s.indexOf(tick, i + tick.length);
      if (end > 0) { out += s.slice(i, end + tick.length); i = end + tick.length; continue; }
      out += c; i++; continue;
    }

    if (c === '\\') {
      var nx = s[i + 1];

      /* 转义反斜杠：整体跳过，别把 \\[ 当成块级公式 */
      if (nx === '\\') { out += '\\\\'; i += 2; continue; }

      /* \[ ... \] → $$ ... $$ */
      if (nx === '[') {
        var cb = findClose(s, i + 2, ']', '[');
        if (cb > 0) {
          var block = '$$' + s.slice(i + 2, cb) + '$$';
          out += atLineStart(s, i) ? block : '\n' + block + '\n';
          i = cb + 2;
          continue;
        }
      }

      /* \( ... \) → $ ... $ */
      if (nx === '(') {
        var ci = findClose(s, i + 2, ')', '(');
        if (ci > 0) {
          var body = s.slice(i + 2, ci).replace(/^[ \t]+|[ \t]+$/g, '');
          if (body) {
            if (body.indexOf('\n') >= 0) {
              /* 行内分隔符里带了换行 —— 行内 $ 撑不住，升级成块级 */
              var blk = '$$' + body + '$$';
              out += atLineStart(s, i) ? blk : '\n' + blk + '\n';
            } else {
              out += '$' + body + '$';
            }
            i = ci + 2;
            continue;
          }
        }
      }

      /* 其他转义（\, \; \left ...）原样搬走 */
      out += c + (nx === undefined ? '' : nx);
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

/* 按 ``` / ~~~ 围栏把整篇切成 [代码块, 普通文本] 交替的片段。
   切的时候保留行结构，最后用 \n 拼回去，能原样还原。 */
function splitFences(text) {
  var lines = String(text).split('\n');
  var parts = [];
  var buf = [];
  var fence = null;

  function flush(code) {
    if (buf.length) { parts.push({ code: code, text: buf.join('\n') }); buf = []; }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      var mark = m[1][0];
      if (!fence) {
        flush(false);
        fence = mark;
        buf.push(line);
      } else if (fence === mark) {
        buf.push(line);
        flush(true);
        fence = null;
      } else {
        buf.push(line);
      }
      continue;
    }
    buf.push(line);
  }
  flush(!!fence);
  return parts;
}

function convertText(text) {
  return splitFences(text).map(function (p) {
    return p.code ? p.text : convertSegment(p.text);
  }).join('\n');
}

hexo.extend.filter.register('before_post_render', function (data) {
  if (typeof data.content !== 'string') return data;
  if (data.content.indexOf('\\[') < 0 && data.content.indexOf('\\(') < 0) return data;
  data.content = convertText(data.content);
  return data;
}, 1);

module.exports = { convertText: convertText, convertSegment: convertSegment };
