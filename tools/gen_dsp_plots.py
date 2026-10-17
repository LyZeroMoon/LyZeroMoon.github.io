# -*- coding: utf-8 -*-
"""
生成 DSP 系列文章所需的函数图像（自包含 SVG，零第三方依赖）。
中文标签由浏览器字体渲染，矢量清晰，可直接版本管理。
输出目录：source/images/dsp/

设计目标：清晰明了
- 画布放大、字号放大（标题/轴标签/刻度/图例均加粗放大）
- 线加粗、离散序列用"棒棒糖"茎叶图（细茎 + 大圆点）
- 多子图拉开间距，避免拥挤
- 连续参考波用浅色低透明度绘制，不与采样点争夺注意力
- 图例带浅底框，文字更大
"""
import math, os, xml.dom.minidom as minidom

OUT = os.path.join(os.path.dirname(__file__), "..", "source", "images", "dsp")
os.makedirs(OUT, exist_ok=True)

# ---- 配色（适配亮色主题，深轴、彩色曲线，强对比）----
C_BG = "#ffffff"
C_BORDER = "#d7dee8"
C_AXIS = "#3a4250"
C_GRID = "#eef1f6"
C_TEXT = "#1f2733"
C_TITLE = "#121a26"
C_SUB = "#5a6472"
BLUE = "#1f6fe0"
ORANGE = "#e8590c"
GREEN = "#2b8a3e"
PURPLE = "#9c36b5"
RED = "#e03131"
TEAL = "#0c8599"
GREY = "#868e96"

FONT = "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"

def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def f(v):
    return f"{v:.2f}"

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

    # ---- 基础图元 ----
    def line(self, x1, y1, x2, y2, color=C_AXIS, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{f(self.X(x1))}" y1="{f(self.Y(y1))}" x2="{f(self.X(x2))}" '
                 f'y2="{f(self.Y(y2))}" stroke="{color}" stroke-width="{width}"{d}/>')

    def polyline(self, pts, color, width=3):
        p = " ".join(f"{f(self.X(x))},{f(self.Y(y))}" for x, y in pts)
        self.add(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{width}" '
                 f'stroke-linejoin="round" stroke-linecap="round"/>')

    def curve(self, fn, color, width=3, n=600):
        x0, x1 = self.xlim
        pts = []
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            try:
                y = fn(x)
            except Exception:
                continue
            if y is None or math.isnan(y) or math.isinf(y):
                continue
            pts.append((x, y))
        self.polyline(pts, color, width)

    def curve_guide(self, fn, color, opacity=0.28, width=2, n=600):
        """浅色连续参考波（如周期序列的底层正弦）"""
        x0, x1 = self.xlim
        pts = []
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            try:
                y = fn(x)
            except Exception:
                continue
            if y is None or math.isnan(y) or math.isinf(y):
                continue
            pts.append((x, y))
        p = " ".join(f"{f(self.X(x))},{f(self.Y(y))}" for x, y in pts)
        self.add(f'<polyline points="{p}" fill="none" stroke="{color}" stroke-width="{width}" '
                 f'stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"/>')

    def stems(self, seq, color=BLUE, marker_r=4.8, stem_opacity=0.55):
        """离散序列棒棒糖图：细茎 + 大圆点"""
        base = self.Y(0)
        for n, v in seq:
            px = self.X(n); py = self.Y(v)
            self.add(f'<line x1="{f(px)}" y1="{f(base)}" x2="{f(px)}" y2="{f(py)}" '
                     f'stroke="{color}" stroke-width="1.8" opacity="{stem_opacity}"/>')
            self.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="{marker_r}" fill="{color}" '
                     f'stroke="#fff" stroke-width="1.4"/>')

    def dots(self, pts, color, r=5):
        for x, y in pts:
            self.add(f'<circle cx="{f(self.X(x))}" cy="{f(self.Y(y))}" r="{r}" '
                     f'fill="{color}" stroke="#fff" stroke-width="1.4"/>')

    def hline(self, y, color=C_AXIS, width=1, dash=None):
        self.line(self.xlim[0], y, self.xlim[1], y, color, width, dash)

    def vline(self, x, color=C_AXIS, width=1, dash=None):
        self.line(x, self.ylim[0], x, self.ylim[1], color, width, dash)

    def render(self):
        s = []
        # 边框
        s.append(f'<rect x="{f(self.ox)}" y="{f(self.oy)}" width="{f(self.w)}" height="{f(self.h)}" '
                 f'fill="none" stroke="{C_BORDER}" stroke-width="1.2" rx="6"/>')
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
        x0p = self.X(self.xlim[0]); x1p = self.X(self.xlim[1]); xaxp = self.Y(xax)
        s.append(f'<line x1="{f(x0p)}" y1="{f(xaxp)}" x2="{f(x1p)}" y2="{f(xaxp)}" '
                 f'stroke="{C_AXIS}" stroke-width="2.2" marker-end="url(#arr)"/>')
        y0p = self.Y(self.ylim[0]); y1p = self.Y(self.ylim[1]); yaxp_x = self.X(yax)
        s.append(f'<line x1="{f(yaxp_x)}" y1="{f(y1p)}" x2="{f(yaxp_x)}" y2="{f(y0p)}" '
                 f'stroke="{C_AXIS}" stroke-width="2.2" marker-end="url(#arr)"/>')
        # ticks + labels
        for t in self.xticks:
            px = self.X(t); py = self.Y(xax)
            s.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px)}" y2="{f(py+5)}" stroke="{C_AXIS}" stroke-width="1.3"/>')
            lab = self.xtick_labels[self.xticks.index(t)] if self.xtick_labels else fmt(t)
            s.append(f'<text x="{f(px)}" y="{f(py+18)}" font-family="{FONT}" font-size="13" '
                     f'fill="{C_SUB}" text-anchor="middle">{esc(lab)}</text>')
        for t in self.yticks:
            px = self.X(yax); py = self.Y(t)
            s.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px-5)}" y2="{f(py)}" stroke="{C_AXIS}" stroke-width="1.3"/>')
            lab = self.ytick_labels[self.yticks.index(t)] if self.ytick_labels else fmt(t)
            s.append(f'<text x="{f(px-8)}" y="{f(py+4)}" font-family="{FONT}" font-size="13" '
                     f'fill="{C_SUB}" text-anchor="end">{esc(lab)}</text>')
        # 轴标题
        if self.xlabel:
            s.append(f'<text x="{f(self.ox+self.w/2)}" y="{f(self.oy+self.h+34)}" font-family="{FONT}" '
                     f'font-size="15" fill="{C_TEXT}" text-anchor="middle">{esc(self.xlabel)}</text>')
        if self.ylabel:
            s.append(f'<text x="{f(self.ox-42)}" y="{f(self.oy+self.h/2)}" font-family="{FONT}" '
                     f'font-size="15" fill="{C_TEXT}" text-anchor="middle" '
                     f'transform="rotate(-90 {f(self.ox-42)} {f(self.oy+self.h/2)})">{esc(self.ylabel)}</text>')
        if self.title:
            s.append(f'<text x="{f(self.ox+self.w/2)}" y="{f(self.oy-12)}" font-family="{FONT}" '
                     f'font-size="16" fill="{C_TITLE}" font-weight="700" text-anchor="middle">{esc(self.title)}</text>')
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

