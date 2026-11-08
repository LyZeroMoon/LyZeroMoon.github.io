/* 回归测试：验证 rl/quiz.js 能渲染题库、判对错、展开解析、计分、重做。
 *
 * 依赖 jsdom（不进 package.json，按需安装）：
 *   npm install jsdom --no-save
 *   node tools/test-rl-quiz.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html><html><head></head><body>
<div class="rl-quiz" data-quiz="rl1"></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

const code = fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/quiz.js'), 'utf8');
window.eval(code);

const root = document.querySelector('.rl-quiz');
const qs = [...root.querySelectorAll('.qz-q')];
const score = root.querySelector('.qz-score');
const hint = root.querySelector('.qz-hint');
const again = root.querySelector('.qz-again');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('渲染');
ok('12 道题', qs.length === 12, qs.length);
const optCounts = qs.map(q => q.querySelectorAll('.qz-opt').length);
ok('每题 4 个选项', optCounts.every(n => n === 4), optCounts.join(','));
ok('解析初始隐藏', qs.every(q => q.querySelector('.qz-why').hidden));
ok('选项初始可点', qs.every(q => [...q.querySelectorAll('.qz-opt')].every(b => !b.disabled)));
ok('样式表已注入', !!document.querySelector('link[data-rl-css]'));
ok('初始计分为 0 / 12', score.textContent === '已答 0 / 12', score.textContent);

console.log('\n答错一题（第 1 题选 A，正确答案 B）');
const q0 = qs[0];
const opts0 = [...q0.querySelectorAll('.qz-opt')];
opts0[0].dispatchEvent(new window.Event('click'));
ok('选错项标 no', opts0[0].classList.contains('no'));
ok('正确项标 ok', opts0[1].classList.contains('ok'));
ok('全部选项被禁用', opts0.every(b => b.disabled));
const why0 = q0.querySelector('.qz-why');
ok('解析已展开', !why0.hidden && why0.className.indexOf('no') > -1);
ok('解析含正确答案', /答错，正确答案是 B/.test(why0.textContent), why0.textContent.slice(0, 24));
ok('解析有实质内容', why0.textContent.length > 40, why0.textContent.length);

// 每个选项都要有逐项说明，不能只解释正确答案
const notes0 = opts0.map(b => b.querySelector('.qz-note'));
ok('四个选项各有说明', notes0.length === 4 && notes0.every(Boolean), notes0.filter(Boolean).length);
ok('说明都有实质内容', notes0.every(n => n && n.textContent.length > 15),
  notes0.map(n => n && n.textContent.length).join(','));
ok('说明带对错符号', notes0.every(n => /^[✔✘]/.test(n.textContent)));
ok('正确项说明标 yes', notes0[1].classList.contains('yes'));
ok('误选项说明标 bad', notes0[0].classList.contains('bad'));
ok('未选项说明无标', !notes0[2].classList.contains('yes') && !notes0[2].classList.contains('bad'));
ok('计分 1/12 答对 0', score.textContent === '已答 1 / 12 · 答对 0', score.textContent);

console.log('\n重复点击同一题不重复计分');
opts0.forEach(b => b.dispatchEvent(new window.Event('click')));
ok('仍为已答 1', score.textContent === '已答 1 / 12 · 答对 0', score.textContent);

console.log('\n答对一题（第 2 题选 A）');
const opts1 = [...qs[1].querySelectorAll('.qz-opt')];
opts1[0].dispatchEvent(new window.Event('click'));
ok('标 ok', opts1[0].classList.contains('ok'));
ok('无 no 项', !opts1.some(b => b.classList.contains('no')));
ok('解析提示答对', /^答对/.test(qs[1].querySelector('.qz-why').textContent));
ok('计分 2/12 答对 1', score.textContent === '已答 2 / 12 · 答对 1', score.textContent);

console.log('\n答完全部 12 题');
const ANSWERS = [1, 0, 2, 3, 1, 0, 2, 3, 1, 2, 0, 3];

// 题库里的 a 值必须与预期答案一致，否则做题人会被判错
// 注意：quiz.js 现在有多个题库（rl1 / rl2 / dsp8…），必须先按 key 切段，
// 否则会把别篇的答案拼进来，断言必然失败。
const src = fs.readFileSync(path.join(__dirname, '..', 'source/js/rl/quiz.js'), 'utf8');
const rl1Src = src.split(/\n\s+rl2:\s*\{/)[0];
const bankA = [...rl1Src.matchAll(/\n\s+a: (\d),/g)].map(m => Number(m[1]));
ok('题库答案与预期一致', JSON.stringify(bankA) === JSON.stringify(ANSWERS), bankA.join(','));

// rl2 的结构自检：12 题、每题 4 选项、4 条逐项说明、答案下标合法且分布均匀
const rl2Src = (src.split(/\n\s+rl2:\s*\{/)[1] || '').split(/\n\s+dsp8:\s*\{/)[0];
const rl2A = [...rl2Src.matchAll(/\n\s+a: (\d),/g)].map(m => Number(m[1]));
const rl2Opts = (rl2Src.match(/o: \[/g) || []).length;
const rl2E = (rl2Src.match(/e: \[/g) || []).length;
ok('rl2 题数为 12', rl2A.length === 12, String(rl2A.length));
ok('rl2 每题 4 选项', rl2Opts === 12, String(rl2Opts));
ok('rl2 每题 4 条说明', rl2E === 12, String(rl2E));
ok('rl2 答案下标合法', rl2A.every(v => v >= 0 && v <= 3), rl2A.join(','));
ok('rl2 答案分布均匀', [0, 1, 2, 3].every(i => rl2A.filter(v => v === i).length === 3), rl2A.join(','));

// dsp* 全量结构自检：按 key 切段，逐库检查题量、选项数、说明数、答案下标与分布。
// 切段方式：先扫出所有 "key: { title:" 的位置，相邻两个位置之间即为一个题库。
const bankStart = src.indexOf('var BANK = {');
const bankEnd = src.indexOf('\n  };\n', bankStart);
const bounds = [];
const reKey = /\n\s+([a-zA-Z0-9]+):\s*\{\s*\n\s+title:/g;
let mk;
while ((mk = reKey.exec(src))) bounds.push({ key: mk[1], at: mk.index });

const dspKeys = bounds.map(b => b.key).filter(k => /^dsp\d+$/.test(k));
ok('dsp 题库数量 >= 15', dspKeys.length >= 15, dspKeys.join(','));

for (let i = 0; i < bounds.length; i++) {
  const key = bounds[i].key;
  if (!/^dsp\d+$/.test(key)) continue;
  const to = i + 1 < bounds.length ? bounds[i + 1].at : bankEnd;
  const seg = src.slice(bounds[i].at, to);
  const ans = [...seg.matchAll(/\n\s+a: (\d),/g)].map(m => Number(m[1]));
  const opts = (seg.match(/o: \[/g) || []).length;
  const expl = (seg.match(/e: \[/g) || []).length;
  const want = Number((seg.match(/title: '本篇自测 · (\d+)/) || [])[1]);
  ok(`${key} 题量符合标题（${want}）`, ans.length === want, String(ans.length));
  ok(`${key} 每题 4 选项`, opts === ans.length, String(opts));
  ok(`${key} 每题 4 条说明`, expl === ans.length, String(expl));
  ok(`${key} 答案下标合法`, ans.every(v => v >= 0 && v <= 3), ans.join(','));
  const dist = [0, 1, 2, 3].map(k => ans.filter(v => v === k).length);
  ok(`${key} 答案分布均匀`, Math.max(...dist) - Math.min(...dist) <= 1, dist.join('/'));
  ok(`${key} 题面无裸 $ 与 TeX`, !/\$|\\\\(frac|sum|int)/.test(seg));
}

qs.forEach((q, i) => {
  const bs = [...q.querySelectorAll('.qz-opt')];
  if (!bs[0].disabled) bs[ANSWERS[i]].dispatchEvent(new window.Event('click'));
});
ok('全部标记完成', root.getAttribute('data-done') === '1');
ok('每题四个选项都有说明', qs.every(q => q.querySelectorAll('.qz-note').length === 4),
  qs.map(q => q.querySelectorAll('.qz-note').length).join(','));
ok('没有缺失字段', !/undefined/.test(root.textContent));
// 第 1 题已答错、第 2 题已答对，其余 10 题按预期答案作答
ok('计分 12/12 答对 11', score.textContent === '已答 12 / 12 · 答对 11', score.textContent);
ok('给出总评', /主干已经立住/.test(hint.textContent), hint.textContent);

console.log('\n重做');
again.dispatchEvent(new window.Event('click'));
ok('计分清零', score.textContent === '已答 0 / 12', score.textContent);
ok('选项恢复可点', qs.every(q => [...q.querySelectorAll('.qz-opt')].every(b => !b.disabled)));
ok('答案标记清空', root.querySelectorAll('.ok, .no').length === 0);
ok('逐项说明已清空', root.querySelectorAll('.qz-note').length === 0);
ok('解析重新隐藏', qs.every(q => q.querySelector('.qz-why').hidden));
ok('data-done 已移除', !root.hasAttribute('data-done'));

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 全部通过') +
  '（通过 ' + pass + '）');
process.exit(fail ? 1 : 0);
