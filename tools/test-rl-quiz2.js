/* 回归测试：第二篇的题库 rl2 能否正常渲染与判分
 *   node tools/test-rl-quiz2.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><head></head><body>
<div class="rl-quiz" data-quiz="rl2"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

window.eval(fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/quiz.js'), 'utf8'));

const root = document.querySelector('.rl-quiz');
const qs = [...root.querySelectorAll('.qz-q')];
const score = root.querySelector('.qz-score');
const hint = root.querySelector('.qz-hint');

let pass = 0, fail = 0;
function ok(n, c, e) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (e ? '  → ' + e : '')); }
}

ok('12 道题', qs.length === 12, qs.length);
ok('标题带篇名', root.querySelector('.qz-title').textContent.indexOf('12 道') > 0);
ok('无 undefined', !/undefined/.test(root.textContent));
ok('初始计分', score.textContent === '已答 0 / 12', score.textContent);
ok('题干无裸美元符号', !/\$/.test(qs.map(q => q.querySelector('.qz-stem').textContent).join('')));

// 每题点第一个选项，全部答完，检查说明齐全
qs.forEach(q => q.querySelectorAll('.qz-opt')[0].dispatchEvent(new window.Event('click')));
ok('全部答完', root.getAttribute('data-done') === '1');
ok('每题四条说明', qs.every(q => q.querySelectorAll('.qz-note').length === 4));
ok('说明都带符号', qs.every(q => [...q.querySelectorAll('.qz-note')].every(n => /^[✔✘]/.test(n.textContent))));
ok('给出总评', hint.textContent.length > 20, hint.textContent.slice(0, 30));

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 全部通过') + '（通过 ' + pass + '）');
process.exit(fail ? 1 : 0);
