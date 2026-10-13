---
title: 别再用 for 循环了：JavaScript 数组方法实战
date: 2026-10-13 17:00:00
categories:
  - 前端
tags:
  - JavaScript
  - 编码技巧
---

数组遍历是日常写得最多的代码。用 `for` 循环当然没错，但多数场景下有更贴合语义的写法 —— 代码短，意图也更清楚。

## map：一对一转换

需要「把每个元素变成另一个东西」时用 `map`。

```javascript
// 不推荐
const names = [];
for (let i = 0; i < users.length; i++) {
  names.push(users[i].name);
}

// 推荐
const names = users.map((user) => user.name);
```

## filter：按条件筛选

```javascript
const active = users.filter((user) => user.isActive);
const adults = users.filter((user) => user.age >= 18);
```

## reduce：聚合为一个值

`reduce` 是最容易被低估的一个，它几乎能表达所有「把数组折叠成单值」的逻辑。

```javascript
// 求和
const total = orders.reduce((sum, order) => sum + order.price, 0);

// 按字段分组
const grouped = orders.reduce((acc, order) => {
  const key = order.status;
  (acc[key] ??= []).push(order);
  return acc;
}, {});
```

`??=` 是逻辑空赋值运算符，上面这行等价于「如果 `acc[key]` 是 null 或 undefined，就先初始化成空数组」。

## find / some / every：判断型

这三个比 `filter(...).length > 0` 更直观，而且找到之后会短路，不会白跑完整个数组。

```javascript
const admin = users.find((u) => u.role === 'admin');      // 返回第一个匹配项或 undefined
const hasAdmin = users.some((u) => u.role === 'admin');    // 是否存在
const allActive = users.every((u) => u.isActive);          // 是否全部满足
```

## 链式组合

这些方法都返回新数组，所以可以串起来写：

```javascript
const result = orders
  .filter((order) => order.status === 'paid')
  .map((order) => order.amount)
  .reduce((sum, amount) => sum + amount, 0);
```

读起来就是一句话：「取已支付订单的金额总和」。

## 什么时候该用 for 循环

不是所有场景都适合链式调用。下面两种情况老老实实用 `for`：

```javascript
// 1. 需要在遍历中提前退出，且逻辑复杂
for (const item of list) {
  if (await check(item)) {
    result = item;
    break;
  }
}

// 2. 追求极致性能的热点路径
// 链式调用会产生多个中间数组，数据量大时内存开销明显
```

## 小结

| 需求 | 方法 |
| --- | --- |
| 转换每个元素 | `map` |
| 按条件筛选 | `filter` |
| 折叠成单值 | `reduce` |
| 找第一个匹配项 | `find` |
| 判断是否存在 | `some` |
| 判断是否全部满足 | `every` |

判断标准很简单：**如果一段循环的意图能用一句话说清楚，通常就有一个数组方法对应它。**
