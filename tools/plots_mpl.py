"""DSP 系列文章函数图生成器（matplotlib 版）

替换原手写 SVG 生成器。优势：
- 真正的数学坐标系、精确曲线、标准刻度与网格
- mathtext 渲染公式标签（CM 字体，转 path 后跨设备一致）
- ROC 区域填充、注释箭头、图例框

用法：python tools/plots_mpl.py
输出：source/images/dsp/*.svg（覆盖同名旧图，文章引用不变）
"""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import MultipleLocator

plt.rcParams.update({
    'font.sans-serif': ['Microsoft YaHei', 'SimHei', 'DejaVu Sans'],
    'axes.unicode_minus': False,
    'mathtext.fontset': 'cm',
    'svg.fonttype': 'path',          # 公式用 CM 字体，必须转路径
    'font.size': 11.5,
    'axes.linewidth': 1.1,
    'axes.labelsize': 12.5,
    'axes.titlesize': 13.5,
    'xtick.labelsize': 11,
    'ytick.labelsize': 11,
    'legend.fontsize': 10.5,
    'figure.dpi': 110,
})

BLUE, RED, GREEN, ORANGE, PURPLE, GREY = (
    '#2c6eb5', '#c0392b', '#1e8449', '#d68910', '#7d3c98', '#6b7280')
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'source', 'images', 'dsp')


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), format='svg',
                bbox_inches='tight', pad_inches=0.1)
    if os.environ.get('PLOT_PNG') == '1':
        root = os.path.dirname(os.path.dirname(os.path.dirname(OUT)))  # blog/
        d = os.path.join(root, '.tmpchk')
        os.makedirs(d, exist_ok=True)
        fig.savefig(os.path.join(d, name.replace('.svg', '.png')),
                    format='png', dpi=100, bbox_inches='tight', pad_inches=0.1)
    plt.close(fig)
    print('  %-28s ok' % name)


def clean(ax, grid=True):
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    if grid:
        ax.grid(alpha=0.22, ls=':', lw=0.8)
    ax.set_axisbelow(True)


def stem(ax, n, x, color, label=None, lw=1.6, ms=6.0):
    """离散序列标准茎叶图"""
    ml, sl, bl = ax.stem(n, x, linefmt='-', markerfmt='o', basefmt=' ')
    plt.setp(sl, color=color, lw=lw)
    plt.setp(ml, color=color, ms=ms, mfc=color, mec='white', mew=0.8)
    if label:
        ml.set_label(label)
    return ml


def gauss_smooth(x, k=25):
    kk = np.ones(k) / k
    return np.convolve(x, kk, mode='same')


# ---------------------------------------------------------------- 01 周期性
def p01():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.2, 6.4))
    n = np.arange(0, 17)
    t = np.linspace(0, 16, 500)

    for ax, w, c, ttl in (
        (a1, np.pi / 4, BLUE, r'周期序列 $x[n]=\sin(\pi n/4)$：每 $N=8$ 点完全重复'),
        (a2, np.sqrt(2), RED, r'非周期序列 $x[n]=\sin(\sqrt{2}\,n)$：采样点永不重复'),
    ):
        ax.plot(t, np.sin(w * t), color=c, alpha=0.22, lw=1.3)
        stem(ax, n, np.sin(w * n), c)
        ax.axhline(0, color='#333', lw=1)
        ax.set_title(ttl)
        ax.set_xlim(-0.6, 16.6)
        ax.set_ylim(-1.42, 1.5)
        ax.xaxis.set_major_locator(MultipleLocator(2))
        ax.set_ylabel(r'幅度')
        clean(ax)

    # 在周期图上标出一个周期
    a1.annotate('', xy=(8, 1.36), xytext=(0, 1.36),
                arrowprops=dict(arrowstyle='<->', color=GREEN, lw=1.6))
    a1.text(4, 1.41, r'一个周期 $N=8$', color=GREEN, ha='center', va='bottom', fontsize=11)
    a1.annotate('', xy=(16, 1.36), xytext=(8, 1.36),
                arrowprops=dict(arrowstyle='<->', color=GREEN, lw=1.6))

    a2.set_xlabel(r'$n$（序列序号）')
    fig.tight_layout(h_pad=2.2)
    save(fig, 'dsp01-periodic.svg')


# ---------------------------------------------------------------- 02 时不变性
def p02():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.2, 6.6))
    n = np.arange(0, 8)
    x = np.array([0, 1, 0.7, 0.35, 0.15, 0.07, 0.03, 0])
    y = np.apply_along_axis(lambda s: 0.9 * s, 0, x)  # y=0.9x，示意用

    a1.vlines(n, 0, x, color=BLUE, lw=2)
    a1.plot(n, x, 'o', color=BLUE, ms=7, mec='white', mew=0.9, label=r'输入 $x[n]$')
    a1.vlines(n + 2, 0, x, color=ORANGE, lw=2, ls='--')
    a1.plot(n + 2, x, 's', color=ORANGE, ms=6.5, mec='white', mew=0.9,
            label=r'移位输入 $x[n-2]$')
    a1.set_title(r'输入：$x[n]$ 整体右移 2，得到 $x[n-2]$')
    a1.set_xlim(-0.6, 11.6)
    a1.set_ylim(-0.08, 1.22)
    a1.xaxis.set_major_locator(MultipleLocator(1))
    a1.legend(loc='upper right', framealpha=0.92)
    clean(a1)

    y0 = 0.9 * x
    a2.vlines(n, 0, y0, color=BLUE, lw=2)
    a2.plot(n, y0, 'o', color=BLUE, ms=7, mec='white', mew=0.9, label=r'输出 $y[n]=T\{x[n]\}$')
    a2.vlines(n + 2, 0, y0, color=ORANGE, lw=2, ls='--')
    a2.plot(n + 2, y0, 's', color=ORANGE, ms=6.5, mec='white', mew=0.9,
            label=r'$y[n-2]$')
    a2.set_title(r'输出：同样右移 2 —— 形状完全不变 $\Rightarrow$ 时不变')
    a2.set_xlabel(r'$n$')
    a2.set_xlim(-0.6, 11.6)
    a2.set_ylim(-0.08, 1.22)
    a2.xaxis.set_major_locator(MultipleLocator(1))
    a2.legend(loc='upper right', framealpha=0.92)
    clean(a2)

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp02-timeinv.svg')


# ---------------------------------------------------------------- 03 能量/功率
def p03():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.4, 4.2))
    n = np.arange(0, 14)
    a = 0.75

    stem(a1, n, a ** n, BLUE, label=r'$0.75^n u[n]$ 幅度衰减')
    stem(a1, n, np.ones_like(n, dtype=float), ORANGE, label=r'$u[n]$ 幅度恒定')
    a1.set_title(r'两种序列的对比')
    a1.set_xlabel(r'$n$')
    a1.set_ylabel(r'幅度')
    a1.set_ylim(-0.06, 1.28)
    a1.legend(loc='center right', framealpha=0.92)
    clean(a1)

    # 能量累积
    n2 = np.arange(0, 40)
    E = np.cumsum((a ** n2) ** 2)
    a2.plot(n2, E, color=BLUE, lw=2.4, label=r'$\sum_{k=0}^{n}| 0.75^k|^2$')
    a2.plot(n2, n2 + 1.0, color=ORANGE, lw=2.2, ls='--', label=r'$\sum_{k=0}^{n}1^2 = n+1$')
    a2.axhline(1 / (1 - a * a), color=BLUE, ls=':', lw=1.4)
    a2.text(20, 1 / (1 - a * a) + 2, r'能量收敛到 $\frac{1}{1-a^2}=2.29$',
            color=BLUE, fontsize=10.5)
    a2.set_title(r'累积能量 $E_N$ 随 $N$ 的变化')
    a2.set_xlabel(r'$N$（累加到第 $N$ 项）')
    a2.set_ylabel(r'累积能量')
    a2.legend(loc='upper left', framealpha=0.92)
    clean(a2)

    fig.tight_layout(w_pad=2.4)
    save(fig, 'dsp03-energy.svg')


# ---------------------------------------------------------------- 04 自相关
def p04():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.8, 4.0),
                                 gridspec_kw={'width_ratios': [1.35, 1]})
    # 左：有限长实序列
    n = np.arange(0, 6)
    x = np.array([1, 1.4, 1.0, 0.5, 0.2, 0])
    stem(a1, n, x, BLUE, label=r'实序列 $x[n]$')
    a1.set_title(r'原序列（实、有限长）')
    a1.set_xlabel(r'$n$')
    a1.set_ylabel(r'幅度')
    a1.set_ylim(-0.1, 1.62)
    a1.legend(loc='upper right', framealpha=0.92)
    clean(a1)

    # 右：自相关（由左图序列真实算出，非估值）
    r = np.correlate(x, x, 'full')
    m = np.arange(-(len(x) - 1), len(x))
    stem(a2, m, r, GREEN, label=r'$r_{xx}[m]$')
    a2.axvline(0, color='#333', lw=1.1, ls='-')
    # 用等高横线指示 r[-2]=r[2]，直观表达偶对称，且不与茎线重叠
    a2.hlines([3.4, 1.9], -2, 2, colors=RED, lw=1.0, ls=':', alpha=0.85)
    a2.annotate(r'峰值 $r_{xx}[0]=E$', xy=(0, 4.25), xytext=(-4.85, 4.45),
                fontsize=10.5, color=GREEN, ha='left',
                arrowprops=dict(arrowstyle='->', color=GREEN, lw=1.2))
    a2.set_title(r'自相关：偶对称（虚线等高）、零延迟最大')
    a2.set_xlabel(r'$m$（延迟）')
    a2.set_ylim(-0.25, 4.9)
    a2.legend(loc='upper right', framealpha=0.92)
    clean(a2)

    fig.tight_layout(w_pad=2.4)
    save(fig, 'dsp04-autocorr.svg')


