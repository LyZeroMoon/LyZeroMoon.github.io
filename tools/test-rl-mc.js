/* 回归测试：第六篇的蒙特卡洛实验（data-lab="mc"）
 *   node tools/test-rl-mc.js
 *
 * 依赖 jsdom（不进 package.json，按需安装）：
 *   npm install jsdom --no-save
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><body>
<div class="rl-lab" data-lab="mc"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

let drawn = [];
function makeCtx() {
  const c = {};
  ['clearRect', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill',
    'fillRect', 'strokeRect', 'arc', 'setLineDash', 'save', 'restore',
    'closePath'].forEach(k => { c[k] = () => {}; });
  c.measureText = () => ({ width: 20 });
  c.fillText = (t) => { drawn.push(String(t)); };
  return c;
}
window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 640, height: 300, right: 640, bottom: 300 };
};

let pass = 0, fail = 0;
function ok(n, c, e) {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); }
}

window.eval(fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/lab.js'), 'utf8'));

const lab = document.querySelector('.rl-lab');
ok('挂载成功', !!lab && lab.getAttribute('data-rl-ready') === '1', lab && lab.textContent.slice(0, 40));
ok('没有加载失败', lab.textContent.indexOf('实验加载失败') < 0, lab.textContent.slice(0, 60));
ok('画布存在', !!lab.querySelector('canvas'));

const stats = Array.from(lab.querySelectorAll('.rl-stat'));
ok('三格读数', stats.length === 3, stats.length);
const labels = stats.map(s => s.querySelector('em').textContent);
ok('读数是标准差/最远偏离/落在 ±0.5 内',
  labels[0].indexOf('标准差') >= 0 && labels[1].indexOf('最远') >= 0 && labels[2].indexOf('±0.5') >= 0,
  labels.join(' | '));

const range = lab.querySelector('input[type=range]');
ok('有滑块', !!range);
ok('滑块范围 1–400', range && range.min === '1' && range.max === '400', range && (range.min + '–' + range.max));
ok('滑块只有一个控件（无按钮）', lab.querySelectorAll('button').length === 0);

function setN(n) {
  range.value = String(n);
  range.dispatchEvent(new window.Event('input'));
  return stats.map(s => s.querySelector('b').textContent);
}

const v1 = setN(1);
ok('N=1 时无估值靠近真值', v1[2] === '0 / 20', v1[2]);
ok('N=1 时标准差 5.00', v1[0] === '5.00', v1[0]);
ok('N=1 时最远偏离 5.00', v1[1] === '5.00', v1[1]);

const v400 = setN(400);
ok('N=400 时标准差 0.25', v400[0] === '0.25', v400[0]);
const hit = parseInt(v400[2], 10);
ok('N=400 时多数落在 ±0.5 内', hit >= 10, v400[2]);

const v100 = setN(100);
ok('N=100 时标准差 0.50', v100[0] === '0.50', v100[0]);

ok('画布标注了真值', drawn.some(t => t.indexOf('真值 5') === 0));
ok('画布标注了当前 N', drawn.some(t => /^N = \d+$/.test(t)));
ok('横轴标了 0 和 10', drawn.includes('0') && drawn.includes('10'));

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 全部通过') + '（通过 ' + pass + '）');
process.exit(fail ? 1 : 0);
