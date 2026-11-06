/* 回归测试：验证 rl/lab.js 能挂载、点击、训练、结算。改动引擎后重跑。
 *
 * 依赖 jsdom（不进 package.json，按需安装）：
 *   npm install jsdom --no-save
 *   node tools/test-rl-lab.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><body>
<div class="rl-lab" data-lab="bandit"></div>
<div class="rl-lab" data-lab="bandit" data-mode="auto"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// 记录画布上画过的文字，用来验证「真值有没有提前揭晓」
let drawn = [];
const ctxCache = new WeakMap();
function makeCtx(cv) {
  const c = {};
  ['clearRect', 'setTransform', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill',
    'fillRect', 'strokeRect', 'arc', 'setLineDash', 'save', 'restore',
    'closePath'].forEach(k => { c[k] = () => {}; });
  c.measureText = () => ({ width: 20 });
  c.fillText = (t) => { drawn.push(String(t)); };
  return c;
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!ctxCache.has(this)) ctxCache.set(this, makeCtx(this));
  return ctxCache.get(this);
};
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 640, height: 250, right: 640, bottom: 250 };
};

const code = fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/lab.js'), 'utf8');
window.eval(code);

const labs = document.querySelectorAll('.rl-lab');
const L0 = labs[0], L1 = labs[1];

function hit(lab, armIdx) {
  const cv = lab.querySelector('canvas');
  const ev = new window.MouseEvent('click', {
    clientX: 34 + (592 / 10) * (armIdx + 0.5), bubbles: true
  });
  cv.dispatchEvent(ev);
}

function stats(lab) {
  return Array.from(lab.querySelectorAll('.rl-stat b')).map(s => s.textContent).join(' | ');
}

console.log('挂载点数量:', labs.length);
console.log('实例 1 子节点:', L0.children.length, '| 实例 2 子节点:', L1.children.length);

/* ---------- 1. 手动模式：初始状态 ---------- */
const prog0 = L0.querySelector('.rl-progress');
console.log('\n[1] 进度条初始:', prog0.querySelector('span').textContent,
  '| 显示:', prog0.style.display !== 'none');

drawn = [];
hit(L0, 6);   // 点第 7 台（真值最高）
const statsAfter1 = stats(L0);
console.log('    点击一次后指标:', statsAfter1);
console.log('    读数:', L0.querySelector('.rl-readout').textContent.trim().split('\n')[0]);
console.log('    手动模式第 4 格（最优臂占比）display:',
  JSON.stringify(L0.querySelectorAll('.rl-stat')[3].style.display));
console.log('    画布出现「真实均值」字样:', drawn.some(t => t.indexOf('真实均值') >= 0),
  '| 出现「真实最优」:', drawn.some(t => t.indexOf('真实最优') >= 0));

/* ---------- 2. 手动模式：跑满 50 次预算 ---------- */
// 前 30 次乱点，后 20 次点最优臂 —— 模拟真实读者的「先摸底后收敛」
for (let i = 0; i < 30; i++) hit(L0, i % 10);
for (let i = 0; i < 19; i++) hit(L0, 6);

const prog49 = L0.querySelector('.rl-progress span').textContent;
console.log('\n[2] 第 49 次后进度:', prog49);

const result = L0.querySelector('.rl-result');
console.log('    结算面板是否提前出现:', result.style.display !== 'none');

hit(L0, 6);   // 第 50 次，触发结算

const cells = Array.from(result.querySelectorAll('.rl-cell'))
  .map(c => c.querySelector('em').textContent + '=' + c.querySelector('b').textContent);
console.log('    第 50 次后结算面板显示:', result.style.display !== 'none');
console.log('    结算数据:', cells.join(' | '));
console.log('    评语:', result.querySelector('p').textContent);

drawn = [];
hit(L0, 3);   // 预算用完后继续点，应该无效
const t_after = L0.querySelectorAll('.rl-stat b')[0].textContent;
console.log('    结算后再点一次，试验次数:', t_after, '(应仍为 50)');

/* ---------- 3. 结算后揭晓真值 ---------- */
// 触发一次重绘
window.dispatchEvent(new window.Event('resize'));
console.log('\n[3] 揭晓后画布出现「真实均值」:', drawn.some(t => t.indexOf('真实均值') >= 0),
  '| 出现「真实最优」:', drawn.some(t => t.indexOf('真实最优') >= 0));

/* ---------- 4. 再来一局 ---------- */
result.querySelector('.rl-btn').click();
console.log('\n[4] 再来一局 → 面板隐藏:', result.style.display === 'none',
  '| 进度:', L0.querySelector('.rl-progress span').textContent,
  '| 试验次数:', L0.querySelectorAll('.rl-stat b')[0].textContent);

/* ---------- 4b. 洗牌是否生效 ----------
   每局都死点同一个位置（index 6）。如果每局重洗了均值，
   这个位置不可能每局都是最优，后悔值必然出现明显跳变。 */
function playRound(armIdx) {
  for (let i = 0; i < 50; i++) hit(L0, armIdx);
  const cells = Array.from(result.querySelectorAll('.rl-cell b')).map(b => b.textContent);
  result.querySelector('.rl-btn').click();     // 再来一局
  return parseFloat(cells[2]);                 // 后悔值
}
const regrets = [];
for (let g = 0; g < 3; g++) regrets.push(playRound(6));
console.log('\n[4b] 连开三局都点同一位置，后悔值:', regrets.map(r => r.toFixed(1)).join(' | '));
const shuffled = Math.max(...regrets) > 8;
console.log('    洗牌生效（至少一局明显不是最优）:', shuffled);

/* ---------- 5. 自动模式 ---------- */
const btn = Array.from(L1.querySelectorAll('.rl-btn'))
  .find(b => b.textContent.indexOf('训练') >= 0);
console.log('\n[5] 自动模式按钮:', btn && btn.textContent,
  '| 进度条隐藏:', L1.querySelector('.rl-progress').style.display === 'none');

drawn = [];
btn.click();

setTimeout(() => {
  const st2 = L1.querySelectorAll('.rl-stat b');
  console.log('    训练后指标:', Array.from(st2).map(s => s.textContent).join(' | '));
  console.log('    自动模式画布出现「真实均值」:', drawn.some(t => t.indexOf('真实均值') >= 0));

  const steps = Number(st2[0].textContent);
  const ok = steps > 0 && result.style.display === 'none' && shuffled;
  console.log('\n结果:', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}, 400);