def legend(items, x, y, box_w=None):
    """items: list of (color, label)。带浅底框的图例。"""
    maxlen = max((len(lab) for _, lab in items), default=10)
    w = box_w or (maxlen * 15 + 60)
    h = 16 + len(items) * 26
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="8" '
           f'fill="#f7f9fc" stroke="{C_BORDER}" stroke-width="1"/>']
    cy = y + 22
    for color, label in items:
        out.append(f'<line x1="{f(x+16)}" y1="{f(cy)}" x2="{f(x+42)}" y2="{f(cy)}" '
                   f'stroke="{color}" stroke-width="3.2"/>')
        out.append(f'<circle cx="{f(x+29)}" cy="{f(cy)}" r="4.6" fill="{color}"/>')
        out.append(f'<text x="{f(x+54)}" y="{f(cy+5)}" font-family="{FONT}" font-size="14" '
                   f'fill="{C_TEXT}">{esc(label)}</text>')
        cy += 26
    return "".join(out)

def svg(doc_w, doc_h, title, inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {doc_w} {doc_h}" '
            f'width="100%" preserveAspectRatio="xMidYMid meet" '
            f'style="max-width:{doc_w}px;background:{C_BG};border:1px solid {C_BORDER};border-radius:10px;">'
            f'<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="7" refY="3.5" '
            f'orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 Z" fill="{C_AXIS}"/></marker></defs>'
            f'<text x="{doc_w/2}" y="30" font-family="{FONT}" font-size="21" font-weight="800" '
            f'fill="{C_TITLE}" text-anchor="middle">{esc(title)}</text>'
            f'{inner}</svg>')


# ============================ 各图 ============================

