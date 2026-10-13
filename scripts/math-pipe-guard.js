'use strict';

/**
 * 把公式里的裸竖线 | 换成 \vert，避免 Markdown 表格把它当成列分隔符。
 *
 * 背景：Markdown 的表格是**块级**语法，在行内解析之前就按 | 切列了。
 * 所以像
 *
 *     | $a^n u[n]$（$|a|<1$） | 有限 | 0 |
 *
 * 这一行里 |a| 的竖线会被当成分隔符，把表格切坏，$ 也就配不成对了。
 * 这跟「支不支持行内公式」无关 —— 段落里的 $|a|<1$ 一直是好的。
 *
 * 为什么换成 \vert 而不是 \|：
 *   表格解析会把 \| 还原成 |，看起来可行；但**段落里的公式不会经过这一步**，
 *   KaTeX 会收到 \| 并渲染成 ‖（双竖线）。而 \vert 在 LaTeX 里就是 | 本身，
 *   表格内外行为一致，视觉上完全相同。
 *
 * 只处理单行内的 $...$ 行内公式：
 *   - $$...$$ 块级公式的内容不走行内解析，裸竖线本来就是安全的
 *   - 代码块和行内代码整段跳过，绝不改动里面的内容
 */

function fixInlineMath(line) {
  var out = '';
  var i = 0;
  var n = line.length;

  while (i < n) {
    var ch = line[i];

    // 反斜杠转义：整对跳过，免得把 \| 也改掉
    if (ch === '\\') { out += line.slice(i, i + 2); i += 2; continue; }

    // $$ 块级分隔符：整段不动
    if (ch === '$' && line[i + 1] === '$') { out += '$$'; i += 2; continue; }

    if (ch === '$') {
      var close = findClosing(line, i + 1);
      if (close > 0) {
        var inner = line.slice(i + 1, close);
        // 只改前面没有反斜杠的竖线。
        // 注意 \vert 后面只有在紧跟字母时才补空格：一是命令名以非字母结尾即可，
        // 二是若竖线正好在结尾 $ 之前，补了空格就会变成「$ 前有空白」，
        // 解析器会认为不能闭合，整个公式就不渲染了。
        out += '$' + inner.replace(/(?<!\\)\|/g, function (m, offset, whole) {
          return /[A-Za-z]/.test(whole[offset + 1] || '') ? '\\vert ' : '\\vert';
        }) + '$';
        i = close + 1;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

/* 找同行内配对的结尾 $；跳过被反斜杠转义的 $，也不认 $$ */
function findClosing(line, from) {
  for (var i = from; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] !== '$') continue;
    if (line[i + 1] === '$') return -1;   // 撞上 $$，说明不是行内公式
    if (i === from) return -1;            // 空内容 $..$ 不算公式
    return i;
  }
  return -1;
}

function fixLine(line) {
  // 先把行内代码切出去，只处理非代码部分
  var parts = line.split(/(`+[^`]*`+)/);
  for (var i = 0; i < parts.length; i += 2) parts[i] = fixInlineMath(parts[i]);
  return parts.join('');
}

function fixText(text) {
  var lines = String(text).split('\n');
  var out = [];
  var fence = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (m) {
      var mark = m[1][0];
      if (!fence) fence = mark;
      else if (fence === mark) fence = null;
      out.push(line);
      continue;
    }
    out.push(fence ? line : fixLine(line));
  }
  return out.join('\n');
}

hexo.extend.filter.register('before_post_render', function (data) {
  if (typeof data.content === 'string' && data.content.indexOf('$') >= 0) {
    data.content = fixText(data.content);
  }
  return data;
}, 5);
