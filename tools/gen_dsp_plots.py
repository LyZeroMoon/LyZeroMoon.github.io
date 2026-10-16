# -*- coding: utf-8 -*-
"""
生成 DSP 系列文章所需的函数图像（自包含 SVG，零第三方依赖）。
中文标签由浏览器字体渲染，矢量清晰，可直接版本管理。
输出目录：source/images/dsp/
"""
import math, os, xml.dom.minidom as minidom

OUT = os.path.join(os.path.dirname(__file__), "..", "source", "images", "dsp")
os.makedirs(OUT, exist_ok=True)

# ---- 配色（适配亮色主题，深轴、彩色曲线）----
C_BG = "#ffffff"
C_BORDER = "#e3e8ef"
C_AXIS = "#5b6470"
C_GRID = "#eef2f7"
C_TEXT = "#2b3440"
C_TITLE = "#1f2733"
C_SUB = "#6b7280"
BLUE = "#2f6fed"
ORANGE = "#e8590c"
GREEN = "#2b8a3e"
PURPLE = "#9c36b5"
RED = "#e03131"
TEAL = "#0c8599"
GREY = "#868e96"

FONT = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"

def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

class Panel:
    def __init__(self, ox, oy, w, h, xlim, ylim, xlabel="", ylabel="",
                 title="", grid=True, xticks=None, yticks=None,
                 xtick_labels=None, ytick_labels=None):
        self.ox, self.oy, self.w, self.h = ox, oy, w, h
        self.xlim, self.ylim = xlim, ylim
        self.xlabel, self.ylabel, self.title = xlabel, ylabel, title
        self.grid = grid
        self.xticks = xticks if xticks is not None else nice_ticks(*xlim, 6)
        self.yticks = yticks if yticks is not None else nice_ticks(*ylim, 5)
        self.xtick_labels = xtick_labels
        self.ytick_labels = ytick_labels
        self.el = []

    def X(self, xd):
        return self.ox + (xd - self.xlim[0]) / (self.xlim[1] - self.xlim[0]) * self.w

    def Y(self, yd):
        return self.oy + self.h - (yd - self.ylim[0]) / (self.ylim[1] - self.ylim[0]) * self.h

    def add(self, s):
        self.el.append(s)

    def line(self, x1, y1, x2, y2, color=C_AXIS, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{f(self.X(x1))}" y1="{f(self.Y(y1))}" x2="{f(self.X(x2))}" '
                 f'y2="{f(self.Y(y2))}" stroke="{color}" stroke-width="{width}"{d}/>')

    def polyline(self, pts, color, width=2.2):
        p = " ".join(f"{f(self.X(x))},{f(self.Y(y))}" for x, y in pts)
        self.add(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{width}" '
                 f'stroke-linejoin="round" stroke-linecap="round"/>')

    def curve(self, f, color, width=2.2, n=600):
        x0, x1 = self.xlim
        pts = []
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            try:
                y = f(x)
            except Exception:
                continue
            if y is None or math.isnan(y) or math.isinf(y):
                continue
            pts.append((x, y))
        self.polyline(pts, color, width)

    def stems(self, seq, color=BLUE, marker_r=3.2):
        """seq: list of (n, value) 离散序列，画茎+点"""
        base = self.Y(0)
        for n, v in seq:
            px = self.X(n)
            py = self.Y(v)
            self.add(f'<line x1="{f(px)}" y1="{f(base)}" x2="{f(px)}" y2="{f(py)}" '
                     f'stroke="{GREY}" stroke-width="1"/>')
            self.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="{marker_r}" fill="{color}" '
                     f'stroke="#fff" stroke-width="0.8"/>')

    def dots(self, pts, color, r=3.2):
        for x, y in pts:
            self.add(f'<circle cx="{f(self.X(x))}" cy="{f(self.Y(y))}" r="{r}" fill="{color}"/>')

    def hline(self, y, color=C_AXIS, width=1, dash=None):
        self.line(self.xlim[0], y, self.xlim[1], y, color, width, dash)

    def vline(self, x, color=C_AXIS, width=1, dash=None):
        self.line(x, self.ylim[0], x, self.ylim[1], color, width, dash)

    def render(self):
        s = []
        # 边框
        s.append(f'<rect x="{f(self.ox)}" y="{f(self.oy)}" width="{f(self.w)}" height="{f(self.h)}" '
                 f'fill="none" stroke="{C_BORDER}" stroke-width="1" rx="4"/>')
        # 网格
        if self.grid:
            for t in self.xticks:
                s.append(f'<line x1="{f(self.X(t))}" y1="{f(self.oy)}" x2="{f(self.X(t))}" '
                         f'y2="{f(self.oy+self.h)}" stroke="{C_GRID}" stroke-width="1"/>')
            for t in self.yticks:
                s.append(f'<line x1="{f(self.ox)}" y1="{f(self.Y(t))}" x2="{f(self.ox+self.w)}" '
                         f'y2="{f(self.Y(t))}" stroke="{C_GRID}" stroke-width="1"/>')
        # 轴线（原点在范围内则穿过原点）
        xax = 0 if self.ylim[0] <= 0 <= self.ylim[1] else (self.ylim[0] if self.ylim[1] < 0 else self.ylim[1])
        yax = 0 if self.xlim[0] <= 0 <= self.xlim[1] else (self.xlim[0] if self.xlim[1] < 0 else self.xlim[1])
        # x 轴
        x0p = self.X(self.xlim[0]); x1p = self.X(self.xlim[1]); xaxp = self.Y(xax)
        s.append(f'<line x1="{f(x0p)}" y1="{f(xaxp)}" x2="{f(x1p)}" y2="{f(xaxp)}" '
                 f'stroke="{C_AXIS}" stroke-width="1.4" marker-end="url(#arr)"/>')
        # y 轴
        y0p = self.Y(self.ylim[0]); y1p = self.Y(self.ylim[1]); yaxp_x = self.X(yax)
        s.append(f'<line x1="{f(yaxp_x)}" y1="{f(y1p)}" x2="{f(yaxp_x)}" y2="{f(y0p)}" '
                 f'stroke="{C_AXIS}" stroke-width="1.4" marker-end="url(#arr)"/>')
        # ticks + labels
        for t in self.xticks:
            px = self.X(t); py = self.Y(xax)
            s.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px)}" y2="{f(py+4)}" stroke="{C_AXIS}" stroke-width="1"/>')
            lab = self.xtick_labels[self.xticks.index(t)] if self.xtick_labels else fmt(t)
            s.append(f'<text x="{f(px)}" y="{f(py+15)}" font-family="{FONT}" font-size="10" '
                     f'fill="{C_SUB}" text-anchor="middle">{esc(lab)}</text>')
        for t in self.yticks:
            px = self.X(yax); py = self.Y(t)
            s.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px-4)}" y2="{f(py)}" stroke="{C_AXIS}" stroke-width="1"/>')
            lab = self.ytick_labels[self.yticks.index(t)] if self.ytick_labels else fmt(t)
            s.append(f'<text x="{f(px-6)}" y="{f(py+3)}" font-family="{FONT}" font-size="10" '
                     f'fill="{C_SUB}" text-anchor="end">{esc(lab)}</text>')
        # 轴标题
        if self.xlabel:
            s.append(f'<text x="{f(self.ox+self.w/2)}" y="{f(self.oy+self.h+30)}" font-family="{FONT}" '
                     f'font-size="11.5" fill="{C_TEXT}" text-anchor="middle">{esc(self.xlabel)}</text>')
        if self.ylabel:
            s.append(f'<text x="{f(self.ox-34)}" y="{f(self.oy+self.h/2)}" font-family="{FONT}" '
                     f'font-size="11.5" fill="{C_TEXT}" text-anchor="middle" '
                     f'transform="rotate(-90 {f(self.ox-34)} {f(self.oy+self.h/2)})">{esc(self.ylabel)}</text>')
        if self.title:
            s.append(f'<text x="{f(self.ox+self.w/2)}" y="{f(self.oy-8)}" font-family="{FONT}" '
                     f'font-size="12.5" fill="{C_TITLE}" font-weight="600" text-anchor="middle">{esc(self.title)}</text>')
        return "".join(s) + "".join(self.el)


