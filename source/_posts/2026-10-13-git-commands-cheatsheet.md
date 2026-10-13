---
title: Git 常用命令速查，以及三个救命操作
date: 2026-10-13 16:55:00
categories:
  - 工具
tags:
  - Git
  - 效率
---

日常开发中真正高频的 Git 命令其实不超过二十个。这份速查表按场景整理，最后附上三个「出事时能救命」的操作。

## 日常流程

```bash
git status              # 看当前状态，最常用没有之一
git add -p              # 交互式暂存，逐个 hunk 确认
git commit -m "feat: xxx"
git push origin main
```

`git add -p` 值得单独说：它会把你本次的修改拆成若干块，逐块询问是否暂存。写提交时的好处是，可以把无关改动（比如调试代码）留在工作区，只提交真正相关的部分。

## 分支操作

```bash
git switch -c feature/login    # 新建并切换分支
git switch main                # 切回主分支
git branch -d feature/login    # 删除已合并的分支
git branch -vv                 # 查看本地分支及其追踪关系
```

> `git switch` 和 `git restore` 是 Git 2.23 引入的，用来替代语义混乱的 `git checkout`。新项目建议直接用新命令。

## 查看历史

```bash
git log --oneline --graph --all    # 图形化看分支结构
git log -p -- path/to/file         # 看某个文件的完整变更历史
git blame path/to/file             # 逐行看是谁改的
git diff HEAD~3 HEAD --stat        # 对比最近三次提交的文件改动
```

## 三个救命操作

### 1. 改错了上一次提交的信息

```bash
git commit --amend -m "正确的提交信息"
```

如果已经 push 过了，需要 `git push --force-with-lease`。注意用 `--force-with-lease` 而不是 `--force`，前者会在远程有你不知道的新提交时拒绝执行。

### 2. 想撤销一次已 push 的提交

不要用 `reset`，用 `revert` —— 它会生成一个反向提交，历史是向前走的：

```bash
git revert <commit-hash>
git push
```

### 3. 误删了分支

```bash
git reflog                  # 找到被删分支的最后一个 commit
git switch -c recovered <hash>
```

`reflog` 记录了 HEAD 的每一次移动，默认保留 90 天。只要不是 `git gc` 清理过，基本都能捞回来。

## 一些配置建议

```bash
# 换行符，避免 Windows 上出现满屏的 ^M
git config --global core.autocrlf input

# 让 diff 对中文更友好
git config --global core.quotepath false

# 记住密码（Linux/macOS）
git config --global credential.helper store
```

---

命令不用背，用的时候查一下就好。真正值得记住的是**出事之后该怎么办** —— 这部分建议在没出事的时候先看一遍。
