---
title: Z 变换表与性质
layout: note
permalink: /notes/z-变换表与性质/
updated: 2026-10-20 23:30:00
categories:
  - 数字信号处理DSP
---

# Z 变换表与性质

> 配套阅读：[[【数字信号处理DSP】（十三）Z 变换与收敛域|（十三）Z 变换与收敛域]]（含完整推导与例题）、[[【数字信号处理DSP】（十二）系统互联|（十二）系统互联]]（级联/并联/反馈如何改变极点）。

---

## 一、定义

![四类序列的收敛域 ROC 形状](/images/dsp/dsp-note-roc.svg)

> 上图：因果（右边）序列 ROC 在最外极点之外；反因果（左边）在最内极点之内；双边序列 ROC 是两极点之间的圆环；有限长序列 ROC 为除 \(z=0\) 或 \(z=\infty\) 外的全平面。

**双边 Z 变换**：

$$
X(z)=\sum_{n=-\infty}^{\infty} x[n]\,z^{-n}
$$

**单边 Z 变换**（因果序列与带初始条件的差分方程常用）：

$$
X(z)=\sum_{n=0}^{\infty} x[n]\,z^{-n}
$$

其中 \(z\) 为复变量，**收敛域（ROC）** 为使级数绝对收敛的 \(z\) 的区域：

$$
\sum_{n=-\infty}^{\infty} \lvert x[n] \rvert\,\lvert z \rvert^{-n} \lt \infty
$$

式子里只出现 \(\lvert z \rvert\)，所以 **ROC 一定是以原点为中心的圆环**（可退化为圆外或圆内）。

---

## 二、常用 Z 变换表

| 序列 \(x[n]\) | Z 变换 \(X(z)\) | 收敛域（ROC） |
|---|---|---|
| \(\delta[n]\) | \(1\) | 全部 \(z\) |
| \(\delta[n-k]\)（\(k\gt0\)） | \(z^{-k}\) | \(\lvert z \rvert \gt 0\) |
| \(u[n]\) | \(\dfrac{z}{z-1}=\dfrac{1}{1-z^{-1}}\) | \(\lvert z \rvert \gt 1\) |
| \(-u[-n-1]\) | \(\dfrac{z}{z-1}\) | \(\lvert z \rvert \lt 1\) |
| \(a^n u[n]\) | \(\dfrac{z}{z-a}=\dfrac{1}{1-az^{-1}}\) | \(\lvert z \rvert \gt \lvert a \rvert\) |
| \(-a^n u[-n-1]\) | \(\dfrac{z}{z-a}\) | \(\lvert z \rvert \lt \lvert a \rvert\) |
| \(n u[n]\) | \(\dfrac{z}{(z-1)^2}\) | \(\lvert z \rvert \gt 1\) |
| \(n a^n u[n]\) | \(\dfrac{az}{(z-a)^2}=\dfrac{az^{-1}}{(1-az^{-1})^2}\) | \(\lvert z \rvert \gt \lvert a \rvert\) |
| \((n+1)a^n u[n]\) | \(\dfrac{z^2}{(z-a)^2}=\dfrac{1}{(1-az^{-1})^2}\) | \(\lvert z \rvert \gt \lvert a \rvert\) |
| \(n^2 u[n]\) | \(\dfrac{z(z+1)}{(z-1)^3}\) | \(\lvert z \rvert \gt 1\) |
| \(\sin(\omega_0 n) u[n]\) | \(\dfrac{z\sin\omega_0}{z^2-2z\cos\omega_0+1}\) | \(\lvert z \rvert \gt 1\) |
| \(\cos(\omega_0 n) u[n]\) | \(\dfrac{z(z-\cos\omega_0)}{z^2-2z\cos\omega_0+1}\) | \(\lvert z \rvert \gt 1\) |
| \(a^n\sin(\omega_0 n) u[n]\) | \(\dfrac{az\sin\omega_0}{z^2-2az\cos\omega_0+a^2}\) | \(\lvert z \rvert \gt \lvert a \rvert\) |
| \(a^n\cos(\omega_0 n) u[n]\) | \(\dfrac{z(z-a\cos\omega_0)}{z^2-2az\cos\omega_0+a^2}\) | \(\lvert z \rvert \gt \lvert a \rvert\) |
| \(\dfrac{a^n}{n!}u[n]\) | \(e^{a/z}\) | \(\lvert z \rvert \gt 0\) |

> 记法：**分母 \(z-a\) 就是极点 \(z=a\)**，ROC 一律写成「在极点外 / 在极点内」，一秒就能读出来。
> 二阶那一对（sin / cos）分母相同，因为极点都是 \(z=e^{\pm j\omega_0}\)；\(\omega_0=0\) 时 cos 行退化成 \(u[n]\)。