def nice_ticks(lo, hi, n=5):
    if hi <= lo:
        return [lo]
    span = hi - lo
    step = nice_step(span / n)
    start = math.ceil(lo / step) * step
    t = []
    x = start
    while x <= hi + 1e-9:
        t.append(round(x, 6))
        x += step
    return t

def nice_step(x):
    e = 10 ** math.floor(math.log10(x))
    m = x / e
    if m < 1.5: s = 1
    elif m < 3: s = 2
    elif m < 7: s = 5
    else: s = 10
    return s * e

def fmt(v):
    if abs(v) < 1e-9:
        return "0"
    if abs(v) >= 100 or abs(v) < 0.01:
        return f"{v:.1g}"
    return f"{v:.2g}".rstrip("0").rstrip(".")

def f(v):
    return f"{v:.2f}"

def legend(panels_px, items, x, y):
    """items: list of (color, label). 传入像素坐标区域起点"""
    out = []
    cy = y
    for color, label in items:
        out.append(f'<line x1="{f(x)}" y1="{f(cy)}" x2="{f(x+18)}" y2="{f(cy)}" '
                   f'stroke="{color}" stroke-width="2.4"/>')
        out.append(f'<circle cx="{f(x+9)}" cy="{f(cy)}" r="3" fill="{color}"/>')
        out.append(f'<text x="{f(x+24)}" y="{f(cy+3.5)}" font-family="{FONT}" font-size="10.5" '
                   f'fill="{C_TEXT}">{esc(label)}</text>')
        cy += 16
    return "".join(out)