def plot_01_periodic():
    """（一）周期性：周期序列 vs 非周期序列（上下两图，各带底层正弦参考）"""
    W, H = 720, 500
    p1 = Panel(75, 60, 580, 160, (-0.5, 16.5), (-1.3, 1.3),
               title="周期序列 x[n] = sin(πn/4)：每 8 点重复",
               xticks=[0,2,4,6,8,10,12,14,16])
    p1.curve_guide(lambda t: math.sin(math.pi*t/4), C_AXIS, opacity=0.22, width=2)
    p1.stems([(n, math.sin(math.pi*n/4)) for n in range(0, 17)], BLUE)
    p1.vline(8, GREEN, 1.4, dash="5 4")
    p1.add(f'<text x="{f(p1.X(8))}" y="{f(p1.Y(1.2))}" font-family="{FONT}" font-size="13" '
           f'fill="{GREEN}" text-anchor="middle">周期 N=8</text>')

    p2 = Panel(75, 280, 580, 160, (-0.5, 16.5), (-1.3, 1.3),
               title="非周期序列 x[n] = sin(√2·n)：采样点永不重复",
               xlabel="n (采样点序号)",
               xticks=[0,2,4,6,8,10,12,14,16])
    p2.curve_guide(lambda t: math.sin(math.sqrt(2)*t), C_AXIS, opacity=0.22, width=2)
    p2.stems([(n, math.sin(math.sqrt(2)*n)) for n in range(0, 17)], ORANGE)
    inner = p1.render() + p2.render()
    return svg(W, H, "（一）序列的周期性：采样点是否重复", inner)


def plot_02_timeinv():
    """（二）时不变性：输入平移 → 输出同样平移（上下两图）"""
    n = list(range(0, 8))
    x  = [0, 0, 1, 1, 1, 0, 0, 0]      # 原输入（脉冲串，n=2,3,4）
    x2 = [0, 0, 0, 0, 1, 1, 1, 0]      # 右移 2：x[n-2]
    def sys(seq):
        out = []
        for i in range(len(seq)):
            v = 0.5 * seq[i]
            if i - 1 >= 0:
                v += 0.5 * seq[i - 1]
            out.append(v)
        return out
    y, y2 = sys(x), sys(x2)
    W, H = 720, 545
    p1 = Panel(75, 60, 580, 160, (-0.5, 7.5), (-0.3, 1.3),
               title="输入：x[n]（蓝）与 x[n-2]（橙，整体右移 2）",
               xticks=list(range(0, 8)))
    p1.stems([(i, x[i]) for i in n], BLUE)
    p1.stems([(i, x2[i]) for i in n], ORANGE)
    p1.vline(2, GREEN, 1.3, dash="5 4")
    p2 = Panel(75, 285, 580, 160, (-0.5, 7.5), (-0.3, 1.3),
               title="输出：y[n]（蓝）与 y[n-2]（橙，同样右移 2）",
               xlabel="n",
               xticks=list(range(0, 8)))
    p2.stems([(i, y[i]) for i in n], BLUE)
    p2.stems([(i, y2[i]) for i in n], ORANGE)
    p2.vline(4, GREEN, 1.3, dash="5 4")
    inner = p1.render() + p2.render()
    inner += legend([(BLUE, "原输入 x[n] / 原输出 y[n]"),
                     (ORANGE, "平移后输入 x[n-2] / 输出 y[n-2]")], 75, 465)
    return svg(W, H, "（二）时不变性：输入平移，输出同样平移", inner)


def plot_03_energy():
    """（三）能量信号（衰减）vs 功率信号（恒定）"""
    W, H = 720, 490
    p = Panel(75, 65, 580, 320, (-0.5, 10.5), (-0.2, 1.25),
              xlabel="n", ylabel="幅度", xticks=[0,2,4,6,8,10])
    a = 0.8
    p.stems([(n, a**n) for n in range(0, 11)], BLUE)
    p.stems([(n, 1.0) for n in range(0, 11)], ORANGE)
    inner = p.render() + legend([(BLUE, "0.8ⁿ·u[n]：幅度衰减 → 能量有限"),
                                 (ORANGE, "u[n]：幅度恒定 → 功率有限、能量无穷")], 75, 405)
    return svg(W, H, "（三）能量信号（衰减）与功率信号（恒定）", inner)


