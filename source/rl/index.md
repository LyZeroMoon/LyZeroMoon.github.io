---
title: 强化学习实验室
subtitle: 每个概念一个实验
layout: page
permalink: rl/
comment: false
---

这里的实验都能直接操作：拖参数、单步执行、换策略，看算法一步步学出来。

不是录屏，不是动图。页面上跑的是真的程序，每一次更新都算在浏览器里。

**先读：** [（零）学习路线与阅读方法](/2026/11/06/强化学习rl零学习路线与阅读方法/)——AI 有哪几类训练方法、深度学习与强化学习是什么关系、这套专栏为什么按这个顺序排，以及每篇该怎么读。

<div class="rl-index">

<a class="rl-card live" href="/2026/11/06/强化学习rl一什么是强化学习/">
<em>01</em>
<b>十臂老虎机</b>
<span>亲手拉，再让三种策略自己拉，对比探索与利用</span>
</a>

<a class="rl-card" href="/2026/11/07/强化学习rl二马尔可夫决策过程/">
<em>02</em>
<b>钥匙门</b>
<span>从一条判据出发，一层层搭到 MDP；最后一扇锁着的门验收</span>
</a>

<div class="rl-card soon">
<em>03</em>
<b>折扣因子</b>
<span>拖 γ，看同一个策略的价值排序怎么变</span>
</div>

<div class="rl-card soon">
<em>04</em>
<b>价值迭代</b>
<span>价值从终点一圈圈扩散到全图</span>
</div>

<div class="rl-card soon">
<em>05</em>
<b>策略迭代</b>
<span>评估与改进交替，策略快照逐轮切换</span>
</div>

<div class="rl-card soon">
<em>06</em>
<b>蒙特卡洛</b>
<span>同一状态采样多次，方差肉眼可见</span>
</div>

<div class="rl-card soon">
<em>07</em>
<b>悬崖行走</b>
<span>SARSA 绕远路，Q-learning 贴着崖走</span>
</div>

<div class="rl-card soon">
<em>08</em>
<b>探索的定价</b>
<span>UCB 与汤普森采样同台，看不确定性怎么被折算</span>
</div>

<div class="rl-card soon">
<em>09</em>
<b>状态聚合</b>
<span>从查表到函数逼近，参数量与精度的取舍</span>
</div>

<div class="rl-card soon">
<em>10</em>
<b>DQN 消融</b>
<span>关掉经验回放和目标网络，看曲线怎么崩</span>
</div>

<div class="rl-card soon">
<em>11</em>
<b>REINFORCE</b>
<span>动作概率分布随训练变形，策略自己浮现</span>
</div>

<div class="rl-card soon">
<em>12</em>
<b>PPO</b>
<span>拖动裁剪范围，看更新被卡在哪</span>
</div>

</div>

## 使用说明

**手动模式** 由你操作，环境只回一个数。目的是在动手的过程中撞上那个绕不开的矛盾：继续押注看起来最好的，还是花一次机会去确认别的是不是更好。

**自动模式** 交给算法，可以随时暂停、换策略、拖参数。左边是估计值，黑短线是隐藏的真实均值——两者的距离就是当前的学习进度。

所有计算都在本地完成，不联网、不上传数据。刷新页面即重置。

文章在 [强化学习RL 专栏](/categories/强化学习RL/)。标着「可玩」的卡片能直接操作，其余是还没做出来的面板；没有面板的篇目用文字推演同一个结论，读完再回来动手效果最好。