def svg(doc_w, doc_h, title, inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {doc_w} {doc_h}" '
            f'width="100%" preserveAspectRatio="xMidYMid meet" '
            f'style="max-width:{doc_w}px;background:{C_BG};border:1px solid {C_BORDER};border-radius:8px;">'
            f'<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" '
            f'orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6 Z" fill="{C_AXIS}"/></marker></defs>'
            f'<text x="{doc_w/2}" y="22" font-family="{FONT}" font-size="14" font-weight="700" '
            f'fill="{C_TITLE}" text-anchor="middle">{esc(title)}</text>'
            f'{inner}</svg>')


# ============================ 各图 ============================

def plot_01_periodic():
    """（一）周期性：周期序列 vs 非周期序列的采样点"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-0.5, 16.5), (-1.25, 1.25),
              xlabel="n (采样点序号)", ylabel="幅度",
              xticks=[0,2,4,6,8,10,12,14,16])
    # 连续正弦（虚线）
    p.curve(lambda t: math.sin(math.pi*t/4), C_AXIS, 1.2, 800)
    p.curve(lambda t: math.sin(math.sqrt(2)*t), GREY, 1.2, 800)
    # 周期序列采样点（蓝点）
    per = [(n, math.sin(math.pi*n/4)) for n in range(0, 17)]
    p.dots(per, BLUE, 3.6)
    # 非周期序列采样点（橙点）
    non = [(n, math.sin(math.sqrt(2)*n)) for n in range(0, 17)]
    p.dots(non, ORANGE, 3.0)
    inner = p.render() + legend([], [(BLUE,"sin(πn/4)：落在连续波上的周期采样"),
                                      (ORANGE,"sin(√2·n)：采样点永不重复 → 非周期")], 60, 268)
    return svg(W, H, "（一）序列的周期性：采样点是否重复", inner)


def plot_02_timeinv():
    """（二）时不变性：输入平移 → 输出同样平移"""
    n = list(range(0, 8))
    x = [0, 0, 1, 1, 1, 0, 0, 0]        # 原输入（脉冲串，n=2,3,4）
    x2 = [0, 0, 0, 0, 1, 1, 1, 0]       # 原输入右移 2：x[n-2]
    def sys(seq):
        out = []
        for i in range(len(seq)):
            v = 0.5 * seq[i]
            if i - 1 >= 0:
                v += 0.5 * seq[i - 1]
            out.append(v)
        return out
    y = sys(x)
    y2 = sys(x2)
    W, H = 620, 340
    p1 = Panel(60, 40, 520, 120, (-0.5, 7.5), (-0.3, 1.3),
               xlabel="n", ylabel="", title="输入及其平移", xticks=list(range(0, 8)))
    p1.stems([(i, x[i]) for i in n], BLUE)
    p1.stems([(i, x2[i]) for i in n], ORANGE)
    p2 = Panel(60, 180, 520, 120, (-0.5, 7.5), (-0.3, 1.3),
               xlabel="n", ylabel="", title="输出及其平移（同样右移 2）", xticks=list(range(0, 8)))
    p2.stems([(i, y[i]) for i in n], BLUE)
    p2.stems([(i, y2[i]) for i in n], ORANGE)
    inner = p1.render() + p2.render() + legend([],
        [(BLUE, "原输入 x / 原输出 y"), (ORANGE, "平移后输入 x[n-2] / 输出 y[n-2]")], 60, 318)
    return svg(W, H, "（二）时不变性：输入平移，输出同样平移", inner)


def plot_03_energy():
    """（三）能量信号 a^n u[n]（衰减）vs 功率信号 u[n]（恒定）"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-0.5, 10.5), (-0.2, 1.2),
              xlabel="n", ylabel="幅度", xticks=[0,2,4,6,8,10])
    a = 0.8
    energy = [(n, a**n) for n in range(0, 11)]
    power = [(n, 1.0) for n in range(0, 11)]
    p.stems(energy, BLUE)
    p.stems(power, ORANGE)
    inner = p.render() + legend([], [(BLUE,"0.8ⁿu[n]：衰减 → 能量有限"),
                                      (ORANGE,"u[n]：恒定 → 功率有限、能量无穷")], 60, 268)
    return svg(W, H, "（三）能量信号（衰减）与功率信号（恒定）", inner)