def plot_04_autocorr():
    """（四）矩形脉冲与其自相关（三角）"""
    W, H = 740, 470
    p1 = Panel(70, 60, 300, 320, (-1.5, 6.5), (-0.3, 1.4),
               title="原信号 x[n]", xlabel="n", ylabel="x[n]", xticks=[0,1,2,3,4,5])
    p1.stems([(n, 1.0) for n in range(0, 5)], BLUE)
    p2 = Panel(400, 60, 300, 320, (-4.5, 4.5), (-0.3, 5.4),
               title="自相关 r[m]", xlabel="m", ylabel="r[m]", xticks=[-4,-2,0,2,4])
    p2.stems([(m, 5 - abs(m)) for m in range(-4, 5)], GREEN)
    inner = p1.render() + p2.render()
    return svg(W, H, "（四）矩形脉冲与其自相关（三角形）", inner)


def plot_05_wk():
    """（五）维纳-辛钦：r[m]（衰减）↔ PSD（洛伦兹）"""
    W, H = 740, 470
    a = 0.7
    p1 = Panel(70, 60, 300, 320, (-8.5, 8.5), (-0.2, 1.3),
               title="自相关 r[m]", xlabel="m", ylabel="r[m]", xticks=[-8,-4,0,4,8])
    p1.stems([(m, a**abs(m)) for m in range(-8, 9)], BLUE)
    p2 = Panel(400, 60, 300, 320, (-math.pi, math.pi), (0, 2.3),
               title="功率谱 P(ω)", xlabel="ω", ylabel="P(ω)",
               xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"])
    p2.curve(lambda w: (1 - a*a) / (1 - 2*a*math.cos(w) + a*a), RED, 3, 600)
    inner = p1.render() + p2.render()
    return svg(W, H, "（五）维纳-辛钦：时域自相关 ↔ 频域功率谱", inner)


def plot_06_psd():
    """（六）功率谱密度：白噪声（平坦）vs 一阶系统（低通）"""
    W, H = 720, 490
    p = Panel(75, 65, 580, 320, (-math.pi, math.pi), (0, 5.4),
              xlabel="ω (数字角频率)", ylabel="P(ω)",
              xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
              xtick_labels=["-π","-π/2","0","π/2","π"])
    p.curve(lambda w: 1.0, GREY, 2.6, 600)
    a = 0.8
    p.curve(lambda w: 1.62 / (1 - 2*a*math.cos(w) + a*a), BLUE, 3.4, 600)
    inner = p.render() + legend([(GREY, "白噪声：功率谱平坦（各频率等能量）"),
                                 (BLUE, "一阶系统：功率集中在低频（低通）")], 75, 405)
    return svg(W, H, "（六）功率谱密度形状对比", inner)


def plot_07_conv():
    """（七）卷积：两个矩形 → 三角形"""
    W, H = 780, 460
    p1 = Panel(55, 70, 220, 300, (-0.5, 3.5), (-0.2, 1.4),
               title="x[n]", xlabel="n", xticks=[0,1,2,3])
    p1.stems([(n,1.0) for n in range(0,3)], BLUE)
    p2 = Panel(295, 70, 220, 300, (-0.5, 3.5), (-0.2, 1.4),
               title="h[n]", xlabel="n", xticks=[0,1,2,3])
    p2.stems([(n,1.0) for n in range(0,3)], GREEN)
    p3 = Panel(535, 70, 220, 300, (-0.5, 5.5), (-0.2, 3.4),
               title="y[n] = x * h", xlabel="n", xticks=[0,1,2,3,4,5])
    p3.stems([(n, min(n+1, 5-n)) for n in range(0,5)], ORANGE)
    inner = p1.render() + p2.render() + p3.render()
    return svg(W, H, "（七）卷积：矩形 ⊛ 矩形 = 三角形", inner)


def plot_08_resp():
    """（八）一阶系统的单位脉冲响应与单位阶跃响应"""
    W, H = 720, 490
    p = Panel(75, 65, 580, 320, (-0.5, 10.5), (-0.2, 2.3),
              xlabel="n", ylabel="幅度", xticks=[0,2,4,6,8,10])
    a, b = 0.7, 0.3
    p.stems([(n, b*a**n) for n in range(0, 11)], BLUE)
    p.stems([(n, b*(1-a**(n+1))/(1-a)) for n in range(0, 11)], ORANGE)
    inner = p.render() + legend([(BLUE, "单位脉冲响应 h[n] = 0.3·0.7ⁿ"),
                                 (ORANGE, "单位阶跃响应 s[n]：趋于稳态 1")], 75, 405)
    return svg(W, H, "（八）一阶系统的两种基本响应", inner)


def plot_09_decomp():
    """（九）时域解法：零输入 + 零状态 = 全响应"""
    W, H = 720, 510
    p = Panel(75, 65, 580, 320, (-0.5, 10.5), (-0.2, 2.4),
              xlabel="n", ylabel="y[n]", xticks=[0,2,4,6,8,10])
    zi  = [(n, 0.5**(n+1)) for n in range(0, 11)]
    zs  = [(n, 2*(1 - 0.5**(n+1))) for n in range(0, 11)]
    tot = [(n, 2 - 0.5**(n+1)) for n in range(0, 11)]
    p.stems(zi, GREEN)
    p.stems(zs, ORANGE)
    p.stems(tot, BLUE)
    inner = p.render() + legend([(GREEN, "零输入响应 y_zi[n]"),
                                 (ORANGE, "零状态响应 y_zs[n]"),
                                 (BLUE, "全响应 y[n] = y_zi + y_zs")], 75, 405)
    return svg(W, H, "（九）全响应 = 零输入 + 零状态", inner)


def plot_10_digfreq():
    """（十）数字频率 2π 周期性：连续波不同，但整数采样相同"""
    W, H = 720, 580
    p1 = Panel(75, 60, 580, 160, (-0.5, 10.5), (-1.3, 1.3),
               title="连续时间：两条不同的正弦波",
               xticks=[0,2,4,6,8,10])
    p1.curve(lambda t: math.sin(0.3*math.pi*t), BLUE, 3, 800)
    p1.curve(lambda t: math.sin((0.3*math.pi + 2*math.pi)*t), ORANGE, 3, 800)
    p2 = Panel(75, 285, 580, 160, (-0.5, 10.5), (-1.3, 1.3),
               title="离散采样：两序列在整数 n 上完全重合",
               xlabel="n (整数采样点)",
               xticks=[0,2,4,6,8,10])
    # 红色采样环：两序列在整数 n 处值相同
    for n in range(0, 11):
        yv = math.sin(0.3*math.pi*n)
        p2.add(f'<circle cx="{f(p2.X(n))}" cy="{f(p2.Y(yv))}" r="6" '
               f'fill="{RED}" stroke="#fff" stroke-width="1.6"/>')
    p2.add(f'<text x="{f(p2.X(10))}" y="{f(p2.Y(1.15))}" font-family="{FONT}" font-size="13" '
           f'fill="{RED}" text-anchor="end">两序列采样值完全相同 → 不可区分</text>')
    inner = p1.render() + p2.render() + legend([(BLUE, "sin(0.3π·t) 连续波"),
                                                (ORANGE, "sin(2.3π·t) 连续波（相差 2π）"),
                                                (RED, "离散采样值（两序列相同）")], 75, 465)
    return svg(W, H, "（十）数字频率的 2π 周期性", inner)


def plot_11_alias():
    """（十一）频谱周期延拓：满足 vs 不满足采样定理"""
    W, H = 740, 480
    def base(f, fmax=1000.0):
        return max(0.0, 1 - abs(f)/fmax)
    p1 = Panel(70, 60, 300, 330, (-3000, 3000), (0, 1.2),
               title="f_s > 2f_max：无混叠", xlabel="f (Hz)", ylabel="X(f)",
               xticks=[-2000,0,2000], xtick_labels=["-2k","0","2k"])
    p1.curve(lambda f: base(f), BLUE, 3, 400)
    for k in [-2,-1,1,2]:
        p1.curve(lambda f, k=k: base(f - k*3000), BLUE, 2, 200)
    p2 = Panel(400, 60, 300, 330, (-3000, 3000), (0, 1.2),
               title="f_s < 2f_max：混叠", xlabel="f (Hz)", ylabel="X(f)",
               xticks=[-2000,0,2000], xtick_labels=["-2k","0","2k"])
    fs = 1500
    for k in range(-2,3):
        p2.curve(lambda f, k=k: base(f - k*fs), RED, 2.4, 200)
    p2.add(f'<text x="{f(p2.X(0))}" y="{f(p2.Y(1.05))}" font-family="{FONT}" font-size="13" '
           f'fill="{RED}" text-anchor="middle">副本重叠 → 信息丢失</text>')
    inner = p1.render() + p2.render()
    return svg(W, H, "（十一）采样后频谱的周期延拓", inner)


def plot_12_cascade():
    """（十二）级联系统的整体幅频响应（低通 × 陷波）"""
    W, H = 720, 490
    p = Panel(75, 65, 580, 320, (-math.pi, math.pi), (-0.1, 1.3),
              xlabel="ω", ylabel="|H(e^{jω})|",
              xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
              xtick_labels=["-π","-π/2","0","π/2","π"])
    a = 0.85
    def H1(w): return 1/math.sqrt(1 - 2*a*math.cos(w) + a*a)
    w0 = math.pi/2; r = 0.9
    def H2(w):
        num = math.sqrt(1 - 2*r*math.cos(w0)*math.cos(w) + r*r)
        den = math.sqrt(1 - 2*r*math.cos(w)*math.cos(w) + r*r)
        return num/den if den > 0 else 1
    def Htot(w): return H1(w)*H2(w)/H1(0)
    p.curve(Htot, BLUE, 3.4, 600)
    p.vline(math.pi/2, RED, 1.6, dash="5 4")
    inner = p.render() + legend([(BLUE, "级联整体 |H|：低通形状 + 陷波下陷"),
                                 (RED, "陷波频率 ω = π/2")], 75, 405)
    return svg(W, H, "（十二）级联系统的整体幅频响应", inner)


def plot_13_zplane():
    """（十三）z 平面：极点、零点与收敛域 ROC"""
    W, H = 470, 525
    p = Panel(70, 60, 350, 350, (-1.6, 1.6), (-1.6, 1.6),
              title="", xlabel="Re(z)", ylabel="Im(z)", xticks=[-1,0,1], yticks=[-1,0,1])
    cx, cy = p.X(0), p.Y(0); R = p.X(1) - p.X(0)
    # ROC：|z|>0.5（因果），圆环带（半透明）
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.5)}" fill="{BLUE}" fill-opacity="0.10"/>')
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*0.5)}" fill="{C_BG}"/>')
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*0.5)}" fill="none" stroke="{BLUE}" stroke-width="1.4" stroke-dasharray="5 4"/>')
    # 单位圆
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{C_AXIS}" stroke-width="1.6" stroke-dasharray="6 4"/>')
    p.add(f'<text x="{f(cx+R+6)}" y="{f(cy+5)}" font-family="{FONT}" font-size="13" fill="{C_SUB}">单位圆</text>')
    # 极点 z=0.5 (x)，零点 z=-0.5 (o)
    zp = (0.5, 0); zo = (-0.5, 0)
    px, py = p.X(zp[0]), p.Y(zp[1])
    p.add(f'<line x1="{f(px-8)}" y1="{f(py-8)}" x2="{f(px+8)}" y2="{f(py+8)}" stroke="{RED}" stroke-width="3"/>')
    p.add(f'<line x1="{f(px-8)}" y1="{f(py+8)}" x2="{f(px+8)}" y2="{f(py-8)}" stroke="{RED}" stroke-width="3"/>')
    ox_, oy_ = p.X(zo[0]), p.Y(zo[1])
    p.add(f'<circle cx="{f(ox_)}" cy="{f(oy_)}" r="6.5" fill="none" stroke="{BLUE}" stroke-width="3"/>')
    p.add(f'<text x="{f(px+12)}" y="{f(py-8)}" font-family="{FONT}" font-size="13" fill="{RED}">极点 0.5</text>')
    p.add(f'<text x="{f(ox_-58)}" y="{f(oy_-12)}" font-family="{FONT}" font-size="13" fill="{BLUE}">零点 -0.5</text>')
    inner = p.render() + legend([(RED, "× 极点 z = 0.5"),
                                 (BLUE, "○ 零点 z = -0.5"),
                                 (BLUE, "蓝色区域 = ROC（|z| > 0.5，因果）")], 70, 425)
    return svg(W, H, "（十三）z 平面：极点、零点与 ROC", inner)