# ---------------------------------------------------------------- 05 维纳-辛钦
def p05():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.2, 6.8))
    x = np.array([1, 1.4, 1.0, 0.5, 0.2, 0])
    r = np.correlate(x, x, 'full')
    m = np.arange(-(len(x) - 1), len(x))

    stem(a1, m, r, GREEN, label=r'时域：自相关 $r_{xx}[m]$')
    a1.axhline(0, color='#333', lw=1)
    a1.set_title(r'时域：自相关 $r_{xx}[m]$（偶函数、集中、可直接估计）')
    a1.set_xlim(-5.6, 5.6)
    a1.set_ylim(-0.2, 5.2)
    a1.legend(loc='upper right', framealpha=0.92)
    clean(a1)

    w = np.linspace(-np.pi, np.pi, 800)
    P = np.sum(r[:, None] * np.exp(-1j * m[:, None] * w[None, :]), axis=0).real
    a2.plot(w, P, color=BLUE, lw=2.6, label=r'频域：功率谱 $P_{xx}(e^{j\omega})$')
    a2.fill_between(w, 0, P, color=BLUE, alpha=0.13)
    a2.axhline(r[len(x) - 1], color=RED, lw=1.2, ls='--',
               label=r'$r_{xx}[0]$：谱的积分均值')
    a2.set_title(r'频域：功率谱 $P_{xx}(e^{j\omega})=\mathrm{DTFT}\{r_{xx}[m]\}$')
    a2.set_xlabel(r'$\omega$')
    a2.set_xlim(-np.pi, np.pi)
    a2.set_ylim(0, 19.8)
    a2.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    a2.set_xticklabels([r'$-\pi$', r'$-\pi/2$', r'$0$', r'$\pi/2$', r'$\pi$'])
    a2.legend(loc='upper left', framealpha=0.92)
    clean(a2)

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp05-wienerkhinchin.svg')


# ---------------------------------------------------------------- 06 PSD
def p06():
    fig, ax = plt.subplots(figsize=(8.2, 4.4))
    w = np.linspace(-np.pi, np.pi, 800)
    a = 0.8
    white = np.ones_like(w) * 1.0
    ar = 0.36 / (1 - 2 * a * np.cos(w) + a * a)

    ax.plot(w, white, color=GREY, lw=2.2, ls='--',
            label=r'白噪声：$P(\omega)=\sigma^2$ 全频带平坦')
    ax.plot(w, ar, color=BLUE, lw=2.6,
            label=r'一阶 AR：$P(\omega)=\frac{\sigma_w^2}{| 1-ae^{-j\omega}|^2}$')
    ax.fill_between(w, 0, ar, color=BLUE, alpha=0.12)
    ax.axhline(0, color='#333', lw=0.9)
    ax.set_xlim(-np.pi, np.pi)
    ax.set_ylim(0, 2.35)
    ax.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    ax.set_xticklabels([r'$-\pi$', r'$-\pi/2$', r'$0$', r'$\pi/2$', r'$\pi$'])
    ax.set_xlabel(r'数字角频率 $\omega$')
    ax.set_ylabel(r'$P_{xx}(e^{j\omega})$')
    ax.set_title(r'功率谱密度：平坦（白）vs 低频集中（有色）')
    ax.annotate(r'低频能量集中', xy=(0.35, 1.9), xytext=(1.05, 2.05), fontsize=11,
                color=BLUE, arrowprops=dict(arrowstyle='->', color=BLUE, lw=1.3))
    ax.annotate(r'各频率等能量', xy=(-2.2, 1.0), xytext=(-3.0, 1.55), fontsize=10.5,
                color=GREY, arrowprops=dict(arrowstyle='->', color=GREY, lw=1.1))
    ax.legend(loc='upper center', framealpha=0.94)
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp06-psd.svg')


# ---------------------------------------------------------------- 07 卷积
def p07():
    fig, axes = plt.subplots(3, 1, figsize=(8.4, 8.2),
                             gridspec_kw=dict(height_ratios=[1.0, 1.55, 1.0]))
    # 两个等宽矩形序列（柱+茎区分，避免完全重叠遮挡）
    kx = np.arange(0, 4)
    kh = np.arange(0, 4)
    NW = 4

    stem(axes[0], kx, np.ones_like(kx, dtype=float), BLUE,
         label=r'$x[k]$：宽 4（$k=0\ldots3$）')
    axes[0].bar(kh, np.ones_like(kh, dtype=float), width=0.44, color=ORANGE,
                alpha=0.45, edgecolor=ORANGE, lw=1.2,
                label=r'$h[k]$：宽 4（$k=0\ldots3$）')
    axes[0].set_title(r'$x[k]$ 与 $h[k]$：两个等宽矩形（细柱为 $h$，带点茎为 $x$）')
    axes[0].set_xlim(-4.6, 7.2)
    axes[0].set_xticks(np.arange(-3, 8))
    axes[0].set_ylim(-0.08, 1.45)
    axes[0].set_yticks([0, 0.5, 1.0])
    axes[0].legend(loc='upper right', ncol=1, framealpha=0.92)
    clean(axes[0])

    # ②③④ 步：h 翻转 + 右移 n=2，与 x[k] 逐点相乘再求和
    # 关键画法：x[k] 与 h[n-k] 的每根高度都是 1，若画在同一基线上会完全重合，
    # 「右移 2 格」就看不出来 —— 所以分两层画，并用灰点标出翻转后【未移】的位置。
    n0 = 2
    yx, yh = 0.0, 1.95              # 两层基线：x 在下、h 在上
    kf = np.arange(n0 - NW + 1, n0 + 1)      # h[n-k] 非零处：k=-1,0,1,2
    kg = np.arange(-(NW - 1), 1)             # h[-k] 非零处：k=-3..0（未右移）
    ytop = yh + 1.0                          # 红茎顶端 = 2.95

    # 两层同时有值的列（重叠列）—— 淡紫色竖条贯穿两层，说明"这 3 列相乘非零"
    ovk = np.intersect1d(kx, kf)
    y0, y1 = -0.35, 3.55
    for k in ovk:
        axes[1].axvspan(k - 0.30, k + 0.30,
                        ymin=(yx - y0) / (y1 - y0), ymax=(ytop - y0) / (y1 - y0),
                        color=PURPLE, alpha=0.13, zorder=0)

    # 下层 x[k]：填充柱 + 顶端圆点（柱是实心块，一眼看出是一段连续支撑）
    axes[1].bar(kx, np.ones(4), bottom=yx, width=0.58, color=BLUE,
                alpha=0.30, edgecolor=BLUE, lw=1.2, zorder=3,
                label=r'$x[k]$：宽 4，不动')
    axes[1].plot(kx, np.full(4, yx + 1.0), 'o', color=BLUE, ms=6.0,
                 mfc=BLUE, mec='white', mew=0.8, zorder=4)
    axes[1].axhline(yx, color='#555', lw=1.0, zorder=2)

    # 上层 h[n-k]：灰点 = 翻转后【未移】的位置（k=-3..0），画矮一点，
    # 这样 k=-1、0 两处即使与红茎同列，灰叉也不会被盖住 —— 否则"翻转"看不出来
    axes[1].vlines(kg, yh, yh + 0.58, color=GREY, ls=':', lw=1.3, alpha=0.9, zorder=2)
    axes[1].plot(kg, np.full(len(kg), yh + 0.58), 'x', color=GREY, ms=6.0,
                 mew=1.4, label=r'$h[-k]$：翻转后未移', zorder=2)
    axes[1].vlines(kf, yh, ytop, color=RED, lw=1.7, zorder=4)
    axes[1].plot(kf, np.full(len(kf), ytop), 'o', color=RED, ms=6.0,
                 mfc=RED, mec='white', mew=0.8, zorder=5,
                 label=r'$h[n-k]$：再右移 $n=2$')
    axes[1].axhline(yh, color='#555', lw=1.0, zorder=2)

    # 「每根右移 2 格」的箭头：从灰点最左端 k=-3 指到红茎最左端 k=-1，恰好 2 格
    axes[1].annotate('', xy=(-1.0, 1.42), xytext=(-3.0, 1.42),
                     arrowprops=dict(arrowstyle='<->', color=ORANGE, lw=1.6))
    axes[1].text(-2.0, 1.47, r'每根右移 $n=2$ 格', ha='center', va='bottom',
                 fontsize=10.5, color=ORANGE)

    # 左侧行标（代替 y 轴刻度：两层各自从 0 起，高度都是 1，纵轴数值无意义）
    axes[1].text(-4.5, yx + 0.5, r'$x[k]$', ha='left', va='center',
                 fontsize=12.5, color=BLUE)
    axes[1].text(-4.5, yh + 0.5, r'$h[n-k]$', ha='left', va='center',
                 fontsize=12.5, color=RED)
    axes[1].set_title(r'翻转并右移 $n=2$ 后，只有 $k=0,1,2$ 三列两层同时有值'
                      r' $\Rightarrow y[2]=1+1+1=3$')
    axes[1].set_xlabel(r'$k$')
    axes[1].set_xlim(-4.6, 7.2)
    axes[1].set_ylim(y0, y1)
    axes[1].set_yticks([])
    axes[1].set_xticks(np.arange(-3, 8))
    axes[1].legend(loc='upper right', ncol=1, framealpha=0.92, fontsize=9.8)
    clean(axes[1])

    # 结果：真三角（等宽矩形卷积）
    yv = np.convolve(np.ones(NW), np.ones(NW))
    yk = np.arange(0, len(yv))
    stem(axes[2], yk, yv, GREEN, label=r'$y[n]=x[n]*h[n]$')
    axes[2].axhline(0, color='#333', lw=1)
    axes[2].set_title(r'结果：宽 4 $\ast$ 宽 4 = 三角（$1,2,3,4,3,2,1$，无平顶）')
    axes[2].set_xlabel(r'$n$')
    axes[2].set_xlim(-0.9, 7.2)
    axes[2].set_ylim(-0.15, 5.35)
    axes[2].set_xticks(np.arange(0, 7))
    axes[2].annotate(r'长度 $4+4-1=7$，峰值 $=\min(4,4)=4$',
                     xy=(3, 4.0), xytext=(0.15, 4.55), fontsize=10.5, color=GREEN,
                     arrowprops=dict(arrowstyle='->', color=GREEN, lw=1.2))
    axes[2].legend(loc='upper right', framealpha=0.92)
    clean(axes[2])

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp07-conv.svg')