def plot_04_autocorr():
    """（四）矩形脉冲与其自相关（三角）"""
    W, H = 620, 320
    # 上：矩形脉冲
    p1 = Panel(60, 40, 240, 150, (-1.5, 6.5), (-0.3, 1.3),
               xlabel="n", ylabel="x[n]", title="原信号 x[n]", xticks=[0,1,2,3,4,5])
    x = [(n, 1.0) for n in range(0, 5)]
    p1.stems(x, BLUE)
    # 下：自相关三角
    p2 = Panel(320, 40, 240, 150, (-4.5, 4.5), (-0.3, 5.3),
               xlabel="m", ylabel="r[m]", title="自相关 r[m]", xticks=[-4,-2,0,2,4])
    r = [(m, 5 - abs(m)) for m in range(-4, 5)]
    p2.stems(r, GREEN)
    inner = p1.render() + p2.render()
    return svg(W, H, "（四）矩形脉冲与其自相关（三角形）", inner)


def plot_05_wk():
    """（五）维纳-辛钦：r[m]（衰减）↔ PSD（洛伦兹）"""
    W, H = 620, 320
    a = 0.7
    p1 = Panel(60, 40, 240, 150, (-8.5, 8.5), (-0.2, 1.2),
               xlabel="m", ylabel="r[m]", title="自相关 r[m]", xticks=[-8,-4,0,4,8])
    rseq = [(m, a**abs(m)) for m in range(-8, 9)]
    p1.stems(rseq, BLUE)
    p2 = Panel(320, 40, 240, 150, (-math.pi, math.pi), (0, 2.2),
               xlabel="ω", ylabel="P(ω)", title="功率谱 P(ω)",
               xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"])
    p2.curve(lambda w: (1 - a*a) / (1 - 2*a*math.cos(w) + a*a), RED, 2.2, 600)
    inner = p1.render() + p2.render()
    return svg(W, H, "（五）维纳-辛钦：时域自相关 ↔ 频域功率谱", inner)


def plot_06_psd():
    """（六）功率谱密度：白噪声（平坦）vs 一阶系统（低通）"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-math.pi, math.pi), (0, 5.2),
              xlabel="ω (数字角频率)", ylabel="P(ω)",
              xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
              xtick_labels=["-π","-π/2","0","π/2","π"])
    # 白噪声
    p.curve(lambda w: 1.0, GREY, 2.0, 600)
    # 一阶系统：σ²/(1-2a cosω+a²)，a=0.8
    a = 0.8
    p.curve(lambda w: 1.62 / (1 - 2*a*math.cos(w) + a*a), BLUE, 2.4, 600)
    inner = p.render() + legend([], [(GREY,"白噪声：功率谱平坦"),
                                      (BLUE,"一阶系统：功率集中在低频（低通）")], 60, 268)
    return svg(W, H, "（六）功率谱密度形状对比", inner)


def plot_07_conv():
    """（七）卷积：两个矩形 → 三角形"""
    W, H = 620, 320
    p1 = Panel(60, 40, 160, 150, (-0.5, 4.5), (-0.2, 1.3),
               xlabel="n", ylabel="", title="x[n]", xticks=[0,1,2,3,4])
    p1.stems([(n,1.0) for n in range(0,3)], BLUE)
    p2 = Panel(230, 40, 160, 150, (-0.5, 4.5), (-0.2, 1.3),
               xlabel="n", ylabel="", title="h[n]", xticks=[0,1,2,3,4])
    p2.stems([(n,1.0) for n in range(0,3)], GREEN)
    p3 = Panel(400, 40, 160, 150, (-0.5, 5.5), (-0.2, 3.3),
               xlabel="n", ylabel="", title="y[n]=x*h", xticks=[0,1,2,3,4,5])
    p3.stems([(n, min(n+1, 5-n)) for n in range(0,5)], ORANGE)
    inner = p1.render() + p2.render() + p3.render()
    return svg(W, H, "（七）卷积：矩形 ⊛ 矩形 = 三角形", inner)


def plot_08_resp():
    """（八）一阶系统的单位脉冲响应与单位阶跃响应"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-0.5, 10.5), (-0.2, 2.2),
              xlabel="n", ylabel="幅度", xticks=[0,2,4,6,8,10])
    a, b = 0.7, 0.3
    h = [(n, b*a**n) for n in range(0, 11)]
    s = [(n, b*(1-a**(n+1))/(1-a)) for n in range(0, 11)]
    p.stems(h, BLUE)
    p.stems(s, ORANGE)
    inner = p.render() + legend([], [(BLUE,"单位脉冲响应 h[n]"),(ORANGE,"单位阶跃响应 s[n]")], 60, 268)
    return svg(W, H, "（八）一阶系统的两种基本响应", inner)


