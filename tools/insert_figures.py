# -*- coding: utf-8 -*-
"""把生成的函数图像插入到对应文章的合适位置（幂等，重复运行不会重复插入）。"""
import io, os

ROOT = os.path.join(os.path.dirname(__file__), "..", "source")
POSTS = os.path.join(ROOT, "_posts")
NOTES = os.path.join(ROOT, "notes")

B = {
"periodic": (
"![周期序列与非周期序列的采样点对比](/images/dsp/dsp01-periodic.svg)\n"
"\n"
"> 上图：蓝色是 $\\sin(\\pi n/4)$ 的采样点（落在连续正弦上且**每隔 8 点重复**），橙色是 $\\sin(\\sqrt{2}\\,n)$ 的采样点（永不重复）。采样点是否重复，正是离散正弦是否周期的判据。\n"),
"timeinv": (
"![时不变性：输入平移，输出同样平移](/images/dsp/dsp02-timeinv.svg)\n"
"\n"
"> 上图：把输入整体右移 2 个采样点（橙），经过同一个系统后，输出也恰好右移 2 个采样点（橙）。系统不随时间改变——这就是**时不变性**。\n"),
"energy": (
"![能量信号（衰减）与功率信号（恒定）](/images/dsp/dsp03-energy.svg)\n"
"\n"
"> 上图：左蓝 $0.8^n u[n]$ 逐点衰减 → 能量有限（能量信号）；右橙 $u[n]$ 恒为 1 → 能量无穷但功率有限（功率信号）。\n"),
"autocorr": (
"![矩形脉冲与其自相关（三角形）](/images/dsp/dsp04-autocorr.svg)\n"
"\n"
"> 上图：一个长度为 5 的矩形脉冲（左），它的自相关是一个底边为 9、顶点在 $m=0$ 的等腰三角形（右）。自相关总在 $m=0$ 处取最大值，且是偶函数。\n"),
"wk": (
"![维纳-辛钦：时域自相关 ↔ 频域功率谱](/images/dsp/dsp05-wienerkhinchin.svg)\n"
"\n"
"> 上图：左为衰减的自相关 $r[m]=0.7^{|m|}$，经 DTFT 得到右端功率谱 $P(\\omega)=\\frac{1-0.7^2}{1-2\\cdot0.7\\cos\\omega+0.7^2}$。时域与频域互为 DTFT 对。\n"),
"psd": (
"![功率谱密度形状对比](/images/dsp/dsp06-psd.svg)\n"
"\n"
"> 上图：灰线是白噪声（功率谱平坦，各频率能量相同）；蓝线是一阶系统的功率谱，能量集中在低频（低通特性）。功率谱描述的是“功率随频率怎么分布”。\n"),
"conv": (
"![卷积：矩形 ⊛ 矩形 = 三角形](/images/dsp/dsp07-conv.svg)\n"
"\n"
"> 上图：两个长度 3 的矩形序列卷积，得到长度 5 的三角序列 $1,2,3,2,1$。卷积结果长度 = 两序列长度之和减 1。\n"),
"resp": (
"![一阶系统的单位脉冲响应与单位阶跃响应](/images/dsp/dsp08-response.svg)\n"
"\n"
"> 上图：同一个一阶系统，给一个脉冲（蓝）得到脉冲响应 $h[n]$，给一个阶跃（橙）得到阶跃响应 $s[n]$。阶跃响应就是脉冲响应的累加。\n"),
"decomp": (
"![全响应 = 零输入响应 + 零状态响应](/images/dsp/dsp09-decomp.svg)\n"
"\n"
"> 上图：以 $y[n]-0.5y[n-1]=u[n]$、$y[-1]=1$ 为例，绿为零输入响应、橙为零状态响应、蓝为二者相加得到的全响应。\n"),
"digfreq": (
"![数字频率的 2π 周期性](/images/dsp/dsp10-digfreq.svg)\n"
"\n"
"> 上图：两条连续正弦 $\\sin(0.3\\pi t)$（蓝）与 $\\sin(2.3\\pi t)$（橙）形状不同，但在整数采样点 $n$ 上取到的**离散值完全相同**（红圈）。数字频率相差 $2\\pi$ 时对应同一个离散序列。\n"),
"alias": (
"![采样后频谱的周期延拓：满足 vs 不满足采样定理](/images/dsp/dsp11-alias.svg)\n"
"\n"
"> 上图：左图为 $f_s>2f_{\\max}$ 时，基带频谱的周期延拓互不重叠，可无失真恢复；右图为 $f_s<2f_{\\max}$ 时各副本重叠（红），高频被折回低频 → **混叠**。\n"),
"cascade": (
"![级联系统的整体幅频响应](/images/dsp/dsp12-cascade.svg)\n"
"\n"
"> 上图：一个低通子系统与一个陷波子系统级联后，整体幅频响应 $|H(e^{j\\omega})|$ 同时具备“低通形状”和“在陷波频率 $\\omega=\\pi/2$ 处下陷”两个特征——级联即频率响应的相乘。\n"),
"zplane": (
"![z 平面：极点、零点与收敛域 ROC](/images/dsp/dsp13-zplane.svg)\n"
"\n"
"> 上图：复平面单位圆（虚线）上，$z=0.5$ 处一个极点（红 ×）、$z=-0.5$ 处一个零点（蓝 ○）。因果序列的 ROC 是极点之外、不含极点的区域（蓝色，$|z|>0.5$）。\n"),
"roc": (
"![四类序列的收敛域 ROC 形状](/images/dsp/dsp-note-roc.svg)\n"
"\n"
"> 上图：因果（右边）序列 ROC 在最外极点之外；反因果（左边）在原点之内；双边序列 ROC 是两极点之间的圆环；有限长序列 ROC 为除 $z=0$ 或 $z=\\infty$ 外的全平面。\n"),
}