# ---------------------------------------------------------------- 08 各种响应
def p08():
    fig, ax = plt.subplots(figsize=(8.4, 4.6))
    n = np.arange(0, 12)
    zi = 0.5 ** (n + 1)             # 零输入：仅由初始状态
    zs = 2 * (1 - 0.5 ** (n + 1))   # 零状态：仅由输入
    tot = zi + zs

    ax.vlines(n, 0, tot, color=BLUE, lw=2.0, alpha=0.55, label=r'全响应 $y[n]$')
    ax.plot(n, tot, 'o-', color=BLUE, ms=6, lw=1.3, mec='white', mew=0.8)
    ax.plot(n, zi, 's--', color=GREEN, ms=6, lw=1.6, mec='white', mew=0.8,
            label=r'零输入响应 $y_{zi}[n]$（仅初始状态）')
    ax.plot(n, zs, '^--', color=ORANGE, ms=6.5, lw=1.6, mec='white', mew=0.8,
            label=r'零状态响应 $y_{zs}[n]$（仅输入）')
    ax.axhline(tot[-1], color=GREY, ls=':', lw=1.2)
    ax.text(7.4, tot[-1] + 0.07, r'稳态 $y[\infty]=2$', color=GREY, fontsize=10.5)
    ax.set_xlabel(r'$n$')
    ax.set_ylabel(r'幅度')
    ax.set_title(r'全响应 = 零输入响应 + 零状态响应（两者可分别求解后相加）')
    ax.set_ylim(-0.1, 2.35)
    ax.legend(loc='lower right', framealpha=0.94)
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp08-response.svg')


def p08b():
    """（八）单位脉冲响应 h[n] 与单位阶跃响应 s[n] 的关系：s 是 h 的累加"""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 6.2))
    n = np.arange(0, 11)
    h = 0.6 ** n
    s = np.cumsum(h)          # s[n] = Σ_{k=0}^{n} h[k] → 1/(1-0.6)=2.5

    stem(a1, n, h, BLUE, label=r'单位脉冲响应 $h[n]=0.6^{\,n}u[n]$')
    a1.set_title('单位脉冲响应 h[n]：输入一个 δ[n] 得到的输出')
    a1.set_ylabel(r'幅度')
    a1.set_ylim(-0.1, 1.25)
    a1.set_xlim(-0.6, 10.6)
    a1.legend(loc='upper right', framealpha=0.92)
    clean(a1)

    stem(a2, n, s, ORANGE, label=r'单位阶跃响应 $s[n]=\sum_{k=0}^{n}h[k]$')
    a2.axhline(2.5, color=GREY, ls=':', lw=1.3)
    a2.text(0.1, 2.62, r'稳态 $s[\infty]=\frac{1}{1-0.6}=2.5$', color=GREY, fontsize=10.5)
    a2.set_title('单位阶跃响应 s[n]：输入一个 u[n] 得到的输出（逐点累加 h）')
    a2.set_xlabel(r'$n$')
    a2.set_ylabel(r'幅度')
    a2.set_ylim(-0.15, 3.65)
    a2.set_xlim(-0.6, 10.6)
    a2.legend(loc='upper right', framealpha=0.92)
    clean(a2)

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp08-step.svg')


# ---------------------------------------------------------------- 09 时域解法
def p09():
    fig, ax = plt.subplots(figsize=(8.4, 4.6))
    n = np.arange(0, 12)
    homo = 1.0 * 0.6 ** n          # 齐次解（自然响应）
    part = 1.5 * np.ones_like(n, dtype=float)  # 特解（受迫响应）
    tot = homo + part

    ax.plot(n, part, '--', color=ORANGE, lw=1.8, label=r'特解 $y_p[n]=1.5$（受迫）')
    ax.plot(n, homo, '--', color=GREEN, lw=1.8, label=r'齐次解 $y_h[n]=0.6^n$（自然）')
    ax.plot(n, tot, 'o-', color=BLUE, lw=2.4, ms=6, mec='white', mew=0.8,
            label=r'全解 $y[n]=y_h[n]+y_p[n]$')
    ax.fill_between(n, part, tot, color=GREEN, alpha=0.10)
    ax.set_xlabel(r'$n$')
    ax.set_ylabel(r'幅度')
    ax.set_title(r'全解 = 齐次解（暂态，随时间消失）+ 特解（稳态，长期保留）')
    ax.set_ylim(0, 3.1)
    ax.annotate(r'过渡过程：齐次解衰减', xy=(2.2, 2.0), xytext=(4.0, 2.72),
                fontsize=10.5, color=GREEN,
                arrowprops=dict(arrowstyle='->', color=GREEN, lw=1.2))
    ax.legend(loc='center right', framealpha=0.94)
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp09-decomp.svg')


# ---------------------------------------------------------------- 10 数字频率周期
def p10():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.2, 6.4))
    # 上：omega 与 omega+2pi 给出同一序列
    t = np.linspace(0, 10, 400)
    w0 = np.pi / 3
    a1.plot(t, np.cos(w0 * t), color=BLUE, lw=2.2, label=r'$\cos(\omega_0 t)$')
    a1.plot(t, np.cos((w0 + 2 * np.pi) * t), color=RED, lw=1.6, ls='--',
            label=r'$\cos[(\omega_0+2\pi)t]$（连续域不同！）')
    a1.set_title(r'连续域：$\omega_0$ 与 $\omega_0+2\pi$ 是两个不同的信号')
    a1.set_xlabel(r'$t$')
    a1.legend(loc='upper right', ncol=2, framealpha=0.92)
    a1.set_ylim(-1.6, 1.9)
    clean(a1)

    n = np.arange(0, 11)
    a2.plot(t, np.cos(w0 * t), color=BLUE, alpha=0.22, lw=1.3)
    stem(a2, n, np.cos(w0 * n), BLUE, label=r'$\cos(\omega_0 n)$ 采样点')
    stem(a2, n, np.cos((w0 + 2 * np.pi) * n), RED)
    a2.set_title(r'离散域：$\cos[(\omega_0+2\pi)n]=\cos(\omega_0 n)$ $\Rightarrow$ 数字频率以 $2\pi$ 为周期')
    a2.set_xlabel(r'$n$')
    a2.set_ylim(-1.42, 1.5)
    a2.legend(loc='upper right', framealpha=0.92)
    clean(a2)

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp10-digfreq.svg')


# ---------------------------------------------------------------- 11 混叠
def p11():
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 6.6))
    w = np.linspace(-3 * np.pi, 3 * np.pi, 4000)

    def tri(wc, half):
        return np.clip(1 - np.abs(w - wc) / half, 0, None)

    # 上：满足采样定理，半宽 < pi，副本互不重叠
    h1 = np.pi * 0.7
    b = tri(0, h1)
    c_p, c_m = tri(2 * np.pi, h1), tri(-2 * np.pi, h1)
    a1.plot(w, b, color=BLUE, lw=2.6, label=r'基带谱')
    a1.plot(w, c_p, color=GREY, lw=1.8, ls='--', label=r'延拓副本（$\pm2\pi$）')
    a1.plot(w, c_m, color=GREY, lw=1.8, ls='--')
    a1.fill_between(w, 0, b, color=BLUE, alpha=0.13)
    a1.annotate('', xy=(np.pi, 0.30), xytext=(h1, 0.30),
                arrowprops=dict(arrowstyle='<->', color=GREEN, lw=1.5))
    a1.text((np.pi + h1) / 2, 0.35, r'空隙', color=GREEN, ha='center', fontsize=10.5)
    a1.set_title(r'满足 $\omega_{\max}<\pi$：副本不重叠 $\Rightarrow$ 可用理想低通原样取出')
    a1.set_ylim(0, 1.28)
    a1.legend(loc='upper right', ncol=2, framealpha=0.94)

    # 下：违反采样定理，半宽 > pi，副本与基带重叠
    h2 = np.pi * 1.28
    b = tri(0, h2)
    c_p, c_m = tri(2 * np.pi, h2), tri(-2 * np.pi, h2)
    a2.plot(w, b, color=BLUE, lw=2.6, label=r'基带谱（过宽）')
    a2.plot(w, c_p, color=GREY, lw=1.8, ls='--', label=r'延拓副本（$\pm2\pi$）')
    a2.plot(w, c_m, color=GREY, lw=1.8, ls='--')
    # 重叠区填充
    a2.fill_between(w, 0, np.minimum(b, c_p), color=RED, alpha=0.42)
    a2.fill_between(w, 0, np.minimum(b, c_m), color=RED, alpha=0.42)
    for xv in (np.pi, -np.pi):
        a2.axvline(xv, color=RED, lw=1.3, ls=':')
    a2.set_title(r'违反 $\omega_{\max}>\pi$：副本与基带重叠 $\Rightarrow$ 混叠，不可恢复')
    a2.set_ylim(0, 1.28)
    a2.legend(loc='upper right', ncol=2, framealpha=0.94)
    a2.annotate(r'重叠区 = 混叠（高频折叠成低频）', xy=(1.12 * np.pi, 0.10),
                xytext=(1.55 * np.pi, 0.62), fontsize=10.5, color=RED,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.3))

    for ax in (a1, a2):
        ax.set_xlim(-3 * np.pi, 3 * np.pi)
        ax.set_xticks([-2 * np.pi, -np.pi, 0, np.pi, 2 * np.pi])
        ax.set_xticklabels([r'$-2\pi$', r'$-\pi$', r'$0$', r'$\pi$', r'$2\pi$'])
        ax.set_ylabel(r'频谱幅度')
        clean(ax)
    a2.set_xlabel(r'$\omega$（频谱以 $2\pi$ 为周期延拓）')

    fig.tight_layout(h_pad=2.0)
    save(fig, 'dsp11-alias.svg')


