/* 独立验证：不依赖 jsdom，直接跑钥匙门环境，核对文章里那组数字
 *   node tools/sim-grid.js
 *
 * 输出 25/1/0% 与 44/0/100% 以及两条演示轨迹。
 * 与 lab.js 里的 gTrain 是两份实现，用来交叉检查（改环境时两边都要动）。
 */
'use strict';

var W = 7, H = 5;
var MAP = [
  '....###',   // y=4
  '....#G#',   // y=3
  '....D.#',   // y=2
  '....###',   // y=1
  'S..K...'    // y=0
];

function at(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return '#';
  return MAP[H - 1 - y][x];
}

var START = { x: 0, y: 0 };
var ACTS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
var ANAME = ['↑', '↓', '→', '←'];

function step(s, a, blockKey) {
  var nx = s.x + ACTS[a][0], ny = s.y + ACTS[a][1];
  var c = at(nx, ny);
  var t = { x: s.x, y: s.y, key: s.key };
  if (c === '#') return { s2: t, r: -3, done: 0 };
  if (c === 'D' && !s.key) return { s2: t, r: -6, done: 0 };
  t.x = nx; t.y = ny;
  if (c === 'K' && !blockKey) t.key = 1;
  if (c === 'G') return { s2: t, r: 50, done: 1 };
  return { s2: t, r: -1, done: 0 };
}

function key(s, naive) { return naive ? s.x + ',' + s.y : s.x + ',' + s.y + ',' + s.key; }

function rng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function train(naive, episodes, seed, eps0, eps1, alpha, maxStep) {
  var rand = rng(seed);
  var Q = new Map();
  var seen = new Map();       // (s,a) -> Set("x,y,r")
  var clash = 0;              // 有歧义的 (s,a) 个数
  var visited = new Set();
  function get(k, a) { var v = Q.get(k + '|' + a); return v === undefined ? 0 : v; }

  for (var ep = 0; ep < episodes; ep++) {
    var eps = eps0 + (eps1 - eps0) * ep / Math.max(1, episodes - 1);
    var s = { x: START.x, y: START.y, key: 0 };
    for (var t = 0; t < maxStep; t++) {
      var k = key(s, naive);
      visited.add(k);
      var a;
      if (rand() < eps) a = Math.floor(rand() * 4);
      else {
        var best = -Infinity, cands = [];
        for (var i = 0; i < 4; i++) {
          var v = get(k, i);
          if (v > best + 1e-9) { best = v; cands = [i]; }
          else if (Math.abs(v - best) <= 1e-9) cands.push(i);
        }
        a = cands[Math.floor(rand() * cands.length)];
      }
      var r = step(s, a, false);
      var k2 = key(r.s2, naive);
      var ck = k + '|' + a, sig = r.s2.x + ',' + r.s2.y + ',' + r.r;
      var st = seen.get(ck);
      if (!st) { st = new Set(); seen.set(ck, st); }
      var had = st.size;
      st.add(sig);
      if (had && st.size > had && had === 1) clash++;
      var mx = Math.max(get(k2, 0), get(k2, 1), get(k2, 2), get(k2, 3));
      var target = r.done ? r.r : r.r + 0.95 * mx;
      Q.set(k + '|' + a, get(k, a) + alpha * (target - get(k, a)));
      s = r.s2;
      if (r.done) break;
    }
  }
  return { get: get, seen: seen, clash: clash, visited: visited, naive: naive };
}

function policy(model, s) {
  var k = key(s, model.naive);
  var best = -Infinity, cands = [];
  for (var i = 0; i < 4; i++) {
    var v = model.get(k, i);
    if (v > best + 1e-9) { best = v; cands = [i]; }
    else if (Math.abs(v - best) <= 1e-9) cands.push(i);
  }
  return cands[0];
}

function rollout(model, blockKey, maxStep) {
  var s = { x: START.x, y: START.y, key: 0 }, path = [s], win = 0;
  for (var t = 0; t < maxStep; t++) {
    var a = policy(model, s);
    var r = step(s, a, blockKey);
    s = r.s2; path.push(s);
    if (r.done) { win = 1; break; }
  }
  return { path: path, win: win, steps: path.length - 1 };
}

function evaluate(model, episodes, seed) {
  var rand = rng(seed), win = 0, len = 0;
  for (var ep = 0; ep < episodes; ep++) {
    var s = { x: START.x, y: START.y, key: 0 };
    for (var t = 0; t < 80; t++) {
      var a = policy(model, s);
      var r = step(s, a, false);
      s = r.s2;
      if (r.done) { win++; len += t + 1; break; }
    }
  }
  return { rate: win / episodes, len: win ? len / win : 0 };
}

var EP = 300, MAXSTEP = 80;
[[false, 'full'], [true, 'naive']].forEach(function (pair) {
  var m = train(pair[0], EP, 11, 0.3, 0.05, 0.15, MAXSTEP);
  var e = evaluate(m, 100, 77);
  var a = rollout(m, false, 40), b = rollout(m, true, 40);
  console.log(pair[1], '状态数=' + m.visited.size, '歧义(s,a)=' + m.clash,
    '成功率=' + (e.rate * 100).toFixed(0) + '%', '步数=' + e.len.toFixed(1));
  console.log('  带钥匙:', a.path.map(function (p) { return '(' + p.x + ',' + p.y + ')'; }).join(' '), 'win=' + a.win);
  console.log('  没钥匙:', b.path.map(function (p) { return '(' + p.x + ',' + p.y + ')'; }).join(' '), 'win=' + b.win);
});