def plot_09_decomp():
    """（九）时域解法：零输入 + 零状态 = 全响应"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-0.5, 10.5), (-0.2, 2.3),
              xlabel="n", ylabel="y[n]", xticks=[0,2,4,6,8,10])
    zi = [(n, 0.5**(n+1)) for n in range(0, 11)]
    zs = [(n, 2*(1 - 0.5**(n+1))) for n in range(0, 11)]
    tot = [(n, 2 - 0.5**(n+1)) for n in range(0, 11)]
    p.stems(zi, GREEN)
    p.stems(zs, ORANGE)
    p.stems(tot, BLUE)
    inner = p.render() + legend([], [(GREEN,"零输入响应"),(ORANGE,"零状态响应"),(BLUE,"全响应")], 60, 268)
    return svg(W, H, "（九）全响应 = 零输入 + 零状态", inner)


def plot_10_digfreq():
    """（十）数字频率 2π 周期性：两条不同连续波，采样点相同"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-0.5, 10.5), (-1.25, 1.25),
              xlabel="t (连续) / n (整数采样)", ylabel="幅度", xticks=[0,2,4,6,8,10])
    p.curve(lambda t: math.sin(0.3*math.pi*t), BLUE, 2.0, 800)
    p.curve(lambda t: math.sin((0.3*math.pi + 2*math.pi)*t), ORANGE, 2.0, 800)
    # 采样点：两序列在整数 n 上重合
    for n in range(0, 11):
        yv = math.sin(0.3*math.pi*n)
        px = p.X(n); py = p.Y(yv)
        p.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="4" fill="#fff" stroke="{RED}" stroke-width="2"/>')
    p.add(f'<text x="{f(p.X(10))}" y="{f(p.Y(1.05))}" font-family="{FONT}" font-size="10.5" '
          f'fill="{RED}" text-anchor="end">整数 n 上的采样点完全重合</text>')
    inner = p.render() + legend([], [(BLUE,"sin(0.3π·t) 连续"),(ORANGE,"sin(2.3π·t) 连续（相差 2π）"),
                                      (RED,"离散采样值（两序列相同）")], 60, 268)
    return svg(W, H, "（十）数字频率的 2π 周期性", inner)


