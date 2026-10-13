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

## 项目结构

```
├── _config.yml            # 站点主配置（标题、作者、URL、主题等）
├── _config.fluid.yml      # 主题配置（导航、样式、功能开关）
├── source/
│   ├── _posts/            # 文章（Markdown）
│   ├── about/             # 关于页
│   ├── categories/        # 分类页
│   └── tags/              # 标签页
├── themes/fluid/          # 主题文件（已随仓库提交）
└── .github/workflows/     # 自动部署配置
```

## 常用配置位置

| 想改什么 | 改哪里 |
| --- | --- |
| 博客名称、副标题、作者、URL | `_config.yml` |
| 导航菜单、首页标语、社交图标 | `_config.fluid.yml` |
| 主题配色、暗色模式 | `_config.fluid.yml` 的 `color` / `dark_mode` 段 |
| 代码块样式、行号、复制按钮 | `_config.fluid.yml` 的 `code` 段 |

## 首次部署前置设置

在 GitHub 仓库的 **Settings → Pages** 中，把 **Source** 设为 `Deploy from a branch`，分支选择 **gh-pages**、目录选 **/(root)**，保存即可。

之后每次 push 到 `main` 分支，Actions 会重新构建并把结果推送到 `gh-pages` 分支。