def plot_14_rect_sinc():
    """（十四）矩形脉冲 → sinc 形幅频响应（含零点标注）"""
    W, H = 740, 470
    p1 = Panel(70, 60, 300, 320, (-0.5, 4.5), (-0.3, 1.4),
               title="时域：矩形脉冲 x[n]", xlabel="n", ylabel="x[n]", xticks=[0,1,2,3,4])
    p1.stems([(n, 1.0) for n in range(0, 5)], BLUE)
    p2 = Panel(400, 60, 300, 320, (-math.pi, math.pi), (0, 5.4),
               title="频域：|X(e^{jω})|（sinc 形）", xlabel="ω", ylabel="|X(e^{jω})|",
               xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"])
    def mag(w):
        s = math.sin(w/2)
        return abs(math.sin(5*w/2)/s) if abs(s) > 1e-9 else 5.0
    p2.curve(mag, GREEN, 3.4, 800)
    # 零点：ω = ±2π/5, ±4π/5
    for k in (1, 2):
        for z in (2*math.pi*k/5, -2*math.pi*k/5):
            p2.vline(z, RED, 1.4, dash="4 3")
    p2.add(f'<text x="{f(p2.X(2*math.pi/5))}" y="{f(p2.Y(5.1))}" font-family="{FONT}" font-size="12" '
           f'fill="{RED}" text-anchor="middle">零点 ω=2π/5</text>')
    p2.add(f'<text x="{f(p2.X(-2*math.pi/5))}" y="{f(p2.Y(5.1))}" font-family="{FONT}" font-size="12" '
           f'fill="{RED}" text-anchor="middle">零点 ω=-2π/5</text>')
    inner = p1.render() + p2.render()
    return svg(W, H, "（十四）矩形脉冲的 DTFT：时域是方门，频域是 sinc", inner)


def plot_14_zcircle():
    """（十四）z 平面单位圆 ↔ DTFT：绕单位圆一周 = ω 扫过 2π"""
    W, H = 460, 545
    # 上：z 平面
    p = Panel(80, 60, 300, 300, (-1.5, 1.5), (-1.5, 1.5),
              xlabel="Re(z)", ylabel="Im(z)", xticks=[-1, 0, 1], yticks=[-1, 0, 1])
    cx, cy = p.X(0), p.Y(0); R = p.X(1) - p.X(0)
    # 单位圆（加粗高亮）
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{BLUE}" '
          f'stroke-width="3.5"/>')
    p.add(f'<text x="{f(cx + R + 8)}" y="{f(cy - 8)}" font-family="{FONT}" font-size="14" '
          f'fill="{BLUE}" font-weight="700">单位圆 |z| = 1</text>')
    # 单位圆内一点（示意 ROC 外/极点区）
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*0.55)}" fill="{BLUE}" fill-opacity="0.08"/>')
    p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*0.55)}" fill="none" stroke="{GREY}" '
          f'stroke-width="1.3" stroke-dasharray="5 4"/>')
    p.add(f'<text x="{f(cx - R*0.42)}" y="{f(cy - R*0.42)}" font-family="{FONT}" font-size="11.5" '
          f'fill="{C_SUB}" text-anchor="middle">ROC 内（|z|>r）</text>')
    # 角频率点 z = e^{jω0}
    w0 = 0.85
    zx, zy = math.cos(w0), math.sin(w0)
    px, py = p.X(zx), p.Y(zy)
    # 单位圆上的角弧（半径略大，便于看清方向）
    arc = []
    for i in range(41):
        a = w0 * i / 40
        arc.append((p.X(1.18*math.cos(a)), p.Y(1.18*math.sin(a))))
    p.add('<polyline points="' + " ".join(f"{f(x)},{f(y)}" for x, y in arc) +
          f'" fill="none" stroke="{ORANGE}" stroke-width="2" stroke-linecap="round"/>')
    # 弧末端箭头
    aend = w0; ex, ey = p.X(1.18*math.cos(aend)), p.Y(1.18*math.sin(aend))
    p.add(f'<line x1="{f(ex-6)}" y1="{f(ey+7)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{ORANGE}" stroke-width="2.4"/>')
    p.add(f'<line x1="{f(ex-1)}" y1="{f(ey+7)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{ORANGE}" stroke-width="2.4"/>')
    # 半径线 + 点
    p.add(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(px)}" y2="{f(py)}" stroke="{C_AXIS}" stroke-width="1.6" stroke-dasharray="4 3"/>')
    p.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="7" fill="{RED}" stroke="#fff" stroke-width="1.8"/>')
    p.add(f'<text x="{f(px + 10)}" y="{f(py - 6)}" font-family="{FONT}" font-size="14" '
          f'fill="{RED}" font-weight="700">z = e^{"{jω}"}</text>')
    p.add(f'<text x="{f(cx + R*0.55)}" y="{f(cy + R*0.72)}" font-family="{FONT}" font-size="12.5" '
          f'fill="{ORANGE}">逆时针一圈 = ω 从 0 到 2π</text>')
    # 下：ω 轴
    p2 = Panel(80, 430, 300, 55, (-math.pi, math.pi), (-1, 1),
               xlabel="ω (数字角频率)", xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"], yticks=[], grid=False)
    p2.hline(0, C_AXIS, 2)
    for wv, col in ((-math.pi, GREY), (0, C_AXIS), (math.pi, GREY)):
        p2.add(f'<circle cx="{f(p2.X(wv))}" cy="{f(p2.Y(0))}" r="5" fill="{col}" stroke="#fff" stroke-width="1.4"/>')
    inner = p.render() + p2.render()
    return svg(W, H, "（十四）单位圆上的 Z 变换就是 DTFT", inner)


def plot_14_symmetry():
    """（十四）实序列的共轭对称：|X| 为偶函数、∠X 为奇函数"""
    W, H = 780, 460
    a = 0.7
    p1 = Panel(55, 70, 220, 300, (-0.5, 9.5), (-0.2, 1.25),
               title="时域：x[n] = aⁿu[n]", xlabel="n", ylabel="x[n]", xticks=[0,2,4,6,8])
    p1.stems([(n, a**n) for n in range(0, 10)], BLUE)
    p2 = Panel(295, 70, 220, 300, (-math.pi, math.pi), (0, 3.4),
               title="幅频 |X(e^{jω})|（偶）", xlabel="ω", ylabel="|X|",
               xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"])
    p2.curve(lambda w: 1/math.sqrt(1 - 2*a*math.cos(w) + a*a), GREEN, 3.2, 700)
    p2.vline(0, RED, 1.4, dash="4 3")
    p2.add(f'<text x="{f(p2.X(0)+6)}" y="{f(p2.Y(3.1))}" font-family="{FONT}" font-size="12" '
           f'fill="{RED}">左右镜像</text>')
    p3 = Panel(535, 70, 220, 300, (-math.pi, math.pi), (-3.4, 3.4),
               title="相频 ∠X(e^{jω})（奇）", xlabel="ω", ylabel="∠X",
               xticks=[-math.pi, -math.pi/2, 0, math.pi/2, math.pi],
               xtick_labels=["-π","-π/2","0","π/2","π"],
               yticks=[-3, 0, 3], ytick_labels=["-π","0","π"])
    def phase(w):
        return math.atan2(-a*math.sin(w), 1 - a*math.cos(w))
    p3.curve(phase, PURPLE, 3.2, 700)
    p3.vline(0, RED, 1.4, dash="4 3")
    p3.add(f'<text x="{f(p3.X(0)+6)}" y="{f(p3.Y(-3.0))}" font-family="{FONT}" font-size="12" '
           f'fill="{RED}">过原点、奇对称</text>')
    inner = p1.render() + p2.render() + p3.render()
    return svg(W, H, "（十四）实序列的共轭对称性：幅度偶、相位奇", inner)


def plot_note_roc():
    """笔记：四种序列的 ROC 形状对照"""
    W, H = 780, 320
    def mini(ox, title, ring_r, fill, note, notecolor):
        p = Panel(ox, 55, 170, 190, (-1.4,1.4), (-1.4,1.4), title=title, xticks=[], yticks=[])
        cx, cy = p.X(0), p.Y(0); R = p.X(1)-p.X(0)
        if ring_r:
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.5)}" fill="{fill}" fill-opacity="0.12"/>')
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*ring_r)}" fill="{C_BG}"/>')
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*ring_r)}" fill="none" stroke="{fill}" stroke-width="1.4" stroke-dasharray="5 4"/>')
        else:
            p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R*1.5)}" fill="{fill}" fill-opacity="0.12"/>')
        p.add(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="none" stroke="{C_AXIS}" stroke-width="1.4" stroke-dasharray="5 4"/>')
        p.add(f'<text x="{f(cx)}" y="{f(cy+R+18)}" font-family="{FONT}" font-size="12.5" '
              f'fill="{notecolor}" text-anchor="middle">{esc(note)}</text>')
        return p.render()
    inner = (mini(40,  "因果（右边）", 0.5, BLUE,   "ROC: |z| > r",   BLUE)
           + mini(212, "反因果（左边）", 0.5, ORANGE, "ROC: |z| < r",   ORANGE)
           + mini(384, "双边（圆环）", 0.5, GREEN,  "r₁ < |z| < r₂", GREEN)
           + mini(556, "有限长（全平面）", None, PURPLE, "除 z=0/∞ 外", PURPLE))
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
    "dsp14-rect-sinc.svg": plot_14_rect_sinc,
    "dsp14-zcircle.svg": plot_14_zcircle,
    "dsp14-symmetry.svg": plot_14_symmetry,
    "dsp-note-roc.svg": plot_note_roc,
}

for name, fn in PLOTS.items():
    svg_str = fn()
    minidom.parseString(svg_str)  # 校验 well-formed
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fp:
        fp.write(svg_str)
    print("OK", name)
print("总计", len(PLOTS), "张")