# ---------------------------------------------------------------- 12 级联
def p12():
    """级联：低通 × 二阶陷波。陷波器零点在单位圆上的 e^{±jπ/2}，所以 ω=π/2 处真为 0。"""
    fig, ax = plt.subplots(figsize=(8.4, 4.6))
    w = np.linspace(-np.pi, np.pi, 2400)
    a = 0.85
    H1 = 1 / np.sqrt(1 - 2 * a * np.cos(w) + a * a)
    H1 = H1 / H1.max()                    # 直流归一化到 1

    r, w0 = 0.80, np.pi / 2
    z1 = np.exp(-1j * w)
    num = 1 - 2 * np.cos(w0) * z1 + z1 ** 2          # 零点在 e^{±jω0}（单位圆上）
    den = 1 - 2 * r * np.cos(w0) * z1 + r * r * z1 ** 2  # 极点在同一角度、半径 r
    H2 = np.abs(num / den)
    H2 = H2 / H2.max()                    # 陷波器通带归一化到 1
    Ht = H1 * H2

    ax.plot(w, H1, color=GREY, lw=1.7, ls='--', label=r'$|H_1|$：一阶低通（极点在 0.85）')
    ax.plot(w, H2, color=ORANGE, lw=1.7, ls='--', label=r'$|H_2|$：二阶陷波（零点 $e^{\pm j\pi/2}$）')
    ax.plot(w, Ht, color=BLUE, lw=2.9, label=r'级联 $|H|=|H_1|\cdot|H_2|$')
    ax.axvline(np.pi / 2, color=RED, lw=1.3, ls=':')
    ax.annotate(r'陷波频率 $\omega_0=\pi/2$：$|H|=0$',
                xy=(np.pi / 2, 0.0), xytext=(2.10, 0.55),
                fontsize=10.5, color=RED,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.2))
    ax.set_xlim(-np.pi, np.pi)
    ax.set_ylim(0, 1.24)
    ax.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    ax.set_xticklabels([r'$-\pi$', r'$-\pi/2$', r'$0$', r'$\pi/2$', r'$\pi$'])
    ax.set_xlabel(r'$\omega$')
    ax.set_ylabel(r'幅度响应 $|H|$')
    ax.set_title(r'级联：总幅频 = 各子系统幅频之积（取对数后就是相加）')
    ax.legend(loc='upper left', framealpha=0.94)
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp12-cascade.svg')


