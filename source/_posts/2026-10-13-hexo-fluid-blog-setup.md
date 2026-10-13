---
title: 用 Hexo + Fluid 搭建一个 GitHub Pages 博客
date: 2026-10-13 16:50:00
categories:
  - 教程
tags:
  - Hexo
  - GitHub Pages
  - 博客搭建
---

GitHub Pages 提供免费的静态托管，Hexo 负责把 Markdown 编译成静态站点，Fluid 提供一套开箱即用的主题。三者组合成本极低，可控性又足够强，是很适合程序员的一套方案。

这篇文章记录完整搭建过程，以及几个容易踩的坑。

## 为什么选这套组合

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| Hexo + GitHub Pages | 免费、完全可控、生态成熟 | 需要熟悉命令行 |
| 在线文档工具 | 零门槛、即写即存 | 样式受限，不便深度自定义 |
| 自建服务器 | 自由度最高 | 有费用，且要自己维护 |

对技术博客来说，**能贴代码块、能生成目录、能按标签归档** 是最核心的三个需求，Hexo 都能满足。

## 三步走

### 1. 本地初始化

```bash
npx hexo-cli init blog
cd blog
npm install
```

### 2. 安装主题

```bash
git clone https://github.com/fluid-dev/hexo-theme-fluid.git themes/fluid
```

然后在站点的 `_config.yml` 中指定主题：

```yaml
theme: fluid
```

### 3. 本地预览

```bash
npx hexo server
```

浏览器打开 `http://localhost:4000` 即可查看效果。

## 容易踩的坑

> 图片路径是新手最常卡住的地方。建议先把图片放到图床，或者统一放在 `source/img/` 下用绝对路径引用。

几个具体问题：

1. **代理端口失效** —— `git` 里配置的代理端口如果和实际运行中的软件端口不一致，`git clone` 会直接失败，且错误信息只说「连接超时」，很有迷惑性。
2. **永久链接过长** —— 默认的 `:year/:month/:day/:title/` 会让 URL 显得很啰嗦，想简洁可以改成 `posts/:title/`。
3. **时区错位** —— 不设置 `timezone` 时，文章日期可能和本地时间差 8 小时。
4. **部署目录** —— `.deploy_git` 是部署时自动生成的，不要提交进仓库。

## 配置自动部署

写一个 GitHub Actions workflow，push 之后自动构建并发布：

```yaml
name: Deploy Hexo

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx hexo generate
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

配置完成后，每次 `git push` 博客都会自动更新，本地不需要再手动执行任何部署命令。

## 小结

整套方案的核心思路是把「写作」和「发布」解耦：你只需要专注写 Markdown，编译、部署、托管全部交给工具链处理。