---

## 三、ROC、因果性与稳定性

| 判据 | ROC 语言 | 极点语言 |
|---|---|---|
| 因果 | ROC 取最外极点之外，延伸到 \(\infty\) | — |
| 反因果 | ROC 取最内极点之内，延伸到 \(0\) | — |
| 稳定（BIBO） | ROC **包含单位圆** | — |
| 因果且稳定 | 最外极点外且含单位圆 | **全部极点在单位圆内** |

- 有理 \(X(z)\) 的 ROC 边界必然穿过极点 ⇒ **先求极点，再选区间**。
- 只写 \(X(z)\) 不写 ROC，等于没答完：\(\dfrac{1}{1-az^{-1}}\) 配 \(\lvert z \rvert \gt \lvert a \rvert\) 是 \(a^nu[n]\)，配 \(\lvert z \rvert \lt \lvert a \rvert\) 是 \(-a^nu[-n-1]\)。

---

## 四、Z 变换的基本性质

设 \(x[n] \leftrightarrow X(z)\)、\(y[n] \leftrightarrow Y(z)\)，ROC 分别为 \(R_x\)、\(R_y\)。

### 1. 线性

$$
a x[n] + b y[n] \;\longleftrightarrow\; a X(z) + b Y(z)
$$

ROC：至少为 \(R_x \cap R_y\)。

### 2. 时移（移位）

- **右移（延迟，双边）**：

$$
x[n-k] \;\longleftrightarrow\; z^{-k} X(z)
$$

ROC：与 \(X(z)\) 相同，可能在 \(z=0\) 或 \(z=\infty\) 处有变化。

- **右移（单边，要补初值）**：

$$
x[n-1] \;\longleftrightarrow\; z^{-1}X(z) + x[-1]
$$

- **左移（超前，单边）**：

$$
x[n+k] \;\longleftrightarrow\; z^{k}\Bigl[X(z) - \sum_{m=0}^{k-1} x[m] z^{-m}\Bigr]
$$

### 3. z 域尺度变换

$$
a^n x[n] \;\longleftrightarrow\; X\!\left(\frac{z}{a}\right)
$$

ROC：\(\lvert a \rvert R_x\)（即以 \(\lvert a \rvert\) 缩放）。

### 4. 时间反转

$$
x[-n] \;\longleftrightarrow\; X\!\left(z^{-1}\right)
$$

ROC：倒置（\(z_0 \in R_x \Rightarrow 1/z_0 \in R_{\text{new}}\)），闭区间端点交换。

### 5. 共轭

$$
x^*[n] \;\longleftrightarrow\; X^*(z^*)
$$

若 \(x[n]\) 实，则 \(X(z) = X^*(z^*)\)：零点、极点成共轭对出现。

### 6. 时域卷积

$$
x[n] * y[n] \;\longleftrightarrow\; X(z)\cdot Y(z)
$$

ROC：至少为 \(R_x \cap R_y\)（极零相消时可能扩大）。

### 7. z 域微分

$$
n\,x[n] \;\longleftrightarrow\; -z\frac{d}{dz}X(z)
$$

ROC：与 \(X(z)\) 相同（可能去掉 \(z=0\)）。

### 8. 差分（一阶后向）

$$
x[n] - x[n-1] \;\longleftrightarrow\; (1 - z^{-1}) X(z)
$$

### 9. 累加（求和）

$$
\sum_{k=-\infty}^{n} x[k] \;\longleftrightarrow\; \frac{z}{z-1}X(z) = \frac{1}{1-z^{-1}}X(z)
$$

ROC：\(R_x \cap \{\lvert z \rvert \gt 1\}\)。

### 10. 初值定理

若 \(x[n]\) 因果，且 \(\lim_{z\to\infty}X(z)\) 存在：

$$
x[0] = \lim_{z\to\infty} X(z)
$$

### 11. 终值定理

若 \(x[n]\) 因果，且 \((1-z^{-1})X(z)\) 的极点全在单位圆内：

$$
\lim_{n\to\infty} x[n] = \lim_{z\to 1}\,(1-z^{-1})X(z)
$$

### 12. 帕塞瓦尔定理

$$
\sum_{n=-\infty}^{\infty} x[n]\,y^*[n] = \frac{1}{2\pi j}\oint_C X(z)\,Y^*\!\left(\frac{1}{z^*}\right) z^{-1}\,dz
$$

\(C\) 为 ROC 内逆时针闭曲线。取 \(y=x\) 得能量关系。

---

## 五、逆 Z 变换：部分分式速查

**总原则**：一律按 \(z^{-1}\) 展开（不要按 \(z\)），查表时才对得上；每一项的方向由 **ROC 在极点的哪一侧**决定。