def plot_11_alias():
    """（十一）频谱周期延拓：满足 vs 不满足采样定理"""
    W, H = 340, 340
    # 图1：满足
    p1 = Panel(50, 40, 130, 130, (-3000, 3000), (0, 1.15),
               xlabel="f (Hz)", ylabel="", title="f_s > 2f_max",
               xticks=[-2000,0,2000], xtick_labels=["-2k","0","2k"])
    # 基带三角
    def base(f):
        return max(0.0, 1 - abs(f)/1000.0)
    p1.curve(base, BLUE, 2.0, 400)
    for k in [-2,-1,1,2]:
        p1.curve(lambda f, k=k: base(f - k*3000), BLUE, 1.4, 200)
    # 图2：不满足（重叠）
    p2 = Panel(200, 40, 130, 130, (-3000, 3000), (0, 1.15),
               xlabel="f (Hz)", ylabel="", title="f_s < 2f_max（混叠）",
               xticks=[-2000,0,2000], xtick_labels=["-2k","0","2k"])
    fs = 1500
    def base2(f):
        return max(0.0, 1 - abs(f)/1000.0)
    for k in range(-2,3):
        p2.curve(lambda f, k=k: base2(f - k*fs), RED, 1.8, 200)
    inner = p1.render() + p2.render()
    return svg(W, H, "（十一）采样后频谱的周期延拓", inner)


def plot_12_cascade():
    """（十二）级联系统的整体幅频响应（低通 × 陷波）"""
    W, H = 620, 300
    p = Panel(60, 50, 520, 200, (-math.pi, math.pi), (-0.1, 1.25),
              xlabel="ω", ylabel="|H(e^{jω})|",
              xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
              xtick_labels=["-π","-π/2","0","π/2","π"])
    a = 0.85
    # 一阶低通 H1
    def H1(w): return 1/math.sqrt(1 - 2*a*math.cos(w) + a*a)
    # 陷波 H2：在 ω=π/2 处下陷
    w0 = math.pi/2; r = 0.9
    def H2(w):
        num = math.sqrt(1 - 2*r*math.cos(w0)*math.cos(w) + r*r)
        den = math.sqrt(1 - 2*r*math.cos(w)*math.cos(w) + r*r)  # 近似
        return num/den if den>0 else 1
    def Htot(w): return H1(w)*H2(w)/H1(0)
    p.curve(Htot, BLUE, 2.4, 600)
    p.vline(math.pi/2, RED, 1.2, dash="4 3")
    inner = p.render() + legend([], [(BLUE,"级联整体 |H|：低通形状 + 陷波下陷"),
                                      (RED,"陷波频率 ω=π/2")], 60, 268)
    return svg(W, H, "（十二）级联系统的整体幅频响应", inner)


