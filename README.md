# LyZeroMoon 的技术笔记

基于 [Hexo](https://hexo.io) + [Fluid](https://github.com/fluid-dev/hexo-theme-fluid) 主题的个人博客，通过 GitHub Actions 自动部署到 GitHub Pages。

## 日常写作

新建一篇文章：

```bash
npx hexo new post "my-new-post"
```

文件会生成在 `source/_posts/` 下。**建议文件名用英文**，这样生成的 URL 更干净；中文标题写在文件的 front-matter 里即可：

```yaml
---
title: 中文标题写在这里
date: 2026-10-13 17:00:00
categories:
  - 教程
tags:
  - 标签一
  - 标签二
---
```

## 本地预览

```bash
npx hexo server
```

然后访问 http://localhost:4000 。改动会实时生效，不需要重启。

## 发布

```bash
git add .
git commit -m "post: 新增文章"
git push
```

推送后 GitHub Actions 会自动构建并发布，约 1 分钟后生效。

## 在线写作后台

浏览器打开 **https://lyzeromoon.github.io/admin/** 即可写作，不用碰命令行。

### 账号与登录

首次打开会让你初始化管理员账号：填账号名、设一个密码、粘贴一次 GitHub Token。
Token 会用密码派生的密钥（PBKDF2-SHA256 600k 迭代 + AES-256-GCM）加密后存进
`source/admin/auth.json`，**明文不会上传**。之后换设备或清了浏览器缓存，只要输密码就能登进后台，
不用再重新生成 Token。

- 初始化时会生成一张**恢复码**，务必抄下来 —— 忘记密码时这是唯一的找回方式
- 「账号设置」里可以改密码、换 Token、重新生成恢复码
- 密码忘了、恢复码也丢了，可以走「改用 Token 直接登录」的应急通道
- 注意：加密后的 auth.json 会随站点公开（仓库是公开的），所以密码要设强一点，别用常见词或生日

### 能做什么

| 功能 | 说明 |
| --- | --- |
| 文章管理 | 新建 / 编辑 / 删除，侧栏搜索，按日期倒序 |
| 实时预览 | 编辑器与预览双栏，可拖动分栏，也可切「仅编辑 / 仅预览」 |
| Markdown 工具栏 | 加粗、标题、代码块、引用、列表、待办、链接、表格、分隔线、数学公式、流程图 |
| 图片上传 | 直接**粘贴**或**拖入**图片，自动传到 `source/images/` 并插入 Markdown |
| 图片管理 | 顶部「图片」标签，网格预览全部图片，可搜索、复制链接、单张或批量删除，并统计占用空间 |
| 站点概览 | 顶部「概览」标签，文章数 / 总字数 / 分类 / 图片占用，专栏分布条形图与最近更新列表 |
| 关于页 | 顶部「关于页」标签，所见即所得地改 `source/about/index.md` |
| 专栏管理 | 顶部「专栏」标签，可视化编辑 `source/_data/columns.yml`（名称 / 简介 / 图标 / 颜色） |
| front-matter 保真 | 后台只接管标题 / 日期 / 分类 / 标签，其余字段（`comment`、`permalink` 等）原样保留 |
| 草稿保护 | 编辑内容自动暂存在本地，误关页面后重开会提示恢复 |
| 深色模式 | 右上角切换，默认跟随系统 |
| 快捷键 | `Ctrl+S` 发布、`Ctrl+B` 加粗、`Ctrl+I` 斜体、`Ctrl+K` 插链接、`Esc` 关弹窗 |

后台本身是纯静态页面，发布动作直接调用 GitHub Contents API 提交 commit，触发 Actions 自动部署。

## 写数学公式

用 LaTeX 语法，`$...$` 行内、`$$...$$` 独立成块：

```markdown
质能方程 $E = mc^2$ 说的是……

$$
\frac{\partial f}{\partial x_i} = \sum_{j=1}^{n} A_{ij} v_j
$$

$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
=
\begin{pmatrix} ax + by \\ cx + dy \end{pmatrix}
$$
```

渲染由 KaTeX 在**构建时**完成，页面不加载额外脚本，公式随文字一起出现，也不会有渲染闪烁。
后台工具栏的 `∑+` 按钮可以直接插入公式骨架。

> Markdown 渲染器已从默认的 `marked` 换成 `markdown-it` + KaTeX 插件。
> 原因是 `marked` 会把公式里的 `\\`、`_` 当成 Markdown 语法，矩阵、多行推导这类复杂公式会被写坏。
> 换渲染器后既有文章的渲染结果完全一致（只有 `/` 是否转义成 `&#x2F;` 这种无视觉差异的区别）。

## 写流程图

直接用 `mermaid` 代码块，**不需要**在 front-matter 里加任何字段：

````markdown
```mermaid
graph LR
  A[开始] --> B{有公式吗}
  B -->|有| C[用 LaTeX 写]
  B -->|没有| D[直接写]
```
````

`scripts/auto-mermaid.js` 会在构建时扫描文章，发现有 `mermaid` 代码块才给这一页加上 mermaid.js（约 800KB），
没有图表的文章不会加载它。所以随便写，不会拖慢其他页面。

后台工具栏的流程图按钮可以直接插入骨架。

## 评论

文章评论用 **giscus**，数据存在仓库的 GitHub Discussions 里，不需要数据库和服务器，读者用 GitHub 账号登录即可发言。

- 仓库 Discussions 已开启，分类指向 **General**
- 想只让维护者能新建讨论，可以在仓库 Settings → Discussions 里建一个 **Announcements** 类型的分类，
  再把 `_config.fluid.yml` 里 `giscus.category` / `category-id` 换成它
- 评论跟随站点深浅色自动切换主题
- 单篇文章想关评论，在 front-matter 写 `comment: false`

## 订阅与收录

- `/atom.xml` — RSS/Atom 订阅源，页面 `<head>` 里已带自动发现标签，阅读器能直接识别
- `/sitemap.xml` — 站点地图，可提交到 Google Search Console 或百度搜索资源平台加速收录
- 页脚有 RSS 入口

## 项目结构

```
├── _config.yml            # 站点主配置（标题、作者、URL、RSS、站点地图、Markdown 渲染器）
├── _config.fluid.yml      # 主题配置（导航、样式、公式、图表、评论等开关）
├── scripts/
│   └── auto-mermaid.js    # 构建时自动检测 Mermaid 代码块并启用渲染脚本
├── source/
│   ├── _posts/            # 文章（Markdown）
│   ├── _data/columns.yml  # 专栏页配置（后台「专栏」标签可视化编辑）
│   ├── about/             # 关于页（后台「关于页」标签可在线编辑）
│   ├── admin/             # 在线写作后台（单文件 SPA，含加密账号系统）
│   ├── columns/           # 专栏页
│   ├── images/            # 后台插入的图片（后台「图片」标签可管理）
│   ├── categories/        # 分类页
│   └── tags/              # 标签页
├── themes/fluid/          # 主题文件（已随仓库提交）
└── .github/workflows/     # 自动部署配置
```

## 常用配置位置

| 想改什么 | 改哪里 |
| --- | --- |
| 博客名称、副标题、作者、URL | `_config.yml` |
| RSS / 站点地图 | `_config.yml` 的 `feed` / `sitemap` 段 |
| 公式与图表的渲染开关 | `_config.fluid.yml` 的 `post.math` / `post.mermaid` 段 |
| 评论（giscus）仓库与分类 | `_config.fluid.yml` 的 `giscus` 段 |
| 导航菜单、首页标语、社交图标 | `_config.fluid.yml` |
| 主题配色、暗色模式 | `_config.fluid.yml` 的 `color` / `dark_mode` 段 |
| 代码块样式、行号、复制按钮 | `_config.fluid.yml` 的 `code` 段 |

## 首次部署前置设置

在 GitHub 仓库的 **Settings → Pages** 中，把 **Source** 设为 `Deploy from a branch`，分支选择 **gh-pages**、目录选 **/(root)**，保存即可。

之后每次 push 到 `main` 分支，Actions 会重新构建并把结果推送到 `gh-pages` 分支。