def p12b():
    """反馈如何移动极点：G(z)=1/(1-0.5z^{-1})，常数反馈 F=k，p_cl = 0.5/(1±k)"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.6, 4.4))

    # 左：极点位置随反馈增益 k 变化
    k = np.linspace(0, 5, 800)
    p_neg = 0.5 / (1 + k)                 # 负反馈：往原点拉
    a1.plot(k, p_neg, color=GREEN, lw=2.6, label=r'负反馈 $p=\dfrac{0.5}{1+k}$')
    kp = np.linspace(0, 0.94, 400)
    a1.plot(kp, 0.5 / (1 - kp), color=ORANGE, lw=2.2,
            label=r'正反馈 $p=\dfrac{0.5}{1-k}$')
    a1.plot([1.2], [-2.5], 'o', ms=9, mfc='none', mec=RED, mew=2.2)
    a1.annotate(r'$k=1.2$：$p=-2.5$，已出圈', xy=(1.2, -2.5), xytext=(1.7, -2.1),
                fontsize=10.5, color=RED,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.2))
    a1.axhline(1, color=RED, lw=1.2, ls='--')
    a1.axhline(-1, color=RED, lw=1.2, ls='--')
    a1.axhspan(-1, 1, color=GREEN, alpha=0.09)
    a1.text(4.1, 0.28, '稳定区\n|p|<1', fontsize=10.5, color=GREEN, ha='center')
    a1.set_xlim(0, 5)
    a1.set_ylim(-3, 6)
    a1.set_xlabel(r'反馈增益 $k$（$F=k$ 为常数）')
    a1.set_ylabel(r'闭环极点位置 $p$')
    a1.set_title('常数反馈只沿实轴搬极点，不改角度')
    a1.legend(loc='upper right', framealpha=0.94)

    # 右：极点内移 = 带宽扩展 + 增益下降（增益换带宽）
    w = np.linspace(0, np.pi, 2000)
    base = 1 / (1 - 0.5)            # 开环直流增益 = 2，作为归一化基准
    for kk, col, lb in ((0, GREY, r'开环 $G$：$p=0.5$'),
                        (1, BLUE, r'闭环 $k=1$：$p=0.25$'),
                        (3, ORANGE, r'闭环 $k=3$：$p=0.125$')):
        p = 0.5 / (1 + kk)
        Hc = (1 / (1 + kk)) / np.abs(1 - p * np.exp(-1j * w)) / base
        a2.plot(w, Hc, color=col, lw=2.4, label=lb)
        a2.plot([0], [Hc[0]], 'o', color=col, ms=7)
        a2.annotate(f'{Hc[0]:.3f}'.rstrip('0').rstrip('.'), xy=(0, Hc[0]),
                    xytext=(0.10, Hc[0] + 0.045), fontsize=10.5, color=col)
    a2.axhline(1 / np.sqrt(2), color='#999', lw=1.1, ls=':')
    a2.text(2.35, 1 / np.sqrt(2) + 0.025, r'$1/\sqrt{2}$：开环 $-3$ dB 线',
            fontsize=10, color='#666')
    a2.plot([0.723], [1 / np.sqrt(2)], 'v', color=GREY, ms=7)
    a2.annotate(r'开环通带 $\omega\approx0.72$', xy=(0.723, 0.707), xytext=(0.95, 0.52),
                fontsize=10, color='#555',
                arrowprops=dict(arrowstyle='->', color='#888', lw=1.0))
    a2.set_xlim(0, np.pi)
    a2.set_ylim(0, 1.32)
    a2.set_xticks([0, np.pi / 4, np.pi / 2, 3 * np.pi / 4, np.pi])
    a2.set_xticklabels([r'$0$', r'$\pi/4$', r'$\pi/2$', r'$3\pi/4$', r'$\pi$'])
    a2.set_xlabel(r'$\omega$')
    a2.set_ylabel('幅度（以开环直流增益为 1）')
    a2.set_title(r'极点内移换来的通带变宽，代价是直流增益下降')
    a2.legend(loc='upper right', framealpha=0.94)

    for a in (a1, a2):
        clean(a)
    fig.tight_layout()
    save(fig, 'dsp12-feedback.svg')


# ---------------------------------------------------------------- 13 z 平面
def p13():
    fig, ax = plt.subplots(figsize=(6.4, 5.8))
    th = np.linspace(0, 2 * np.pi, 400)

    # ROC: |z| > 0.8 填充
    R, T = np.meshgrid(np.linspace(0.8, 3.4, 2), np.linspace(0, 2 * np.pi, 400))
    ax.contourf(R * np.cos(T), R * np.sin(T), R, levels=[0.8, 3.4],
                colors=[ORANGE], alpha=0.13)

    ax.plot(np.cos(th), np.sin(th), 'k--', lw=1.2, label=r'单位圆 $|z|=1$')
    ax.axhline(0, color='#333', lw=1.1)
    ax.axvline(0, color='#333', lw=1.1)
    ax.plot([0.8], [0], 'x', ms=13, mew=2.8, color=RED, label=r'极点 $p=0.8$')
    ax.plot([-1.5], [0], 'o', ms=9, mfc='none', mew=2.2, color=BLUE, label=r'零点 $z=-1.5$')
    ax.plot([1.15], [0.85], 'o', ms=8, mfc='none', mew=2.0, color=GREEN)
    ax.plot([1.15], [-0.85], 'o', ms=8, mfc='none', mew=2.0, color=GREEN)
    ax.text(1.24, 0.92, r'共轭零点对', color=GREEN, fontsize=10)

    ax.annotate(r'ROC: $|z|>0.8$', xy=(1.55, 1.45), fontsize=11.5, color=ORANGE,
                bbox=dict(fc='#fdf3e3', ec=ORANGE, lw=1.1, boxstyle='round,pad=0.35'))
    ax.text(0, -1.28, r'ROC 含单位圆 $\Rightarrow$ 稳定', ha='center', fontsize=10.5,
            color=BLUE)
    ax.text(0, -1.52, r'最外极点外 $\Rightarrow$ 因果', ha='center', fontsize=10.5,
            color=BLUE)

    ax.set_xlim(-2.1, 2.1)
    ax.set_ylim(-1.9, 1.9)
    ax.set_aspect('equal')
    ax.set_xlabel(r'$\mathrm{Re}(z)$')
    ax.set_ylabel(r'$\mathrm{Im}(z)$')
    ax.legend(loc='upper left', framealpha=0.94, fontsize=9.8)
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp13-zplane.svg')


# ---------------------------------------------------------------- 14 四类 ROC
def p14_roc():
    fig, axes = plt.subplots(2, 2, figsize=(8.6, 7.2))
    th = np.linspace(0, 2 * np.pi, 300)
    cases = [
        ('有限长序列', 'ring', r'$0<|z|<\infty$（去掉 $0$ 与 $\infty$）'),
        ('因果序列（右边）', 'out', r'$|z|>R_-$（最外极点外）'),
        ('反因果序列（左边）', 'in', r'$|z|<R_+$（最内极点内）'),
        ('双边序列', 'ann', r'$R_-<|z|<R_+$（环内）'),
    ]
    for ax, (ttl, kind, roc) in zip(axes.ravel(), cases):
        ax.plot(np.cos(th), np.sin(th), 'k--', lw=1.1)
        ax.axhline(0, color='#333', lw=1.0)
        ax.axvline(0, color='#333', lw=1.0)
        R, T = np.meshgrid(np.linspace(0, 2.2, 2), np.linspace(0, 2 * np.pi, 260))
        X, Y = R * np.cos(T), R * np.sin(T)
        if kind == 'ring':
            ax.contourf(X, Y, R, levels=[0.02, 2.2], colors=[ORANGE], alpha=0.14)
        elif kind == 'out':
            ax.contourf(X, Y, R, levels=[0.75, 2.2], colors=[ORANGE], alpha=0.14)
            ax.plot([0.75], [0], 'x', ms=10, mew=2.4, color=RED)
        elif kind == 'in':
            ax.contourf(X, Y, R, levels=[0.02, 0.75], colors=[ORANGE], alpha=0.14)
            ax.plot([0.75], [0], 'x', ms=10, mew=2.4, color=RED)
        else:
            ax.contourf(X, Y, R, levels=[0.5, 1.35], colors=[ORANGE], alpha=0.14)
            ax.plot([0.5, 1.35], [0, 0], 'x', ms=10, mew=2.4, color=RED)
        ax.set_xlim(-1.5, 1.5)
        ax.set_ylim(-1.5, 1.5)
        ax.set_aspect('equal')
        ax.set_title(ttl, fontsize=12)
        ax.text(0, -1.42, roc, ha='center', fontsize=9.5, color=ORANGE)
        ax.set_xticks([-1, 0, 1])
        ax.set_yticks([-1, 0, 1])
        clean(ax, grid=False)
    fig.tight_layout(h_pad=1.6, w_pad=1.2)
    save(fig, 'dsp-note-roc.svg')


# ---------------------------------------------------------------- 15 矩形→sinc
def p15():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.8, 3.9))
    N = 8
    n = np.arange(-6, 14)
    x = np.where((n >= 0) & (n <= N - 1), 1.0, 0.0)
    stem(a1, n, x, BLUE, label=r'$x[n]$：宽 $N=8$ 的矩形')
    a1.set_title(r'时域：矩形窗')
    a1.set_xlabel(r'$n$')
    a1.set_ylim(-0.08, 1.35)
    a1.legend(loc='upper right', framealpha=0.92)
    clean(a1)

    w = np.linspace(-2 * np.pi, 2 * np.pi, 1200)
    Xw = np.sin(w * N / 2) / np.sin(w / 2 + 1e-12)
    a2.plot(w, Xw, color=BLUE, lw=2.2)
    a2.axhline(0, color='#333', lw=1.0)
    for k in range(-2, 3):
        if k != 0:
            a2.axvline(2 * np.pi * k / N, color=RED, ls=':', lw=1.0, alpha=0.8)
    a2.axvline(2 * np.pi / N, color=RED, ls=':', lw=1.2, alpha=0.9)
    a2.text(2 * np.pi / N + 0.08, 6.2, r'零点 $\omega=2\pi k/N$', color=RED, fontsize=10)
    a2.set_title(r'频域：$\sin(\omega N/2)/\sin(\omega/2)$（sinc 型，周期 $2\pi$）')
    a2.set_xlabel(r'$\omega$')
    a2.set_xlim(-2 * np.pi, 2 * np.pi)
    a2.set_ylim(-3.2, 8.6)
    a2.set_xticks([-2 * np.pi, -np.pi, 0, np.pi, 2 * np.pi])
    a2.set_xticklabels([r'$-2\pi$', r'$-\pi$', r'$0$', r'$\pi$', r'$2\pi$'])
    clean(a2)

    fig.tight_layout(w_pad=2.0)
    save(fig, 'dsp14-rect-sinc.svg')


# ---------------------------------------------------------------- 16 单位圆↔DTFT
def p16():
    fig, ax = plt.subplots(figsize=(6.6, 5.9))
    th = np.linspace(0, 2 * np.pi, 400)

    # ROC: |z| > 0.8 填充（因果序列，极点在 0.8）
    R, T = np.meshgrid(np.linspace(0.8, 2.6, 2), th)
    ax.contourf(R * np.cos(T), R * np.sin(T), R, levels=[0.8, 2.6],
                colors=[ORANGE], alpha=0.14)

    ax.plot(np.cos(th), np.sin(th), color=BLUE, lw=2.8)
    ax.axhline(0, color='#333', lw=1.0)
    ax.axvline(0, color='#333', lw=1.0)
    ax.plot([0.8], [0], 'x', ms=13, mew=2.8, color=RED)
    ax.text(0.80, -0.26, r'极点 $0.8$', ha='center', fontsize=10, color=RED)

    marks = [(0, r'$\omega=0$'), (np.pi / 2, r'$\pi/2$'), (np.pi, r'$\pi$'),
             (-np.pi / 2, r'$-\pi/2$')]
    for ang, lab in marks:
        ax.plot([np.cos(ang)], [np.sin(ang)], 'o', ms=7, color=RED, mec='white', mew=1.0)
        r = 1.24
        dy = 0.15 if ang == 0 else 0.0
        ax.text(r * np.cos(ang), r * np.sin(ang) + dy, lab, ha='center', va='center',
                fontsize=10.5, color=RED)

    # 箭头示意逆时针扫描
    ax.annotate('', xy=(np.cos(1.45) * 1.08, np.sin(1.45) * 1.08),
                xytext=(np.cos(1.30) * 1.08, np.sin(1.30) * 1.08),
                arrowprops=dict(arrowstyle='-|>', color=GREEN, lw=2.0))
    ax.text(-0.46, 1.34, r'$\omega$ 逆时针扫过 $2\pi$', color=GREEN,
            ha='center', fontsize=10.5)
    ax.text(1.56, 1.30, r'ROC: $|z|>0.8$', color=ORANGE, fontsize=11,
            ha='right', va='center',
            bbox=dict(fc='#fdf3e3', ec=ORANGE, lw=1.1, boxstyle='round,pad=0.3'))
    ax.text(0, -1.56, r'单位圆落在 ROC 内 $\Rightarrow$ DTFT 存在', ha='center',
            fontsize=10.5, color=BLUE)

    ax.set_xlim(-1.62, 1.62)
    ax.set_ylim(-1.72, 1.52)
    ax.set_aspect('equal')
    ax.set_xlabel(r'$\mathrm{Re}(z)$')
    ax.set_ylabel(r'$\mathrm{Im}(z)$')
    ax.set_title(r'DTFT = Z 变换在单位圆上取值：$X(e^{j\omega})=X(z)|_{{z=e^{j\omega}}}$')
    clean(ax)
    fig.tight_layout()
    save(fig, 'dsp14-zcircle.svg')


# ---------------------------------------------------------------- 17 共轭对称
def p17():
    """实序列的共轭对称：时域 → 幅频（偶）→ 相频（奇），三栏并排"""
    fig, (a0, a1, a2) = plt.subplots(1, 3, figsize=(11.2, 3.5))
    a = 0.8
    n = np.arange(0, 9)
    x = a ** n
    stem(a0, n, x, GREY, lw=1.5, ms=5.5)
    a0.set_title(r'实序列 $x[n]=0.8^{\,n}u[n]$', fontsize=12.5)
    a0.set_xlabel(r'$n$')
    a0.set_ylabel(r'$x[n]$')
    a0.set_ylim(0, 1.12)
    clean(a0)

    w = np.linspace(-np.pi, np.pi, 1200)
    den = 1 - a * np.exp(-1j * w)
    mag = np.abs(1 / den)
    mag = mag / mag.max()
    phase = -np.angle(den)

    a1.plot(w, mag, color=BLUE, lw=2.4)
    a1.fill_between(w, 0, mag, color=BLUE, alpha=0.12)
    a1.axvline(0, color='#333', lw=1.0)
    a1.set_title(r'幅度谱 $|X|$：偶函数', fontsize=12.5)
    a1.set_xlabel(r'$\omega$')
    a1.set_ylabel(r'$|X|$（归一化）')
    a1.set_xlim(-np.pi, np.pi)
    a1.set_ylim(0, 1.18)
    a1.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    a1.set_xticklabels([r'$-\pi$', r'$-\pi/2$', r'$0$', r'$\pi/2$', r'$\pi$'])
    a1.annotate('', xy=(-1.15, 1.06), xytext=(1.15, 1.06),
                arrowprops=dict(arrowstyle='<->', color=RED, lw=1.2, ls='--'))
    a1.text(0, 1.10, '左右镜像', color=RED, ha='center', fontsize=10)
    clean(a1)

    a2.plot(w, phase, color=GREEN, lw=2.4)
    a2.axhline(0, color='#333', lw=1.0)
    a2.axvline(0, color='#333', lw=1.0, ls='--')
    a2.set_title(r'相位谱 $\angle X$：奇函数', fontsize=12.5)
    a2.set_xlabel(r'$\omega$')
    a2.set_ylabel('相位 (rad)')
    a2.set_xlim(-np.pi, np.pi)
    a2.set_ylim(-0.95, 0.95)
    a2.set_xticks([-np.pi, -np.pi / 2, 0, np.pi / 2, np.pi])
    a2.set_xticklabels([r'$-\pi$', r'$-\pi/2$', r'$0$', r'$\pi/2$', r'$\pi$'])
    a2.annotate('', xy=(-2.4, 0.78), xytext=(-0.9, -0.72),
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.1, ls='--'))
    a2.text(-2.95, 0.20, '过原点反演', color=RED, fontsize=10, ha='left')
    clean(a2)

    fig.tight_layout(w_pad=2.2)
    save(fig, 'dsp14-symmetry.svg')


# ---------------------------------------------------------------- 18 正交性几何
def p18():
    """r≠0 时 N 个等幅向量首尾相接成闭合多边形，回到起点 → 和为 0；r=0 时同相加成 N"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9.8, 4.9))
    N = 8
    th = 2 * np.pi / N

    zx, zy = 0.0, 0.0
    pts = [(0.0, 0.0)]
    for k in range(N):
        ang = k * th
        dx, dy = np.cos(ang), np.sin(ang)
        a1.annotate('', xy=(zx + dx, zy + dy), xytext=(zx, zy),
                    arrowprops=dict(arrowstyle='-|>', color=BLUE,
                                    lw=1.9, shrinkA=0, shrinkB=0))
        zx, zy = zx + dx, zy + dy
        pts.append((zx, zy))
    # 起点 / 终点重合处用红圈强调
    a1.plot([0], [0], 'o', ms=10, color=RED, mec='white', mew=1.3, zorder=6)
    a1.text(0.5, -0.62, r'$\sum_{n=0}^{7}W_8^{\,n}=0$', fontsize=13, color=BLUE,
            ha='center')
    a1.text(0.5, -1.12, '8 段首尾相接，正好绕回出发点', fontsize=10.5,
            color=GREY, ha='center')
    a1.set_title('异频（r≠0）：N 个向量均匀铺满一圈', pad=10)
    a1.set_xlim(-1.45, 2.45)
    a1.set_ylim(-1.42, 3.05)
    a1.set_aspect('equal')
    clean(a1, grid=False)

    # 右：r = 0，同相叠加（8 段首尾相接，每段长 1，合成 8）
    a2.annotate('', xy=(8.0, 0), xytext=(0, 0),
                arrowprops=dict(arrowstyle='-|>', color=GREEN, lw=3.2,
                                shrinkA=0, shrinkB=0))
    for k in range(1, 8):
        a2.plot([k, k], [-0.16, 0.16], color='white', lw=1.6, zorder=5)
    a2.annotate('', xy=(8.0, -0.95), xytext=(0, -0.95),
                arrowprops=dict(arrowstyle='-|>', color=RED, lw=3.2))
    a2.text(4.0, -1.38, r'合成 $=N=8$', fontsize=12, color=RED, ha='center')
    a2.text(4.0, 1.32, r'$\sum_{n=0}^{7}W_8^{\,0}=8$', fontsize=13, color=GREEN,
            ha='center')
    a2.text(4.0, 0.52, '8 段，每段长 1，方向相同，模长直接相加', fontsize=10.5,
            color=GREY, ha='center')
    a2.set_title('同相（r=0）：N 个向量首尾同向', pad=10)
    a2.set_xlim(-0.7, 8.7)
    a2.set_ylim(-1.65, 1.65)
    clean(a2)

    fig.tight_layout(w_pad=1.8)
    save(fig, 'dsp15-orth.svg')


