/* 回归测试：验证折扣面板（disk 03）的读数与画布。
 *   node tools/test-rl-discount.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><body>
<div class="rl-lab" data-lab="discount"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

let drawn = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const c = {};
  ['clearRect', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill',
    'fillRect', 'strokeRect', 'arc', 'setLineDash', 'save', 'restore',
    'closePath'].forEach(k => { c[k] = () => {}; });
  c.measureText = () => ({ width: 20 });
  c.fillText = (t) => { drawn.push(String(t)); };
  return c;
};
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 640, height: 220, right: 640, bottom: 220 };
};

window.eval(fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/lab.js'), 'utf8'));

const lab = document.querySelector('.rl-lab');
if (!lab.querySelector('.rl-range')) {
  console.log('挂载失败：' + lab.textContent);
  process.exit(1);
}

const range = lab.querySelector('.rl-range');
const gval = () => lab.querySelector('.rl-field b').textContent;
const stats = () => Array.from(lab.querySelectorAll('.rl-stat b')).map(e => e.textContent);
const hint = () => lab.querySelector('.rl-hint').textContent.replace(/\s+/g, ' ').trim();

function set(v) {
  drawn = [];
  range.value = String(v);
  range.dispatchEvent(new window.Event('input'));
}

let bad = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? '  ok  ' : '  FAIL') + ' | ' + name + ' = ' + got + (ok ? '' : '（期望 ' + want + '）'));
}

console.log('[1] 默认 γ = 0.90');
check('γ 显示', gval(), '0.90');
check('第 10 步权重', stats()[0], '0.35');
check('跌破 10%', stats()[1], '第 22 步');
check('无限总回报', stats()[2], '10.00 分');

console.log('\n[2] 拖到 γ = 0.50');
set(50);
check('γ 显示', gval(), '0.50');
check('第 10 步权重', stats()[0], '<0.01');
check('跌破 10%', stats()[1], '第 4 步');
check('无限总回报', stats()[2], '2.00 分');

console.log('\n[3] 拖到 γ = 0.99');
set(99);
check('γ 显示', gval(), '0.99');
check('第 10 步权重', stats()[0], '0.90');
check('跌破 10%', stats()[1], '第 230 步');
check('无限总回报', stats()[2], '100.00 分');

console.log('\n[4] 拖到 γ = 0');
set(0);
check('γ 显示', gval(), '0.00');
check('第 10 步权重', stats()[0], '0');
check('跌破 10%', stats()[1], '第 1 步');
check('无限总回报', stats()[2], '1.00 分');
console.log('    提示:', hint());

console.log('\n[5] 画布');
set(90);
console.log('    轴标签:', drawn.join(' '));
check('画布无裸 $', drawn.some(t => t.indexOf('$') >= 0) ? '有' : '无', '无');
check('柱顶标注 0.35', drawn.indexOf('0.35') >= 0 ? '有' : '无', '有');
check('横轴刻度 20', drawn.indexOf('20') >= 0 ? '有' : '无', '有');

console.log('\n[6] 提示文案不含裸 $ 与 TeX');
const h = hint();
console.log('    ', h);
check('无裸 $', h.indexOf('$') >= 0 ? '有' : '无', '无');
check('无 \\gamma', h.indexOf('\\') >= 0 ? '有' : '无', '无');

console.log(bad ? '\n有 ' + bad + ' 项不符' : '\n全部通过');
process.exit(bad ? 1 : 0);
