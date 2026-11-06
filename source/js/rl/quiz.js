/*!
 * 强化学习专栏 —— 可点击选择题
 * ===========================================================================
 * 用法（文章里）：
 *   <div class="rl-quiz" data-quiz="rl1"></div>
 *   <script src="/js/rl/quiz.js" defer></script>
 *
 * 点选项即判对错：正确项标绿，所选项标红，四个选项各自给出一句说明，
 * 另有整题解析。不需要提交、不需要后端。
 *
 * 题目文本是主动渲染的，所以题面里不写 $...$（构建期 KaTeX 管不到这里），
 * 数学一律用 Unicode 与 <i>/<sub>/<sup> 拼。
 * 配色读 Fluid 的 CSS 变量，样式与实验组件共用 rl.css。
 * ===========================================================================
 */

(function (window, document) {
  'use strict';

  if (window.LY_QUIZ) return;

  var CSS_HREF = '/css/rl.css';
  var KEY = ['A', 'B', 'C', 'D'];

  /* =======================================================================
     题库
     -----------------------------------------------------------------------
     q  题干        o  四个选项        a  正确项下标
     w  整题解析     e  逐项说明（与 o 一一对应，讲这项为什么对 / 错在哪）
     ======================================================================= */

  var BANK = {

    rl1: {
      title: '本篇自测 · 12 道选择题',
      items: [
        {
          q: '强化学习区别于监督学习的根本特征是哪一项？',
          o: [
            '使用神经网络作为函数逼近器',
            '反馈是标量评价，而不是每个输入的标准答案',
            '训练数据的规模更大',
            '必须在线采集数据'
          ],
          a: 1,
          w: '分界在反馈的性质：监督学习每个样本都附带「正确答案」，强化学习只拿到一个数，' +
            '这个数不告诉你该改成什么，只告诉你刚才有多好或有多差。',
          e: [
            '错。用不用神经网络与范式无关——表格法一个参数都没有照样是强化学习，' +
              '神经网络只是函数逼近器的一种选择。',
            '对。反馈是一个标量评价，没有「正确答案」可比对，这正是它和监督学习的分界。',
            '错。规模是程度问题，不是性质问题。几十个状态的小任务可以做强化学习，' +
              '上亿样本的监督任务也常见。',
            '错。离线数据同样能做强化学习（离线 RL 就是专门研究这个的），' +
              '在线交互只是最常见的情形，不是必要条件。'
          ]
        },
        {
          q: '策略从 π₁ 换成 π₂ 后，采集到的状态分布随之改变。这一现象的直接后果是？',
          o: [
            '训练集不再独立同分布，旧数据对新策略的代表性下降',
            '奖励函数必须重新设计',
            '折扣因子的取值必须随之调整',
            '状态空间必须改为离散'
          ],
          a: 0,
          w: '数据分布由策略决定，换了策略就换了分布。监督学习里数据分布是外部给定且固定的，' +
            '所以同一批样本可以反复用；这里不行，昨天的样本是按昨天的策略采的。',
          e: [
            '对。策略决定去哪、看到什么，换策略等于换了数据分布，独立同分布的前提随之失效。',
            '错。奖励由任务目标决定，跟用什么策略采集数据无关。换策略不需要动奖励。',
            '错。折扣因子是对时间偏好的设定，属于任务的一部分，不随策略走。',
            '错。状态空间是问题本身的性质（连续还是离散），与策略选择无关。' +
              '连续状态用函数逼近处理，不需要离散化。'
          ]
        },
        {
          q: '十臂老虎机里价值函数写成 Q(a) 而不带状态，原因是？',
          o: [
            '动作空间有限',
            '奖励是确定性的',
            '只有一个状态，状态空间大小为 1',
            '不需要折扣因子'
          ],
          a: 2,
          w: '老虎机是单状态 MDP 的退化情形，|S| = 1。既然只有一个状态，把它写进下标没有信息量，' +
            '于是 Q(s, a) 简写成 Q(a)。这也正是它适合当第一篇例子的原因。',
          e: [
            '错。动作有限和带不带状态是两件事。带状态的表格法同样要求动作有限，' +
              '该写 Q(s, a) 的时候一个符号也省不掉。',
            '错。老虎机的奖励通常是随机的（本实验每次拉动都是高斯采样），' +
              '照样写成 Q(a)。确定性与否与状态无关。',
            '对。状态只有一种，写进去是冗余，所以省掉。',
            '错。单状态确实用不上折扣因子，但那是结果不是原因。省掉 s 是因为 |S| = 1。'
          ]
        },
        {
          q: '一局结束后后悔值为 0.30，最合理的解读是？',
          o: [
            '有 30% 的决策选错了臂',
            '最优臂的真实均值是 0.30',
            '学习率被设成了 0.30',
            '与全程最优策略的累计收益相差 0.30'
          ],
          a: 3,
          w: '后悔值衡量的是差距，不是错误率：每一步「本可以拿到的最优回报」减去「实际拿到的回报」，' +
            '累加起来就是后悔值。错三次但每次只差一点，和错一次差很多，后悔值可能一样。',
          e: [
            '错。后悔值是收益差，不是错误率。错的次数与差多少是两回事。',
            '错。真值由环境决定，不会因为你这局表现好或坏而变成 0.30。',
            '错。学习率是你设的超参数，成绩不会反过来规定它。',
            '对。累计少赚了 0.30，这就是后悔值的定义。'
          ]
        },
        {
          q: '「策略是解，价值是工具」这句话的含义是？',
          o: [
            '价值函数可以直接执行，策略是它的附属',
            '最终交付的是策略，价值是逼近它的中间量',
            '价值的精度决定一切，策略可以后补',
            '两者在无模型方法里可以互相替代'
          ],
          a: 1,
          w: '要交给机器执行的是一个从状态到动作的映射，那就是策略；价值函数存在的意义是帮助把好策略算出来。' +
            '后面的算法大多是「估价值 → 从价值里取出策略」，但交付物始终是策略。',
          e: [
            '错。价值函数给出的是每个动作有多好，不直接给出动作；' +
              '要再做一次取最大才变成可执行的动作。',
            '对。策略是交付物，价值是算它的中间量。',
            '错。价值再准也只是手段，而且价值粗糙时也能取出可用的策略。',
            '错。有模型时可以互相换算，但执行动作永远靠策略，两者不能互换角色。'
          ]
        },
        {
          q: 'ε-greedy 的探索来自哪里？',
          o: [
            '动作选择的随机性',
            '初始值的偏差',
            '对不确定性的定价',
            '奖励本身的噪声'
          ],
          a: 0,
          w: '三种探索各有各的来源，别混：ε-greedy 靠随机性，乐观初值靠初始值偏高，' +
            'UCB 靠把「没试够」折算成可比较的分数。',
          e: [
            '对。以 ε 的比例闭眼乱选，随机性本身就是探索来源。',
            '错。那是乐观初值的机制：把没试过的臂估得偏高，于是它被选中。',
            '错。那是 UCB：用拉取次数构造补偿项，不确定性高的臂分数被抬高。',
            '错。环境噪声会干扰估计，是麻烦，不是探索机制。'
          ]
        },
        {
          q: '乐观初值只探索一轮，直接原因是？',
          o: [
            '初值设得过高，估计会长期偏高',
            '臂的数量太少，一轮就能覆盖',
            '步长 1/n 在 n = 1 时为 1，第一次观测把初值完全覆盖',
            '奖励有界，初值的影响会被自动截断'
          ],
          a: 2,
          w: '第一次拉某臂时 n = 1，步长 1/n 恰好等于 1，于是 Q₂ = R₁——' +
            '初值被这一次观测 100% 替换掉，一点都不剩。这是 1/n 的算术后果，不是设计者的取舍。',
          e: [
            '错。恰恰相反：1/n 的步长让初值在被拉一次后就彻底消失，不会长期偏高。',
            '错。臂数只决定总共要试多少次，不决定每个臂能被试几次。',
            '对。n = 1 时系数为 1，初值被整块替换，乐观只能撑到每臂被试一次。',
            '错。没有这种自动截断机制。初值被抹掉是步长造成的，不是奖励范围造成的。'
          ]
        },
        {
          q: 'UCB 中某臂被拉的次数 N(a) 增大时，补偿项 c·√(ln t / N(a)) 会？',
          o: [
            '增大',
            '保持不变',
            '先增大后减小',
            '减小'
          ],
          a: 3,
          w: 'N(a) 在分母上，拉得越多补偿越小，这条臂的分数自动往回收。' +
            '正是这个自动衰减让 UCB 不需要手动调探索率：不确定性被消化完，探索就自己停了。',
          e: [
            '错。分母变大，整个分式变小，方向反了。',
            '错。ln t 和 N 都在变，只有在很特殊的情况下才恰好抵消。',
            '错。单条臂被反复拉时是单调递减的。觉得「先增后减」多半是把 ln t 的缓慢增长' +
              '误当成了补偿项本身的趋势。',
            '对。分母增大，补偿项减小，探索自动收窄。'
          ]
        },
        {
          q: '增量式更新里，「本次观测减去当前估计」这一项的作用是？',
          o: [
            '提供步长的大小',
            '决定修正的方向与幅度',
            '保证估计值单调递增',
            '消除奖励中的噪声'
          ],
          a: 1,
          w: 'Q ← Q + α(目标 − Q) 里，(目标 − Q) 是误差项，符号给方向、大小给幅度；α 才是步长。' +
            '两者分工明确，把它俩混起来是初学最常见的错。',
          e: [
            '错。步长是 α，是另一个因子。误差项本身不含步长信息。',
            '对。偏差为正就上调，为负就下调，偏多少就挪多少乘以步长。',
            '错。误差可正可负，估计值会上下波动，不保证单调。',
            '错。它只是把噪声按比例摊进估计里，噪声依然在，只是被平均掉一部分。'
          ]
        },
        {
          q: '把「每天完成订单数」直接当作物流调度的奖励，最可能出现的问题是？',
          o: [
            '奖励值溢出，训练中断',
            '状态空间过大，表格存不下',
            '智能体偏向容易完成的订单，指标好看但积压与空驶上升',
            '探索不足，收敛速度变慢'
          ],
          a: 2,
          w: '奖励只覆盖了目标的一个维度，剩下的维度就成了可以被牺牲的东西。' +
            '判断方法是问一句「如果我是优化器，怎么作弊」。',
          e: [
            '错。数值范围是工程细节，归一化一下就能解决，不是设计缺陷。',
            '错。状态空间由问题决定，与奖励写成什么无关。',
            '对。完成数只覆盖目标的一个维度，优化器会挑软柿子捏，把积压和空驶留在奖励之外。',
            '错。探索效率不受影响。受影响的是「收敛到哪里」，不是「收敛多快」——' +
              '它会很高效地收敛到一个糟糕的策略。'
          ]
        },
        {
          q: 'ε 固定为 0.1 且 Q 已停止更新，此时智能体的行为是？',
          o: [
            '仍有约十分之一的机会随机选，且这部分随机不再带来收益',
            '完全确定，总是选 Q 最大的臂',
            '完全随机，与 Q 无关',
            '在最优臂与次优臂之间交替'
          ],
          a: 0,
          w: 'Q 停止更新只说明策略不再改进，ε 这一项照常起作用。这时的随机纯属浪费——' +
            '它已经知道哪台最好，却还在按固定比例把机会送出去。',
          e: [
            '对。每十次仍有一次闭眼乱选，而且这部分随机已经学不到新东西了。',
            '错。那是 ε = 0 时的行为。只要 ε 不为 0，行为就不会收敛到确定。',
            '错。九成的机会仍在走贪心，只是有一成随机。',
            '错。贪心部分永远指向同一个 argmax，没有平局就不会交替。'
          ]
        },
        {
          q: '下棋程序已知完整规则，并在内部搜索到终局。这一做法属于？',
          o: [
            '无模型强化学习',
            '监督学习',
            '模仿学习',
            '规划'
          ],
          a: 3,
          w: '已知环境模型、在内部推演而不作用于真实环境，是规划。' +
            '分界是「有没有从真实交互中取回信息」。AlphaGo 两者都有：' +
            '蒙特卡洛树搜索是规划，策略与价值网络是学习。',
          e: [
            '错。无模型恰好相反：不知道规则，只能靠试出来的结果更新。',
            '错。没有标注样本，也没有「正确走法」的答案可比对。',
            '错。模仿学习要有专家轨迹作参照，这里用的是规则本身。',
            '对。规则已知，在内部推演，不作用于真实环境，这是规划。'
          ]
        }
      ]
    }

  };

  /* =======================================================================
     工具
     ======================================================================= */

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function ensureCss() {
    if (document.querySelector('link[data-rl-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS_HREF;
    l.setAttribute('data-rl-css', '1');
    document.head.appendChild(l);
  }

  /* =======================================================================
     渲染与判分
     ======================================================================= */

  function grade(c, total) {
    var r = c / total;
    if (r === 1) return '全对。概念边界已经清楚，可以进第二篇。';
    if (r >= 0.83) return '主干已经立住，错的几题回看对应小节即可。';
    if (r >= 0.58) return '大方向对，个别概念还在互相串。把错题解析读一遍再重做。';
    return '建议先回读第二、四、五节，再回来重做一遍。';
  }

  function mount(root) {
    var id = root.getAttribute('data-quiz');
    var bank = BANK[id];
    if (!bank) return;

    var items = bank.items;
    var total = items.length;
    var answered = 0;
    var correct = 0;

    root.innerHTML = '';

    /* ---- 头部 ---- */
    var hd = el('div', 'qz-hd');
    hd.appendChild(el('b', 'qz-title')).textContent = bank.title;
    var score = el('span', 'qz-score');
    hd.appendChild(score);
    root.appendChild(hd);

    var list = el('div', 'qz-list');
    root.appendChild(list);

    var rows = [];

    items.forEach(function (it, i) {
      var box = el('div', 'qz-q');

      var stem = el('p', 'qz-stem');
      stem.innerHTML = '<span class="qz-no">' + (i + 1) + '</span>' + it.q;
      box.appendChild(stem);

      var opts = el('div', 'qz-opts');
      var btns = [];

      it.o.forEach(function (text, j) {
        var b = el('button', 'qz-opt');
        b.type = 'button';
        b.innerHTML = '<span class="qz-key">' + KEY[j] + '</span>' +
          '<span class="qz-txt"><span class="qz-label">' + text + '</span></span>';
        b.addEventListener('click', function () { pick(i, j); });
        opts.appendChild(b);
        btns.push(b);
      });

      box.appendChild(opts);

      var why = el('p', 'qz-why');
      why.hidden = true;
      box.appendChild(why);

      list.appendChild(box);
      rows.push({ box: box, btns: btns, why: why, done: false });
    });

    /* ---- 底部 ---- */
    var ft = el('div', 'qz-ft');
    var hint = el('span', 'qz-hint');
    hint.textContent = '点选项即判，答完一题四个选项各自给出说明。';
    ft.appendChild(hint);
    var again = el('button', 'qz-again');
    again.type = 'button';
    again.textContent = '重做';
    again.addEventListener('click', reset);
    ft.appendChild(again);
    root.appendChild(ft);

    function pick(i, j) {
      var row = rows[i];
      if (row.done) return;
      row.done = true;
      answered++;

      var it = items[i];
      var ok = j === it.a;
      if (ok) correct++;

      row.btns.forEach(function (b, k) {
        b.disabled = true;
        if (k === it.a) b.classList.add('ok');
        else if (k === j) b.classList.add('no');

        // 每一项都补一句说明：对的说清对在哪，错的说清错在哪
        var txt = b.querySelector('.qz-txt');
        var note = el('span', 'qz-note');
        note.className = 'qz-note' + (k === it.a ? ' yes' : (k === j ? ' bad' : ''));
        note.innerHTML = (k === it.a ? '✔ ' : '✘ ') + it.e[k];
        txt.appendChild(note);
      });

      row.why.hidden = false;
      row.why.className = 'qz-why ' + (ok ? 'ok' : 'no');
      row.why.innerHTML = '<b>' + (ok ? '答对' : '答错，正确答案是 ' + KEY[it.a]) + '</b>' +
        '<span class="qz-why-t">' + it.w + '</span>';

      sync();
    }

    function sync() {
      var txt = '已答 ' + answered + ' / ' + total;
      if (answered > 0) txt += ' · 答对 ' + correct;
      score.textContent = txt;

      if (answered === total) {
        hint.textContent = total + ' 题答对 ' + correct + '。' + grade(correct, total);
        root.setAttribute('data-done', '1');
      } else {
        hint.textContent = '还剩 ' + (total - answered) + ' 题。';
      }
    }

    function reset() {
      answered = 0;
      correct = 0;
      rows.forEach(function (row) {
        row.done = false;
        row.why.hidden = true;
        row.why.className = 'qz-why';
        row.why.innerHTML = '';
        row.btns.forEach(function (b) {
          b.disabled = false;
          b.classList.remove('ok', 'no');
          var note = b.querySelector('.qz-note');
          if (note) note.parentNode.removeChild(note);
        });
      });
      root.removeAttribute('data-done');
      sync();
      hint.textContent = '点选项即判，答完一题四个选项各自给出说明。';
    }

    sync();
  }

  /* =======================================================================
     启动
     ======================================================================= */

  function boot() {
    var nodes = document.querySelectorAll('.rl-quiz[data-quiz]');
    if (!nodes.length) return;
    ensureCss();
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.getAttribute('data-quiz-ready') === '1') continue;
      n.setAttribute('data-quiz-ready', '1');
      try {
        mount(n);
      } catch (e) {
        n.textContent = '题目加载失败：' + (e && e.message ? e.message : e);
      }
    }
  }

  window.LY_QUIZ = { boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