# ---------------------------------------------------------------- 19 乘积积分
def p19():
    """同频余弦乘积恒正，积分为 T/2；异频余弦乘积正负相消，积分为 0"""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 5.6))
    t = np.linspace(0, 1, 1600)
    w0 = 2 * np.pi

    y1 = np.cos(w0 * t) ** 2
    a1.plot(t, y1, color=BLUE, lw=2.4)
    a1.fill_between(t, 0, y1, color=BLUE, alpha=0.22)
    a1.axhline(0, color='#333', lw=1.0)
    a1.text(0.5, 1.34, r'$\int_0^{T}\cos^2(\omega_0 t)\,dt=T/2$',
            fontsize=13, color=BLUE, ha='center')
    a1.set_title(r'同频 $m=n$：$\cos\cos$ 恒非负，面积积累到 $T/2$（不为零）', pad=16)
    a1.set_ylabel(r'$\cos(\omega_0 t)\cos(\omega_0 t)$')
    a1.set_xlim(0, 1)
    a1.set_ylim(0, 1.72)
    clean(a1)

    y2 = np.cos(w0 * t) * np.cos(2 * w0 * t)
    a2.plot(t, y2, color=PURPLE, lw=2.2)
    a2.fill_between(t, 0, y2, where=y2 >= 0, color=BLUE, alpha=0.25,
                    label='正面积')
    a2.fill_between(t, 0, y2, where=y2 <= 0, color=RED, alpha=0.25,
                    label='负面积')
    a2.axhline(0, color='#333', lw=1.0)
    a2.text(0.5, 1.34, r'$\int_0^{T}\cos(\omega_0 t)\cos(2\omega_0 t)\,dt=0$',
            fontsize=13, color=PURPLE, ha='center')
    a2.set_title('异频 $m\\neq n$：正负半周面积完全相消，积分为 0', pad=16)
    a2.set_xlabel(r'$t$（以周期 $T$ 归一化）')
    a2.set_ylabel(r'$\cos(\omega_0 t)\cos(2\omega_0 t)$')
    a2.set_xlim(0, 1)
    a2.set_ylim(-1.62, 1.72)
    a2.legend(loc='lower center', ncol=2, framealpha=0.94)
    clean(a2)

    fig.tight_layout(h_pad=1.9)
    save(fig, 'dsp15-proj.svg')


# ---------------------------------------------------------------- 20 频率卷绕
def p20():
    """ω 与 2π-ω 是同一序列；ω 从 0 到 2π，有效振荡速率是三角折返"""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 6.0))

    n = np.arange(0, 17)
    ml, sl, bl = a1.stem(n, np.cos(np.pi / 4 * n), linefmt='-', markerfmt='o',
                         basefmt=' ')
    plt.setp(sl, color=BLUE, lw=1.7)
    plt.setp(ml, color=BLUE, ms=7, mfc=BLUE, mec='white', mew=0.9)
    ml.set_label(r'$\cos(\pi n/4)$')
    # 叠加 ω = 2π - π/4 的取值：用红色空心圈覆盖，视觉上完全重合
    ml2, sl2, bl2 = a1.stem(n, np.cos((2 * np.pi - np.pi / 4) * n),
                            linefmt='--', markerfmt='o', basefmt=' ')
    plt.setp(sl2, color=RED, lw=1.2, visible=False)
    plt.setp(ml2, color=RED, ms=13, mfc='none', mec=RED, mew=1.6)
    ml2.set_label(r'$\cos(7\pi n/4)$（红圈叠加）')
    a1.axhline(0, color='#333', lw=1.0)
    a1.set_xlim(-0.6, 16.6)
    a1.set_ylim(-1.35, 1.35)
    a1.xaxis.set_major_locator(MultipleLocator(2))
    a1.set_ylabel('取值')
    a1.set_title('ω 与 2π−ω 给出同一个序列：红圈处处落在蓝点上')
    a1.legend(loc='upper right', ncol=2, framealpha=0.94)
    clean(a1)

    w = np.linspace(0, 2, 1000)
    eff = np.minimum(w, 2 - w)
    a2.plot(w, eff, color=BLUE, lw=2.6)
    a2.fill_between(w, 0, eff, color=BLUE, alpha=0.14)
    for xv, lab in ((0, r'$\omega=0$' + '\n直流'), (1, r'$\omega=\pi$' + '\n最快'),
                    (2, r'$\omega=2\pi$' + '\n退回直流')):
        a2.plot([xv], [min(xv, 2 - xv)], 'o', ms=8, color=RED, mec='white', mew=1.2,
                zorder=5)
        a2.text(xv, min(xv, 2 - xv) + 0.10, lab, ha='center', fontsize=10,
                color=RED)
    a2.annotate('', xy=(1.55, 0.45), xytext=(1.34, 0.66),
                arrowprops=dict(arrowstyle='->', color=GREEN, lw=1.6))
    a2.text(1.60, 0.36, '这段在变慢', color=GREEN, fontsize=10.5)
    a2.text(0.62, 0.30, '这段在变快', color=GREEN, fontsize=10.5)
    a2.set_xlim(-0.10, 2.35)
    a2.set_ylim(0, 1.28)
    a2.set_xticks([0, 0.5, 1, 1.5, 2])
    a2.set_xticklabels([r'$0$', r'$\pi/2$', r'$\pi$', r'$3\pi/2$', r'$2\pi$'])
    a2.set_xlabel(r'数字频率 $\omega$（占满一个 $2\pi$ 周期）')
    a2.set_ylabel('有效振荡速率')
    a2.set_title('"频率越大振荡越快"只对 0 到 π 成立，越过 π 就折返')
    clean(a2)

    fig.tight_layout(h_pad=1.9)
    save(fig, 'dsp01-freq-wrap.svg')