def plot_13_zplane():
    """（十三）z 平面：极点、零点与收敛域 ROC"""
    W, H = 360, 360
    # 用 Panel 画直角坐标平面，单位圆
    p = Panel(50, 40, 270, 270, (-1.6, 1.6), (-1.6, 1.6),
              xlabel="Re(z)", ylabel="Im(z)", xticks=[-1,0,1], yticks=[-1,0,1])
    cx, cy = p.X(0), p.Y(0)
    R = p.X(1) - p.X(0)
    # 单位圆
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{C_AXIS}" stroke-width="1.4" stroke-dasharray="5 4"/>')
    # ROC：|z|>0.5（因果），画圆环带（半透明）从 0.5R 到外
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.5)}" fill="{BLUE}" fill-opacity="0.08"/>')
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*0.5)}" fill="{C_BG}"/>')
    # 极点 z=0.5 (x)，零点 z=-0.5 (o)
    zp = (0.5, 0); zo = (-0.5, 0)
    px, py = p.X(zp[0]), p.Y(zp[1])
    p.add(f'<line x1="{f(px-6)}" y1="{f(py-6)}" x2="{f(px+6)}" y2="{f(py+6)}" stroke="{RED}" stroke-width="2.2"/>')
    p.add(f'<line x1="{f(px-6)}" y1="{f(py+6)}" x2="{f(px+6)}" y2="{f(py-6)}" stroke="{RED}" stroke-width="2.2"/>')
    ox_, oy_ = p.X(zo[0]), p.Y(zo[1])
    p.add(f'<circle cx="{f(ox_)}" cy="{f(oy_)}" r="5" fill="none" stroke="{BLUE}" stroke-width="2.2"/>')
    p.add(f'<text x="{f(px+8)}" y="{f(py-6)}" font-family="{FONT}" font-size="11" fill="{RED}">极点 0.5</text>')
    p.add(f'<text x="{f(ox_-44)}" y="{f(oy_-8)}" font-family="{FONT}" font-size="11" fill="{BLUE}">零点 -0.5</text>')
    p.add(f'<text x="{f(cx+R*0.5+4)}" y="{f(cy-6)}" font-family="{FONT}" font-size="10" fill="{C_SUB}">单位圆</text>')
    inner = p.render() + legend([], [(RED,"× 极点"),(BLUE,"○ 零点"),(BLUE,"蓝色区域 = ROC (|z|>0.5)")], 50, 320)
    return svg(W, H, "（十三）z 平面：极点、零点与 ROC", inner)


def plot_note_roc():
    """笔记：四种序列的 ROC 形状对照"""
    W, H = 620, 230
    # 4 个小 z 平面
    def mini(ox, title, ring_r, fill, note):
        p = Panel(ox, 30, 130, 150, (-1.4,1.4), (-1.4,1.4), title=title, xticks=[], yticks=[])
        cx, cy = p.X(0), p.Y(0); R = p.X(1)-p.X(0)
        p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{C_AXIS}" stroke-width="1.2" stroke-dasharray="4 3"/>')
        if ring_r:
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.4)}" fill="{fill}" fill-opacity="0.10"/>')
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*ring_r)}" fill="{C_BG}"/>')
        else:
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.4)}" fill="{fill}" fill-opacity="0.10"/>')
        p.add(f'<text x="{f(cx)}" y="{f(cy+R+14)}" font-family="{FONT}" font-size="10" fill="{C_SUB}" text-anchor="middle">{esc(note)}</text>')
        return p.render()
    inner = (mini(40, "因果（右边）", 0.5, BLUE, "ROC: |z|>r")
           + mini(180, "反因果（左边）", 0.5, ORANGE, "ROC: |z|<r")
           + mini(320, "双边（圆环）", 0.5, GREEN, "r1<|z|<r2")
           + mini(460, "有限长（全平面）", None, PURPLE, "除 z=0/∞ 外"))
    return svg(W, H, "笔记：四类序列的收敛域 ROC 形状", inner)


# ============================ 写出 ============================
PLOTS = {
    "dsp01-periodic.svg": plot_01_periodic,
    "dsp02-timeinv.svg": plot_02_timeinv,
    "dsp03-energy.svg": plot_03_energy,
    "dsp04-autocorr.svg": plot_04_autocorr,
    "dsp05-wienerkhinchin.svg": plot_05_wk,
    "dsp06-psd.svg": plot_06_psd,
    "dsp07-conv.svg": plot_07_conv,
    "dsp08-response.svg": plot_08_resp,
    "dsp09-decomp.svg": plot_09_decomp,
    "dsp10-digfreq.svg": plot_10_digfreq,
    "dsp11-alias.svg": plot_11_alias,
    "dsp12-cascade.svg": plot_12_cascade,
    "dsp13-zplane.svg": plot_13_zplane,
    "dsp-note-roc.svg": plot_note_roc,
}

for name, fn in PLOTS.items():
    svg_str = fn()
    # 校验 well-formed
    minidom.parseString(svg_str)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fp:
        fp.write(svg_str)
    print("OK", name)
print("总计", len(PLOTS), "张")
