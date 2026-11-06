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

function cellsOf(lab) {
  return Array.from(lab.querySelectorAll('.rl-cell'))
    .map(c => c.querySelector('em').textContent + '=' + c.querySelector('b').textContent);
}

console.log('挂载点数量:', labs.length);
console.log('实例 1 子节点:', L0.children.length, '| 实例 2 子节点:', L1.children.length);

/* ---------- 1. 手动模式：初始状态 ---------- */
const prog0 = L0.querySelector('.rl-progress');
console.log('\n[1] 进度条初始:', prog0.querySelector('span').textContent,
  '| 显示:', prog0.style.display !== 'none');

drawn = [];
hit(L0, 6);   // 点第 7 台（真值最高）
console.log('    点击一次后指标:', stats(L0));
console.log('    读数:', L0.querySelector('.rl-readout').textContent.trim().split('\n')[0]);
console.log('    手动模式第 4 格（押中率）display:',
  JSON.stringify(L0.querySelectorAll('.rl-stat')[3].style.display));
console.log('    画布出现「真实均值」字样:', drawn.some(t => t.indexOf('真实均值') >= 0),
  '| 出现「真实最优」:', drawn.some(t => t.indexOf('真实最优') >= 0));

/* ---------- 2. 手动模式：跑满 50 次预算 ---------- */
// 前 30 次乱点，后 20 次点最优臂 —— 模拟真实读者的「先摸底后收敛」
for (let i = 0; i < 30; i++) hit(L0, i % 10);
for (let i = 0; i < 19; i++) hit(L0, 6);

console.log('\n[2] 第 49 次后进度:', L0.querySelector('.rl-progress span').textContent);

const result = L0.querySelector('.rl-result');
console.log('    结算面板是否提前出现:', result.style.display !== 'none');

hit(L0, 6);   // 第 50 次，触发结算

console.log('    第 50 次后结算面板显示:', result.style.display !== 'none');
console.log('    结算数据:', cellsOf(L0).join(' | '));
console.log('    评语:', result.querySelector('p').textContent);

drawn = [];
hit(L0, 3);   // 预算用完后继续点，应该无效
console.log('    结算后再点一次，试验次数:',
  L0.querySelectorAll('.rl-stat b')[0].textContent, '(应仍为 50)');

/* ---------- 3. 结算后揭晓真值 ---------- */
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
  const vals = Array.from(result.querySelectorAll('.rl-cell b')).map(b => b.textContent);
  result.querySelector('.rl-btn').click();     // 再来一局
  return parseFloat(vals[2]);                  // 后悔值
}
const regrets = [];
for (let g = 0; g < 3; g++) regrets.push(playRound(6));
console.log('\n[4b] 连开三局都点同一位置，后悔值:', regrets.map(r => r.toFixed(1)).join(' | '));
const shuffled = Math.max(...regrets) > 8;
console.log('    洗牌生效（至少一局明显不是最优）:', shuffled);

/* ---------- 5. 自动模式：跑满预算自动结算 ---------- */
function runAuto(lab, waitMs) {
  return new Promise(resolve => {
    // 结算面板的按钮也在 .rl-btn.primary 里、且DOM顺序更靠前，
    // 所以不能按 class 取，必须按文案定位训练按钮
    const btnRun = Array.from(lab.querySelectorAll('.rl-btn'))
      .find(b => b.textContent === '开始训练');
    const segs = lab.querySelectorAll('.rl-seg');
    segs[segs.length - 1].querySelectorAll('button')[2].click();  // 快档，40 步/帧

    console.log('\n[5] 自动模式进度:', lab.querySelector('.rl-progress span').textContent);
    drawn = [];
    btnRun.click();

    setTimeout(() => {
      const st = lab.querySelectorAll('.rl-stat b');
      resolve({
        btnRun,
        steps: Number(st[0].textContent),
        stats: Array.from(st).map(s => s.textContent).join(' | '),
        result: lab.querySelector('.rl-result'),
        cells: cellsOf(lab),
        note: lab.querySelector('.rl-result p').textContent,
        progress: lab.querySelector('.rl-progress span').textContent,
        marked: drawn.filter(t => t.indexOf('它选的') >= 0).length
      });
    }, waitMs);
  });
}

(async () => {
  const A = await runAuto(L1, 2500);

  console.log('    训练步数:', A.steps, '(应等于 800)');
  console.log('    进度:', A.progress);
  console.log('    指标:', A.stats);
  console.log('    结算面板显示:', A.result.style.display !== 'none');
  console.log('    结算数据:', A.cells.join(' | '));
  console.log('    结论:', A.note.replace(/\s+/g, ' ').slice(0, 90));
  console.log('    训练按钮已禁用:', A.btnRun.disabled);
  console.log('    成绩单位置（应紧跟读数）:',
    A.result.previousElementSibling && A.result.previousElementSibling.className);

  /* 对比表：结算后应出现，三行，且有一行被标为最优 */
  const cmp = L1.querySelector('.rl-compare');
  const rows = cmp ? Array.from(cmp.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td'))
      .map(td => td.textContent.replace(/\s+/g, ' ').trim()).join(' | ')) : [];
  console.log('    对比表显示:', !!cmp && cmp.style.display !== 'none');
  rows.forEach(r => console.log('      ', r));
  const winRow = cmp && cmp.querySelector('tbody tr.win');
  console.log('    被标为最优的行:', winRow ? winRow.textContent.replace(/\s+/g, ' ').trim() : '无');
  console.log('    对比结论:', cmp ? cmp.querySelector('.rl-compare-note')
    .textContent.replace(/\s+/g, ' ').slice(0, 80) : '无');

  const learned = A.note.indexOf('学会了') === 0;
  const ok = A.steps === 800 &&
    A.result.style.display !== 'none' &&
    A.cells.length === 4 &&
    A.btnRun.disabled &&
    A.result.previousElementSibling.className === 'rl-readout' &&
    A.note.length > 20 &&
    !!cmp && cmp.style.display !== 'none' && rows.length === 3 && !!winRow;

  console.log('\n默认参数（ε=0.1）判为「学会了」:', learned);
  console.log('\n结果:', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();