# ---------------------------------------------------------------- 21 线性叠加
def p21():
    """线性：输入按 a、b 叠加，输出也按 a、b 叠加（两条曲线完全重合）"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.0, 4.4))
    n = np.arange(0, 12)
    x1 = np.where(n == 2, 1.0, 0.0)          # δ[n-2]
    x2 = 0.55 ** n                            # 0.55^n u[n]
    a, b = 1.5, -1.0

    def H(x):
        y = np.zeros_like(x, dtype=float)
        for k in range(len(x)):
            y[k] = 2 * x[k] - (x[k - 1] if k >= 1 else 0)
        return y

    stem(a1, n, x1, BLUE, label=r'$x_1[n]=\delta[n-2]$')
    stem(a1, n, x2, GREEN, label=r'$x_2[n]=0.55^{\,n}u[n]$')
    stem(a1, n, a * x1 + b * x2, ORANGE, label=r'$1.5x_1-x_2$')
    a1.axhline(0, color='#333', lw=1.0)
    a1.set_title('输入端：两个输入按 1.5 与 −1 加权叠加')
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    a1.set_xlim(-0.6, 8.6)
    a1.set_ylim(-1.35, 1.95)
    a1.xaxis.set_major_locator(MultipleLocator(1))
    a1.legend(loc='upper right', framealpha=0.94, fontsize=9.5)
    clean(a1)

    left = H(a * x1 + b * x2)
    right = a * H(x1) + b * H(x2)
    a2.plot(n, left, 'o-', color=BLUE, lw=2.6, ms=7, label='先叠加再进系统')
    a2.plot(n, right, 's--', color=RED, lw=1.8, ms=9, mfc='none', mew=1.8,
            label='先进系统再叠加')
    a2.axhline(0, color='#333', lw=1.0)
    a2.set_title('输出端：两条曲线处处重合 → 线性成立')
    a2.set_xlabel(r'$n$')
    a2.set_ylabel('幅度')
    a2.set_xlim(-0.6, 8.6)
    a2.legend(loc='upper right', framealpha=0.94, fontsize=9.5)
    a2.text(0.02, 0.55, '差值为零\n（若差不为零则非线性）', transform=a2.transAxes,
            fontsize=10, color=GREY, va='top')
    clean(a2)

    fig.tight_layout(w_pad=2.0)
    save(fig, 'dsp02-super.svg')


# ---------------------------------------------------------------- 22 时不变
def p22():
    """时不变：输入先移 2 点，输出也整体移 2 点；反例 y=nx[n] 移不动"""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 6.0))
    n = np.arange(0, 14)
    x = 0.7 ** n * (n < 7)
    d = 3

    def LTI(x):
        y = np.zeros_like(x, dtype=float)
        for k in range(len(x)):
            y[k] = 0.5 * (x[k] + (x[k - 1] if k >= 1 else 0))
        return y

    y = LTI(x)
    x_shift = np.zeros_like(x)
    x_shift[d:] = x[:-d]
    y_shift_in = LTI(x_shift)                 # 先移后算
    y_shift_out = np.zeros_like(x)
    y_shift_out[d:] = y[:-d]                  # 先算后移

    a1.stem(n, y_shift_in, PURPLE, label='先移输入，再过系统')
    ml, sl, _ = a1.stem(n, y_shift_out, linefmt='--', markerfmt='o', basefmt=' ')
    plt.setp(sl, color=ORANGE, lw=1.2, visible=False)
    plt.setp(ml, color=ORANGE, ms=13, mfc='none', mec=ORANGE, mew=1.6,
             label='先过系统，再移输出')
    a1.axhline(0, color='#333', lw=1.0)
    a1.set_title('时不变系统（低通 $y[n]=0.5(x[n]+x[n-1])$）：两圈完全套在一起')
    a1.set_xlim(-0.6, 13.6)
    a1.set_ylim(-0.35, 1.25)
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    a1.legend(loc='upper right', ncol=2, framealpha=0.94, fontsize=9.5)
    clean(a1)

    def TV(x):
        return n * x                       # y[n] = n x[n]，时变

    yt = TV(x)
    yt_in = TV(x_shift)
    yt_out = np.zeros_like(x)
    yt_out[d:] = yt[:-d]
    stem(a2, n, yt_in, BLUE, label='先移输入，再过系统')
    ml, sl, _ = a2.stem(n, yt_out, linefmt='--', markerfmt='s', basefmt=' ')
    plt.setp(sl, color=RED, lw=1.2, visible=False)
    plt.setp(ml, color=RED, ms=8, mfc='none', mec=RED, mew=1.6,
             label='先过系统，再移输出')
    a2.axhline(0, color='#333', lw=1.0)
    a2.annotate('错位越来越大', xy=(9, yt_in[9]), xytext=(5.2, 2.35),
                fontsize=10.5, color=RED,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.2))
    a2.set_title('时变系统 $y[n]=n\\,x[n]$：两圈错开 → 时不变性不成立')
    a2.set_xlim(-0.6, 13.6)
    a2.set_xlabel(r'$n$')
    a2.set_ylabel('幅度')
    a2.legend(loc='upper right', ncol=2, framealpha=0.94, fontsize=9.5)
    clean(a2)

    fig.tight_layout(h_pad=1.9)
    save(fig, 'dsp02-ti.svg')


# ---------------------------------------------------------------- 23 因果
def p23():
    """因果：输入到达之前输出必须为零；x[n+1] 会抢跑"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.0, 4.4))
    n = np.arange(-4, 8)
    x = np.where(n >= 0, 1.0, 0.0)            # u[n]

    def cau(x):
        y = np.zeros_like(x, dtype=float)
        for k in range(len(x)):
            y[k] = 0.5 * (y[k - 1] if k >= 1 else 0) + x[k]
        return y     # 递推从 n=-4 起，等价于因果系统零初值

    yc = cau(x)
    ml, sl, _ = a1.stem(n, x, linefmt='-', markerfmt='s', basefmt=' ')
    plt.setp(sl, color=GREY, lw=1.2)
    plt.setp(ml, color=GREY, ms=9, mfc='none', mec=GREY, mew=1.4,
             label=r'输入 $x[n]=u[n]$')
    stem(a1, n, yc, BLUE, label=r'输出 $y[n]=0.5y[n-1]+x[n]$')
    a1.axvline(-0.5, color=RED, lw=1.4, ls=':')
    a1.text(-0.30, 1.62, '输入从这里开始', color=RED, fontsize=10)
    a1.annotate('$n<0$ 输出全为 0', xy=(-2, 0.0), xytext=(-3.9, 0.75),
                fontsize=10.5, color=GREEN,
                arrowprops=dict(arrowstyle='->', color=GREEN, lw=1.2))
    a1.set_title('因果系统：输入没来之前，输出一动不动')
    a1.set_xlim(-4.4, 7.4)
    a1.set_ylim(-0.14, 2.32)
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    a1.legend(loc='lower right', framealpha=0.94, fontsize=9.5)
    clean(a1)

    y_nc = np.zeros_like(x, dtype=float)
    y_nc[:-1] = x[1:]                          # y[n] = x[n+1]
    y_nc[-1] = 0
    ml, sl, _ = a2.stem(n, x, linefmt='-', markerfmt='s', basefmt=' ')
    plt.setp(sl, color=GREY, lw=1.2)
    plt.setp(ml, color=GREY, ms=11, mfc='none', mec=GREY, mew=1.5,
             label=r'输入 $x[n]=u[n]$')
    stem(a2, n, y_nc, RED, label=r'输出 $y[n]=x[n+1]$')
    a2.axvline(-0.5, color=RED, lw=1.4, ls=':')
    a2.annotate('输入还没到，输出已经冒出 1', xy=(-1, 1.0), xytext=(-3.9, 1.45),
                fontsize=10.5, color=RED,
                arrowprops=dict(arrowstyle='->', color=RED, lw=1.2))
    a2.set_title('非因果 $y[n]=x[n+1]$：输出比输入早一步')
    a2.set_xlim(-4.4, 7.4)
    a2.set_ylim(-0.12, 1.72)
    a2.set_xlabel(r'$n$')
    a2.set_ylabel('幅度')
    a2.legend(loc='lower right', framealpha=0.94, fontsize=9.5)
    clean(a2)

    fig.tight_layout(w_pad=2.0)
    save(fig, 'dsp02-causal.svg')


