# Nanobots Phase 1: Fork + 裁剪 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 openclaw 复制为独立项目 nanobots，删除不需要的模块，保留核心能力，确保能编译通过。

**Architecture:** 基于 openclaw 源码，通过删除目录和文件的方式裁剪，保留 Agent Core + WhatsApp + Telegram + 工具系统 + 记忆 + Skill + Plugin 架构。裁剪后修复编译错误。

**Tech Stack:** TypeScript, Node.js 22+, pnpm, Pi 框架

---

### Task 1: 复制 openclaw 到 nanobots 目录

**Files:**

- Create: `/mnt/d/02.mycode/toy/nanobots/` (新项目目录)

**Step 1: 复制项目（排除 .git 和 node_modules）**

```bash
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.turbo' \
  /mnt/d/02.mycode/toy/research/openclaw/ \
  /mnt/d/02.mycode/toy/nanobots/
```

**Step 2: 初始化 git 仓库**

```bash
cd /mnt/d/02.mycode/toy/nanobots
git init
```

**Step 3: 创建初始提交**

```bash
git add -A
git commit -m "Initial fork from openclaw"
```

---

### Task 2: 删除原生客户端和 Control UI

**删除目录:**

- `apps/` (macOS, iOS, Android, shared)
- `ui/` (Control UI)

**Step 1: 删除目录**

```bash
rm -rf apps/ ui/
```

**Step 2: 从 pnpm-workspace.yaml 中移除引用**

移除 `ui` 和 `apps/*` 相关条目。

**Step 3: 提交**

```bash
git add -A
git commit -m "Remove native clients (apps/) and Control UI (ui/)"
```

---

### Task 3: 删除不需要的 extensions

**保留:** whatsapp, telegram, memory-core
**删除其余 28 个 extension**

**Step 1: 删除 extension 目录**

```bash
cd extensions/
# 保留这三个，删除其余
ls | grep -v -E '^(whatsapp|telegram|memory-core)$' | xargs rm -rf
```

**Step 2: 提交**

```bash
git add -A
git commit -m "Remove unnecessary extensions, keep whatsapp + telegram + memory-core"
```

---

### Task 4: 删除不需要的 src 通道模块

**删除 src/ 下的通道特定代码（只保留 whatsapp 和 telegram 的核心引用）:**

- `src/discord/`
- `src/slack/`
- `src/signal/`
- `src/imessage/`
- `src/feishu/`
- `src/line/`
- `src/macos/`

**Step 1: 删除目录**

```bash
rm -rf src/discord/ src/slack/ src/signal/ src/imessage/ src/feishu/ src/line/ src/macos/
```

**Step 2: 提交**

```bash
git add -A
git commit -m "Remove unused channel modules from src/"
```

---

### Task 5: 删除不需要的系统模块

**删除:**

- `src/canvas-host/` (Canvas/A2UI)
- `src/pairing/` (DM 配对)
- `src/node-host/` (远程节点)
- `src/polls.ts`, `src/polls.test.ts` (投票)
- `src/acp/` (如果是 access control panel)
- `src/terminal/` (TUI 终端)
- `src/tui/` (TUI 界面)
- `packages/` (clawdbot, moltbot 兼容包)

**Step 1: 删除目录和文件**

```bash
rm -rf src/canvas-host/ src/pairing/ src/node-host/ src/terminal/ src/tui/ src/acp/
rm -f src/polls.ts src/polls.test.ts
rm -rf packages/
```

**Step 2: 从 pnpm-workspace.yaml 中移除 packages/\* 引用**

**Step 3: 提交**

```bash
git add -A
git commit -m "Remove canvas, pairing, node-host, terminal, TUI, polls, compat packages"
```

---

### Task 6: 清理部署和 CI 配置

**删除:**

- `fly.toml`, `fly.private.toml` (Fly.io)
- `render.yaml` (Render)
- `.github/` (GitHub Actions CI)
- `Dockerfile.sandbox-browser` (暂时不需要浏览器沙箱镜像)
- `.swiftformat`, `.swiftlint.yml` (Swift 相关)
- `README-header.png` (大图片)
- `CHANGELOG.md` (openclaw 的变更日志)
- `CONTRIBUTING.md` (openclaw 的贡献指南)

**Step 1: 删除文件**

```bash
rm -f fly.toml fly.private.toml render.yaml
rm -rf .github/
rm -f Dockerfile.sandbox-browser
rm -f .swiftformat .swiftlint.yml
rm -f README-header.png CHANGELOG.md CONTRIBUTING.md
```

**Step 2: 提交**

```bash
git add -A
git commit -m "Remove Fly.io, Render, GitHub Actions, Swift configs, and openclaw docs"
```

---

### Task 7: 重命名项目

**Step 1: 更新 package.json**

将 `name` 从 `openclaw` 改为 `nanobots`。

**Step 2: 更新 README.md**

替换为简短的 nanobots 项目说明。

**Step 3: 更新 CLAUDE.md**

更新为 nanobots 的项目上下文。

**Step 4: 提交**

```bash
git add -A
git commit -m "Rename project to nanobots"
```

---

### Task 8: 修复编译错误（第一轮）

删除大量模块后，必然会有 import 引用断裂。

**Step 1: 尝试编译**

```bash
pnpm install
pnpm tsc --noEmit 2>&1 | head -100
```

**Step 2: 根据错误逐个修复**

- 删除引用被删模块的 import 语句
- 删除引用被删通道的注册代码
- 简化引用被删模块的配置 schema

**Step 3: 反复编译直到无错误**

**Step 4: 提交**

```bash
git add -A
git commit -m "Fix compilation errors after module pruning"
```

---

### Task 9: 验证核心功能可启动

**Step 1: 尝试启动**

```bash
pnpm start 2>&1 | head -50
```

或者按 openclaw 的方式：

```bash
node --import tsx src/entry.ts 2>&1 | head -50
```

**Step 2: 记录需要进一步修复的问题**

**Step 3: 提交修复**

```bash
git add -A
git commit -m "Fix runtime issues, core agent functional"
```

---

## 执行注意事项

- Task 8 和 Task 9 是工作量最大的部分，可能需要多轮迭代
- 每次删除后先编译检查，避免积累太多错误
- 优先保证 Agent Core 能正常调用 LLM，再处理通道连接
- 遇到深度耦合的模块，先注释掉引用而不是大范围重写