PLAN = [
    (os.path.join(POSTS, "DSP_ONE.md"), "## 二、判断公式", B["periodic"]),
    (os.path.join(POSTS, "DSP_two.md"), "## 三、时不变性（Time-Invariance）", B["timeinv"]),
    (os.path.join(POSTS, "数字信号处理dsp三能量信号和功率信号.md"), "## 三、分类标准", B["energy"]),
    (os.path.join(POSTS, "数字信号处理dsp四.md"), "### 1. 自相关函数（Autocorrelation Function）", B["autocorr"]),
    (os.path.join(POSTS, "数字信号处理dsp五维纳-辛钦定理wiener-khinchin-theorem.md"), "## 二、定理内容", B["wk"]),
    (os.path.join(POSTS, "数字信号处理dsp六功率谱密度.md"), "## 三、功率谱密度的物理意义", B["psd"]),
    (os.path.join(POSTS, "数字信号处理dsp七卷积和.md"), "## 三、卷积的物理意义", B["conv"]),
    (os.path.join(POSTS, "数字信号处理dsp八离散时间系统的各种响应概念详解.md"), "## 二、五大核心响应概念", B["resp"]),
    (os.path.join(POSTS, "数字信号处理dsp九离散时间系统的时域解法.md"), "### 3. 全响应 = 零输入 + 零状态", B["decomp"]),
    (os.path.join(POSTS, "数字信号处理dsp十模拟频率与数字频率的关系.md"), "### 1. 为什么数字频率是周期的？", B["digfreq"]),
    (os.path.join(POSTS, "数字信号处理dsp十一奈奎斯特采样定理.md"), "## 四、混叠（Aliasing）", B["alias"]),
    (os.path.join(POSTS, "数字信号处理dsp十二系统互联.md"), "## 三、级联（串联）", B["cascade"]),
    (os.path.join(POSTS, "数字信号处理dsp十三z变换与收敛域.md"), "## 三、收敛域（ROC）", B["zplane"]),
    (os.path.join(NOTES, "z-变换表与性质.md"), "## 一、定义", B["roc"]),
]

for path, anchor, block in PLAN:
    t = io.open(path, encoding="utf-8").read()
    if anchor not in t:
        print("!! 锚点未找到：", path, "->", anchor)
        continue
    # 幂等：若图中文件名已出现则跳过
    img = block.split("](")[0].split("![")[1]
    if img in t:
        print("~~ 已插入，跳过：", os.path.basename(path))
        continue
    t = t.replace(anchor, anchor + "\n\n" + block, 1)
    io.open(path, "w", encoding="utf-8", newline="").write(t)
    print("++ 已插入：", os.path.basename(path))
print("完成")