| 极点位置 | 项的形式 | 逆变换（ROC 在外） | 逆变换（ROC 在内） |
|---|---|---|---|
| 单极点 \(p\) | \(\dfrac{A}{1-pz^{-1}}\) | \(A\,p^n u[n]\) | \(-A\,p^n u[-n-1]\) |
| 二重极点 \(p\) | \(\dfrac{C}{(1-pz^{-1})^2}\) | \(C\,(n+1)p^n u[n]\) | \(-C\,(n+1)p^n u[-n-1]\) |
| \(\lvert p \rvert \lt 1\) 且 ROC 含单位圆 | — | 稳定 + 因果 | 稳定 + 反因果 |

**三步流程**：

1. **假分式先长除**（分子阶次 ≥ 分母），分出多项式部分 → 对应 \(\delta[n]\) 及其移位；
2. **求系数用遮盖法**（留数法）：\(A_i = \left.(1-p_iz^{-1})X(z)\right|_{z^{-1}=1/p_i}\)；
3. **按 ROC 逐项查表**，决定用 \(u[n]\) 还是 \(u[-n-1]\)。

**快速自检**：\(\sum_i A_i = X(\infty)\)（令 \(z^{-1}\to 0\) 两边取极限）。

**小例**：\(X(z)=\dfrac{1}{(1-0.5z^{-1})(1-0.8z^{-1})}\)，\(\text{ROC}: \lvert z \rvert \gt 0.8\)

$$
A=\frac{1}{1-0.8\times2}=-\frac53,\quad
B=\frac{1}{1-0.5\times1.25}=\frac83
$$

$$
x[n]=\Bigl[-\frac53(0.5)^n+\frac83(0.8)^n\Bigr]u[n]
$$

核对：\(A+B=1=X(\infty)=x[0]\) ✓。

**另一条路（长除法）**：把 \(X(z)\) 按 \(z^{-1}\) 升幂长除，商的系数序列直接就是 \(x[0],x[1],x[2],\dots\)（反因果时按 \(z\) 升幂）。只能得数值、给不出闭式，但任何有理式都能用。

---

## 六、常见差分方程 ↔ 系统函数

| 差分方程 | \(H(z)\) | 极点 |
|---|---|---|
| \(y[n]=x[n]\) | \(1\) | 无 |
| \(y[n]=x[n-k]\) | \(z^{-k}\) | 无（\(z=0\) 处 \(k\) 重） |
| \(y[n]=x[n]+a\,y[n-1]\) | \(\dfrac{1}{1-az^{-1}}\) | \(z=a\) |
| \(y[n]=x[n]+b\,x[n-1]\) | \(1+bz^{-1}\) | 无（零点 \(z=-b\)） |
| \(y[n]=x[n]-0.5y[n-1]\)（负反馈） | \(\dfrac{1}{1+0.5z^{-1}}\) | \(z=-0.5\) |
| 级联两级一阶 | \(\dfrac{1}{(1-p_1z^{-1})(1-p_2z^{-1})}\) | \(p_1,\ p_2\) |

一般形式：

$$
\sum_{k=0}^{N} a_k\,y[n-k] = \sum_{r=0}^{M} b_r\,x[n-r]
\;\Longrightarrow\;
H(z)=\frac{\sum_{r=0}^{M} b_r z^{-r}}{\sum_{k=0}^{N} a_k z^{-k}}
$$

分子系数 \(b_r\) ↔ 前向支路（零点），分母系数 \(a_k\) ↔ 反馈支路（极点）。

---

## 七、与其他变换的关系

| 关系 | 表达式 | 说明 |
|---|---|---|
| Z 变换 ↔ DTFT | \(X(e^{j\omega}) = X(z)\big|_{z=e^{j\omega}}\) | DTFT 就是单位圆上的截面；ROC 含单位圆时 DTFT 才存在 |
| Z 变换 ↔ 拉普拉斯 | \(z = e^{sT}\) | 虚轴 ↔ 单位圆，左半平面 ↔ 圆内，宽 \(2\pi/T\) 横带 ↔ 整个 z 平面 |
| Z 变换 ↔ DFT | \(X[k]=X(z)\big|_{z=e^{j2\pi k/N}}\) | 单位圆上等间隔取 \(N\) 点 |

---

## 八、补充说明

- ROC 与序列类型密切相关：有限长序列的 ROC 为整个 z 平面（可能除去 \(0\) 或 \(\infty\)）；右边序列在某个圆外；左边序列在某个圆内；双边序列为环形区域。
- 逆 Z 变换三种方法：**部分分式展开法**（主力）、幂级数（长除）法、留数法。
- 做级联、并联的代数运算时，可以**先算表达式、最后统一确定 ROC**，因为 ROC 只满足「包含交集」而非等于交集。
