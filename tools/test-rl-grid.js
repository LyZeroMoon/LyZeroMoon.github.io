/* 回归测试：网格世界实验（data-lab="grid"）
 *   node tools/test-rl-grid.js
 *
 * 重点验五件事：
 *   1. 未训练时不给结论，门格画「两个状态」（上下 0 / 1）
 *   2. 两种状态编码的对比数字：naive 25 状态 / 1 处歧义 / 0%，full 44 / 0 / 100%
 *   3. 训练后地图改画学到的走法（每格一支箭头），且结论块直接给出输赢
 *   4. 结论块里说得出它卡在哪两格
 *   5. 换种子后结论不变（full 仍然全过，naive 仍然过不去）
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
let fills = 0;
window.HTMLCanvasElement.prototype.getContext = function () {
  const c = {};
  ['clearRect', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke',
    'fillRect', 'strokeRect', 'arc', 'setLineDash', 'save', 'restore', 'clip', 'rect',
    'closePath'].forEach(k => { c[k] = () => {}; });
  c.fill = () => { fills++; };            // 箭头头是一次 fill
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
const btn = Array.from(lab.querySelectorAll('.rl-btn'))
  .find(b => b.textContent.indexOf('训练') >= 0);
const tabNaive = () => Array.from(lab.querySelectorAll('.rl-tab')).find(t => t.textContent.indexOf('坐标 +') < 0);
const tabFull = () => Array.from(lab.querySelectorAll('.rl-tab')).find(t => t.textContent.indexOf('钥匙') >= 0);

function readout() { return lab.querySelector('.rl-readout').textContent.replace(/\s+/g, ' ').trim(); }
function rows() {
  const tb = lab.querySelector('.rl-compare-tb');
  if (!tb) return [];
  return Array.from(tb.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
}

console.log('[1] 初始读数:', readout());
console.log('    对比表是否提前出现:', !!lab.querySelector('.rl-compare-tb'));

/* 训练前切到「坐标 + 钥匙」：门格应被拆成上下两半 0 / 1 */
drawn = [];
tabFull().click();
const gate01 = drawn.indexOf('0') >= 0 && drawn.indexOf('1') >= 0;
console.log('    训练前门格标注 0/1:', gate01, '|', drawn.join(','));
tabNaive().click();

drawn = [];
fills = 0;
btn.click();
console.log('\n[2] 训练后读数:', readout());
rows().forEach(r => console.log('      ', r.join(' | ')));
console.log('    按钮文案:', btn.textContent);
console.log('    说明:', lab.querySelector('.rl-compare-note').textContent.replace(/\s+/g, ' ').slice(0, 60));

const r = rows();
const naive = r[0], full = r[1];
const okNaive = naive[1] === '25' && naive[2] === '1' && naive[3] === '0%';
const okFull = full[1] === '44' && full[2] === '0' && full[3] === '100%';

/* 结论块：先给输赢，再说卡在哪 */
const vd = lab.querySelector('.rl-verdict');
const vRows = vd ? Array.from(vd.querySelectorAll('.rl-verdict-row')) : [];
const vText = vd ? vd.textContent.replace(/\s+/g, ' ').trim() : '';
console.log('\n[3] 结论块:', vText);
const okVerdict = vRows.length === 2 &&
  vRows[0].classList.contains('bad') && vRows[1].classList.contains('good') &&
  vRows[0].textContent.indexOf('0/100') >= 0 &&
  vRows[1].textContent.indexOf('100/100') >= 0 &&
  /来回 \d+ 次/.test(vRows[0].textContent);

/* 训练后地图上应出现箭头（每次 fill 一支），且不再画示范路线上的 0/1 */
console.log('\n[4] 训练后箭头数:', fills, '| 画布文字:', drawn.join(','));
const okArrow = fills >= 4;

/* 切到「坐标 + 钥匙」看它学到的那条路 */
drawn = [];
fills = 0;
tabFull().click();
console.log('    切到含钥匙后读数:', readout());
console.log('    箭头数:', fills, '| 画布文字:', drawn.join(','));
const okArrow2 = fills >= 4;
console.log('    win 行跟着切换:', lab.querySelector('.rl-compare-tb tr.win')
  ? lab.querySelector('.rl-compare-tb tr.win').textContent.replace(/\s+/g, ' ').trim() : '无');

/* 换种子重训 */
btn.click();
const r2 = rows();
console.log('\n[5] 换种子后:', r2[0].join(' | '), '||', r2[1].join(' | '));
const stable = Number(r2[1][3].replace('%', '')) >= 90 && Number(r2[0][3].replace('%', '')) <= 10;
console.log('    结论稳定（full ≥ 90%，naive ≤ 10%）:', stable);
console.log('    平均步数（full）:', r2[1][4]);

const ok = okNaive && okFull && gate01 && okVerdict && okArrow && okArrow2 && stable;
console.log('\n结果:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
