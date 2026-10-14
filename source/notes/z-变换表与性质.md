---
title: Z 变换表与性质
layout: note
permalink: /notes/z-变换表与性质/
updated: 2026-10-14 20:16:13
categories:
  - 数字信号处理DSP
---

# Z 变换表与性质

## 一、定义

**双边 Z 变换**：
\[
X(z)=\sum_{n=-\infty}^{\infty} x[n]\,z^{-n}
\]

**单边 Z 变换**（因果序列常用）：
\[
X(z)=\sum_{n=0}^{\infty} x[n]\,z^{-n}
\]

其中 \(z\) 为复变量，收敛域（ROC）为使级数收敛的 \(z\) 的区域。

---

## 二、常用 Z 变换表

| 序列 \(x[n]\) | Z 变换 \(X(z)\) | 收敛域（ROC） |
|---|---|---|
| \(\delta[n]\) | \(1\) | 全部 \(z\) |
| \(\delta[n-k]\) | \(z^{-k}\) | \(z \neq 0\)（或全部，取决于单/双边） |
| \(u[n]\) | \(\dfrac{z}{z-1}\) | \|z\| > 1 |
| \(-u[-n-1]\) | \(\dfrac{z}{z-1}\) | \|z\| < 1 |
| \(a^n u[n]\) | \(\dfrac{z}{z-a}\) | \|z\| > \|a\| |
| \(-a^n u[-n-1]\) | \(\dfrac{z}{z-a}\) | \|z\| < \|a\| |
| \(n u[n]\) | \(\dfrac{z}{(z-1)^2}\) | \|z\| > 1 |
| \(n a^n u[n]\) | \(\dfrac{a z}{(z-a)^2}\) | \|z\| > \|a\| |
| \(n^2 u[n]\) | \(\dfrac{z(z+1)}{(z-1)^3}\) | \|z\| > 1 |
| \(\sin(\omega_0 n) u[n]\) | \(\dfrac{z \sin\omega_0}{z^2 - 2z\cos\omega_0 + 1}\) | \|z\| > 1 |
| \(\cos(\omega_0 n) u[n]\) | \(\dfrac{z(z - \cos\omega_0)}{z^2 - 2z\cos\omega_0 + 1}\) | \|z\| > 1 |
| \(a^n \sin(\omega_0 n) u[n]\) | \(\dfrac{a z \sin\omega_0}{z^2 - 2a z \cos\omega_0 + a^2}\) | \|z\| > \|a\| |
| \(a^n \cos(\omega_0 n) u[n]\) | \(\dfrac{z(z - a\cos\omega_0)}{z^2 - 2a z \cos\omega_0 + a^2}\) | \|z\| > \|a\| |
| \(r^n \cos(\omega_0 n) u[n]\) | \(\dfrac{z(z - r\cos\omega_0)}{z^2 - 2r z \cos\omega_0 + r^2}\) | \|z\| > r |
| \((n+1) a^n u[n]\) | \(\dfrac{z^2}{(z-a)^2}\) | \|z\| > \|a\| |
| \(\dfrac{1}{n!}(a^n) u[n]\) | \(e^{a/z}\) | \|z\| > 0 |

---

## 三、Z 变换的基本性质

以下设 \(x[n] \leftrightarrow X(z)\)，\(y[n] \leftrightarrow Y(z)\)，ROC 分别为 \(R_x\)、\(R_y\)。

### 1. 线性
\[
a x[n] + b y[n] \;\longleftrightarrow\; a X(z) + b Y(z)
\]
ROC：至少为 \(R_x \cap R_y\)。

### 2. 时移（移位）性质

- **右移（延迟）**：
\[
x[n-k] \;\longleftrightarrow\; z^{-k} X(z)
\]
ROC：与 \(X(z)\) 相同，可能在 \(z=0\) 或 \(z=\infty\) 处有变化。

- **左移（超前）**：
\[
x[n+k] \;\longleftrightarrow\; z^{k} \left[ X(z) - \sum_{m=0}^{k-1} x[m] z^{-m} \right]
\]
（单边 Z 变换形式）

### 3. z 域尺度变换
\[
a^n x[n] \;\longleftrightarrow\; X\left(\frac{z}{a}\right)
\]
ROC：\(\left|a\right| \cdot R_x\)。

### 4. 时间反转
\[
x[-n] \;\longleftrightarrow\; X\left(z^{-1}\right)
\]
ROC：\(R_x\) 的倒置（若 \(z_0 \in R_x\)，则 \(1/z_0 \in R_{\text{new}}\)）。

### 5. 共轭
\[
x^*[n] \;\longleftrightarrow\; X^*(z^*)
\]
若 \(x[n]\) 为实序列，则 \(X(z) = X^*(z^*)\)。

### 6. 时域卷积
\[
x[n] * y[n] \;\longleftrightarrow\; X(z) \cdot Y(z)
\]
ROC：至少为 \(R_x \cap R_y\)（若存在零点极点相消，ROC 可能扩大）。

### 7. z 域微分
\[
n x[n] \;\longleftrightarrow\; -z \frac{d}{dz} X(z)
\]
ROC：与 \(X(z)\) 相同（可能去除 \(z=0\)）。

### 8. 差分（一阶后向差分）
\[
x[n] - x[n-1] \;\longleftrightarrow\; (1 - z^{-1}) X(z)
\]

### 9. 累加（求和）性质
\[
\sum_{k=-\infty}^{n} x[k] \;\longleftrightarrow\; \frac{z}{z-1} X(z)
\]
ROC：\(R_x \cap \{|z|>1\}\)。

### 10. 初值定理
若 \(x[n]\) 为因果序列（\(x[n]=0, n<0\)），且 \(\lim_{z\to\infty} X(z)\) 存在，则：
\[
x[0] = \lim_{z\to\infty} X(z)
\]

### 11. 终值定理
若 \(x[n]\) 因果，且 \((z-1)X(z)\) 的极点全部位于单位圆内，则：
\[
\lim_{n\to\infty} x[n] = \lim_{z\to 1} (z-1)X(z)
\]

### 12. Parseval 定理
\[
\sum_{n=-\infty}^{\infty} x[n] y^*[n] = \frac{1}{2\pi j} \oint_{C} X(z) Y^*(1/z^*) \, z^{-1} dz
\]
其中 \(C\) 为收敛域内逆时针闭曲线。

---

## 四、补充说明

- ROC 与序列类型密切相关：有限长序列的 ROC 为整个 z 平面（可能除去 0 或 ∞）；右边序列的 ROC 在某个圆外；左边序列的 ROC 在某个圆内；双边序列的 ROC 为环形区域。
- 逆 Z 变换常用方法：部分分式展开法、幂级数展开法、留数法等。