# ---------------------------------------------------------------- 24 稳定
def p24():
    """稳定：有界输入下有界输出；极点跑到单位圆外就指数发散"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.0, 4.4))
    n = np.arange(0, 14)
    x = np.ones_like(n, dtype=float)          # 有界输入 |x|=1

    y_stable = 0.55 ** n                      # 极点 0.55
    y_unstable = 1.3 ** n                     # 极点 1.3（在单位圆外）

    a1.axhline(1.0, color=GREY, lw=1.8, ls='--',
               label=r'输入 $x[n]=u[n]$（上界 1）')
    stem(a1, n, y_stable, BLUE, label=r'输出 $h[n]=0.55^{\,n}u[n]$')
    a1.text(5.6, 1.07, '输入的上界', color=GREY, fontsize=10)
    a1.set_title('稳定（极点在单位圆内）：输出不越界')
    a1.set_xlim(-0.6, 13.6)
    a1.set_ylim(0, 1.55)
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    a1.legend(loc='upper right', framealpha=0.94, fontsize=9.5)
    clean(a1)

    ns = np.arange(0, 21)
    stem(a2, ns, 1.3 ** ns, RED, label=r'$h[n]=1.3^{\,n}u[n]$')
    a2.axhline(1.0, color=GREEN, lw=1.2, ls='--')
    a2.text(9.0, 1.4, '输入始终不超过 1', color=GREEN, fontsize=10)
    a2.set_yscale('log')
    a2.set_title('不稳定（极点 1.3 > 1）：输出指数冲顶')
    a2.set_xlim(-0.6, 20.6)
    a2.set_xlabel(r'$n$')
    a2.set_ylabel('幅度（对数轴）')
    a2.legend(loc='upper left', framealpha=0.94, fontsize=9.5)
    clean(a2)

    fig.tight_layout(w_pad=2.0)
    save(fig, 'dsp02-stable.svg')


# ---------------------------------------------------------------- 25 能量信号
def p25():
    """能量信号：部分和收敛到有限值，平均功率趋于 0"""
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8.4, 5.8))
    n = np.arange(0, 15)
    x = 0.7 ** n
    ml, sl, _ = a1.stem(n, x, linefmt='-', markerfmt='o', basefmt=' ')
    plt.setp(sl, color=BLUE, lw=1.7)
    plt.setp(ml, color=BLUE, ms=7, mfc=BLUE, mec='white', mew=0.9)
    a1.axhline(0, color='#333', lw=1.0)
    a1.set_title(r'能量信号 $x[n]=0.7^{\,n}u[n]$：幅度按指数衰减')
    a1.set_xlim(-0.6, 14.6)
    a1.set_ylim(0, 1.15)
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    clean(a1)

    N = np.arange(1, 41)
    E = np.cumsum(0.7 ** (2 * np.arange(0, 40)))
    P = E / N
    a2.plot(N, E, color=BLUE, lw=2.4, label=r'部分能量 $\sum_{n=0}^{N-1}x^2[n]$')
    a2.axhline(1 / (1 - 0.49), color=BLUE, lw=1.3, ls='--')
    a2.text(20, 1 / (1 - 0.49) + 0.10, r'极限 $1/(1-0.49)=1.96$（有限）',
            color=BLUE, fontsize=10.5)
    a2.plot(N, P, color=ORANGE, lw=2.2, label=r'部分平均功率 $\frac{1}{N}\sum x^2$')
    a2.text(24, 0.28, '平均功率 → 0', color=ORANGE, fontsize=10.5)
    a2.set_xlim(1, 40)
    a2.set_ylim(0, 2.35)
    a2.set_xlabel(r'累计点数 $N$')
    a2.set_ylabel('能量 / 功率')
    a2.set_title('能量收敛到有限值 → 能量信号；平均功率必然趋于 0')
    a2.legend(loc='center right', framealpha=0.94, fontsize=9.5)
    clean(a2)

    fig.tight_layout(h_pad=1.9)
    save(fig, 'dsp03-energysum.svg')


# ---------------------------------------------------------------- 26 功率信号
def p26():
    """功率信号：能量线性发散，平均功率收敛"""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.0, 4.4))
    n = np.arange(0, 25)
    x = np.cos(np.pi / 4 * n)
    stem(a1, n, x, BLUE)
    a1.axhline(0, color='#333', lw=1.0)
    a1.set_title(r'功率信号 $x[n]=\cos(\pi n/4)$：永不衰减')
    a1.set_xlim(-0.6, 24.6)
    a1.set_ylim(-1.3, 1.52)
    a1.set_xlabel(r'$n$')
    a1.set_ylabel('幅度')
    a1.text(0.4, 1.28, '周期 $N=8$，幅度恒定不衰减', color=GREY, fontsize=10.5)
    clean(a1)

    N = np.arange(1, 201)
    E = np.cumsum(np.cos(np.pi / 4 * np.arange(0, 200)) ** 2)
    P = E / N
    l1, = a2.plot(N, E, color=RED, lw=2.0,
                  label=r'部分能量 $\sum x^2$（线性增长、无上界）')
    a2.set_xlim(1, 200)
    a2.set_ylim(0, 118)
    a2.set_xlabel(r'累计点数 $N$')
    a2.set_ylabel('部分能量', color=RED)
    a2.tick_params(axis='y', labelcolor=RED)
    clean(a2)

    a2b = a2.twinx()
    l2, = a2b.plot(N, P, color=GREEN, lw=2.6,
                  label=r'部分平均功率 $\frac{1}{N}\sum x^2$（收敛到 1/2）')
    a2b.axhline(0.5, color=GREEN, lw=1.3, ls='--')
    a2b.set_ylim(0, 1.18)
    a2b.set_ylabel('平均功率', color=GREEN)
    a2b.tick_params(axis='y', labelcolor=GREEN)
    a2.set_title('能量发散、功率有限 → 功率信号')
    a2.legend(handles=[l1, l2], loc='lower right', framealpha=0.94, fontsize=9.0)

    fig.tight_layout(w_pad=2.0)
    save(fig, 'dsp03-power.svg')


# ---------------------------------------------------------------- 27 卷积滑动
def p27():
    """卷积的翻转-平移-相乘-求和：同一副图看 n=2 与 n=3 两步"""
    fig, axes = plt.subplots(2, 2, figsize=(9.6, 6.2))
    k = np.arange(0, 8, dtype=float)
    x = np.array([1, 2, 3, 2, 1, 0, 0, 0], dtype=float)
    h = np.array([1, 0.5, 0.25, 0, 0, 0, 0, 0], dtype=float)

    def hk(nn):
        v = np.zeros_like(k)
        for kk in range(len(k)):
            idx = nn - int(kk)
            if 0 <= idx < len(h):
                v[kk] = h[idx]
        return v

    for col, nn in enumerate((2, 3)):
        g = hk(nn)
        ax = axes[0][col]
        ax.bar(k, x, width=0.42, color=BLUE, alpha=0.18)
        ax.plot(k, x, 'o-', color=BLUE, lw=2.0, ms=7, label=r'$x[k]$')
        if col == 0:
            ax.plot(k, h, ':', color=GREY, lw=1.6, label=r'$h[k]$（原样，未翻转）')
        ax.plot(k, g, 's--', color=ORANGE, lw=2.0, ms=7, mfc='none', mew=1.6,
                label=r'$h[%d-k]$' % nn)
        ax.set_xlim(-0.55, 7.55)
        ax.set_ylim(-0.35, 3.35)
        ax.set_title('第 %d 步：$h$ 先翻转成 $h[-k]$，再右移到 $n=%d$'
                     % (col + 1, nn))
        ax.legend(loc='upper right', framealpha=0.94, fontsize=9.0)
        clean(ax)

        axp = axes[1][col]
        prod = x * g
        axp.bar(k, prod, width=0.5, color=PURPLE, alpha=0.75)
        axp.plot(k, prod, 'o', color=PURPLE, ms=6)
        s = prod.sum()
        axp.set_xlim(-0.5, 7.5)
        axp.set_ylim(0, 3.35)
        axp.set_title('逐点相乘再求和：$y[%d]=%g$' % (nn, s))
        axp.set_xlabel(r'$k$')
        clean(axp)

    fig.tight_layout(h_pad=1.7, w_pad=1.8)
    save(fig, 'dsp07-slide.svg')


# ---------------------------------------------------------------- 28 可逆性
def p28():
    """差分器与累加器互逆：x -> 差分 -> 累加 -> 还原 x"""
    fig, axes = plt.subplots(3, 1, figsize=(8.4, 6.6), sharex=True)
    n = np.arange(0, 9)
    x = np.array([1, 2, 3, 2, 1, 0, 0, 0, 0], dtype=float)
    y = np.zeros_like(x)
    for k in range(len(x)):
        y[k] = x[k] - (x[k - 1] if k >= 1 else 0)
    z = np.cumsum(y)

    stem(axes[0], n, x, BLUE, label=r'$x[n]$')
    axes[0].set_title('原序列：输入系统之前的样子')
    axes[0].set_ylabel('幅度')
    axes[0].set_ylim(-0.3, 3.5)
    axes[0].legend(loc='upper right', framealpha=0.94)
    clean(axes[0])

    stem(axes[1], n, y, ORANGE, label=r'$y[n]=x[n]-x[n-1]$（一阶差分）')
    axes[1].axhline(0, color='#333', lw=1.0)
    axes[1].set_title('过差分器：形状变了，但信息没有丢')
    axes[1].set_ylabel('幅度')
    axes[1].set_ylim(-1.35, 1.35)
    axes[1].legend(loc='upper right', framealpha=0.94)
    clean(axes[1])

    stem(axes[2], n, z, PURPLE, label=r'$\sum_{k\leq n}y[k]$（累加器）')
    ml, sl, _ = axes[2].stem(n, x, linefmt='--', markerfmt='o', basefmt=' ')
    plt.setp(sl, color=RED, lw=1.2, visible=False)
    plt.setp(ml, color=RED, ms=14, mfc='none', mec=RED, mew=1.7,
             label=r'原序列 $x[n]$（红圈叠加）')
    axes[2].axhline(0, color='#333', lw=1.0)
    axes[2].set_title('过累加器：红圈处处套住紫点，原序列被完整还原')
    axes[2].set_xlabel(r'$n$')
    axes[2].set_ylabel('幅度')
    axes[2].set_ylim(-0.3, 3.5)
    axes[2].legend(loc='upper right', framealpha=0.94)
    clean(axes[2])

    fig.tight_layout(h_pad=1.6)
    save(fig, 'dsp02-inverse.svg')


def main():
    os.makedirs(OUT, exist_ok=True)
    print('生成中 ->', OUT)
    for f in (p01, p02, p03, p04, p05, p06, p07, p08, p08b, p09,
              p10, p11, p12, p12b, p13, p14_roc, p15, p16, p17, p18, p19,
              p20, p21, p22, p23, p24, p25, p26, p27, p28):
        f()
    print('全部完成')


if __name__ == '__main__':
    main()
