/* 回归测试：网格世界实验（data-lab="grid"）
 *   node tools/test-rl-grid.js
 *
 * 重点验四件事：
 *   1. 未训练时不给结论（避免读者以为数字是白送的）
 *   2. 两种状态编码的对比数字：naive 25 状态 / 1 处歧义 / 0%，full 44 / 0 / 100%
 *   3. 门格的标注随开关变化（一个状态 ↔ 两个状态）
 *   4. 换种子后结论不变（full 仍然全过，naive 仍然过不去）
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><body>
<div class="rl-lab" data-lab="grid"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

let drawn = [];
window.HTMLCanvasElement.prototype.getContext = function () {
  const c = {};
  ['clearRect', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill',
    'fillRect', 'strokeRect', 'arc', 'setLineDash', 'save', 'restore', 'clip', 'rect',
    'closePath'].forEach(k => { c[k] = () => {}; });
  c.measureText = () => ({ width: 20 });
  c.fillText = (t) => { drawn.push(String(t)); };
  return c;
};
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 640, height: 300, right: 640, bottom: 300 };
};

const code = fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/lab.js'), 'utf8');
window.eval(code);

const lab = document.querySelector('.rl-lab');
const cv = lab.querySelector('canvas');
const btn = Array.from(lab.querySelectorAll('.rl-btn'))
  .find(b => b.textContent.indexOf('训练') >= 0);

function readout() { return lab.querySelector('.rl-readout').textContent.replace(/\s+/g, ' ').trim(); }
function rows() {
  const tb = lab.querySelector('.rl-compare-tb');
  if (!tb) return [];
  return Array.from(tb.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
}

console.log('[1] 初始读数:', readout());
console.log('    对比表是否提前出现:', !!lab.querySelector('.rl-compare-tb'));
console.log('    画布标注:', drawn.filter(t => t.indexOf('状态') >= 0).join(' / '));

drawn = [];
btn.click();
console.log('\n[2] 训练后读数:', readout());
rows().forEach(r => console.log('      ', r.join(' | ')));
console.log('    按钮文案:', btn.textContent);
console.log('    说明:', lab.querySelector('.rl-compare-note').textContent.replace(/\s+/g, ' ').slice(0, 60));

const r = rows();
const naive = r[0], full = r[1];
const okNaive = naive[1] === '25' && naive[2] === '1' && naive[3] === '0%';
const okFull = full[1] === '44' && full[2] === '0' && full[3] === '100%';

/* 切到「坐标 + 钥匙」 */
drawn = [];
const tabFull = Array.from(lab.querySelectorAll('.rl-tab')).find(t => t.textContent.indexOf('钥匙') >= 0);
tabFull.click();
console.log('\n[3] 切到含钥匙后读数:', readout());
console.log('    画布重绘:', drawn.length > 0, '| 标注:', drawn.join(','));
console.log('    说明:', lab.querySelector('.rl-hint').textContent.replace(/\s+/g, ' ').slice(0, 40));
const marked2 = drawn.indexOf('1') >= 0 && drawn.indexOf('0') >= 0;
console.log('    win 行跟着切换:', lab.querySelector('.rl-compare-tb tr.win')
  ? lab.querySelector('.rl-compare-tb tr.win').textContent.replace(/\s+/g, ' ').trim() : '无');

/* 换种子重训 */
btn.click();
const r2 = rows();
console.log('\n[4] 换种子后:', r2[0].join(' | '), '||', r2[1].join(' | '));
const stable = Number(r2[1][3].replace('%', '')) >= 90 && Number(r2[0][3].replace('%', '')) <= 10;
console.log('    结论稳定（full ≥ 90%，naive ≤ 10%）:', stable);
console.log('    平均步数（full）:', r2[1][4]);

const ok = okNaive && okFull && marked2 && stable;
console.log('\n结果:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
