/* 回归测试：第五篇的题库 rl5 能否正常渲染、判分、且不含未渲染的 TeX
 *   node tools/test-rl-quiz5.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const QUIZ = path.join(__dirname, '..', 'source/js/rl/quiz.js');
const src = fs.readFileSync(QUIZ, 'utf8');

let pass = 0, fail = 0;
function ok(n, c, e) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
}

/* 一、源码层面：rl5 段里 q / o / w / e 都不能出现 $ 或反斜杠命令 */
const a = src.indexOf('rl5: {');
const b = src.indexOf('DSP（八）');   // 下一段注释的正文行，别把它的说明也算进来
ok('找到 rl5 段', a > 0 && b > a, a + ' / ' + b);
const seg = src.slice(a, b);
const dollars = (seg.match(/\$/g) || []).length;
ok('题面与解析无裸 $', dollars === 0, dollars + ' 处');
const texCmd = (seg.match(/\\\\[a-zA-Z]+/g) || []).length;
ok('无 TeX 命令残留', texCmd === 0, texCmd + ' 处');

/* 二、渲染层面 */
const html = `<!DOCTYPE html><html><head></head><body>
<div class="rl-quiz" data-quiz="rl5"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
window.eval(fs.readFileSync(QUIZ, 'utf8'));

const root = document.querySelector('.rl-quiz');
const qs = [...root.querySelectorAll('.qz-q')];
ok('12 道题', qs.length === 12, qs.length);
ok('挂载成功（题库键存在）', qs.length > 0,
  qs.length ? '' : 'data-quiz 的键在 BANK 里找不到，渲染函数会静默 return');
ok('标题带篇数', root.querySelector('.qz-title').textContent.indexOf('12 道') > 0);
ok('无 undefined', !/undefined/.test(root.textContent));

const score = root.querySelector('.qz-score');
ok('初始计分', score.textContent === '已答 0 / 12', score.textContent);

qs.forEach(q => q.querySelectorAll('.qz-opt')[0].dispatchEvent(new window.Event('click')));
ok('全部答完', root.getAttribute('data-done') === '1');
ok('每题四条说明', qs.every(q => q.querySelectorAll('.qz-note').length === 4));
ok('说明都带符号', qs.every(q =>
  [...q.querySelectorAll('.qz-note')].every(n => /^[✔✘]/.test(n.textContent))));
ok('全页无裸 $', root.textContent.indexOf('$') < 0);
ok('给出总评', root.querySelector('.qz-hint').textContent.length > 20);

/* 三、正确答案分布：四个位置各三题 */
const aVals = (seg.match(/\ba:\s*(\d)/g) || []).map(s => s.replace(/\D/g, ''));
ok('12 道题的 a', aVals.length === 12, aVals.length);
ok('a 索引合法（0-3）', aVals.every(v => +v >= 0 && +v <= 3), aVals.join(','));
const dist = {};
aVals.forEach(v => { dist[v] = (dist[v] || 0) + 1; });
ok('答案四位置各三题', Object.keys(dist).length === 4 && Object.values(dist).every(c => c === 3),
  JSON.stringify(dist));

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 全部通过') + '（通过 ' + pass + '）');
process.exit(fail ? 1 : 0);
