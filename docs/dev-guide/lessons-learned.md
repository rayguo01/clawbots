# Nanobots 开发经验教训

## 1. openclaw 媒体发送机制

### 问题

自定义 skill 脚本输出 `MEDIA: /absolute/path/image.png`，但图片没有通过 WhatsApp 发送，只作为纯文本显示。

### 根因

openclaw 的 `src/media/parse.ts` 中 `isValidMedia()` **故意阻断绝对路径**（安全机制，防止 agent 泄露系统文件）：

```typescript
// 只允许 ./ 开头的相对路径
return candidate.startsWith("./") && !candidate.includes("..");
```

### 为什么 `./` 相对路径也不行

- exec 工具 cwd: agent session 的 workspace 目录（如 `/home/node/.openclaw/workspace/`）
- Node.js process.cwd(): Docker WORKDIR `/app`
- `loadWebMedia()` 用 `fs.readFile()` 解析相对路径 → 基于 `/app`
- cwd 不匹配导致相对路径找不到文件

### 正确做法

openclaw 系统提示词（`src/auto-reply/reply/get-reply-run.ts:254`）明确说：

> "To send an image back, **prefer the message tool** (media/path/filePath)"

所以 skill 应该指导 agent：

1. 用 exec 工具生成图片，从 stdout 获取文件路径
2. 用 **message 工具**（`filePath` 参数）发送图片
3. message 工具直接传路径给通道层，不经过 parse.ts 安全过滤

### 关键文件

- 媒体解析: `src/media/parse.ts` (isValidMedia, splitMediaFromOutput)
- 媒体加载: `src/web/media.ts` (loadWebMedia)
- 系统提示: `src/auto-reply/reply/get-reply-run.ts:254` (mediaReplyHint)
- message 工具: `src/agents/tools/message-tool.ts` (支持 filePath/media/path 参数)
- exec 工具 cwd: `src/agents/bash-tools.exec.ts:952`

---

## 2. Skills Snapshot 版本 & API Key 注入链

### 问题

配置了 skill API key 后，agent 仍然无法使用该 skill。

### 根因链（3 个问题叠加）

**问题 A: Snapshot 未刷新**

- Skills snapshot 按 session 缓存在 `sessions.json`
- 配置变更（添加 apiKey）不触发 snapshot 刷新——文件 watcher 只监控 skill 文件，不监控配置文件
- 修复: 在 `handleSkillsSave` 中调用 `bumpSkillsSnapshotVersion({ reason: "manual" })`

**问题 B: globalVersion 初始值**

- `src/agents/skills/refresh.ts` 中 `globalVersion` 初始为 0
- 刷新检查: `snapshotVersion > 0 && cached.version < snapshotVersion` → 永远 false
- 修复: 改为 `let globalVersion = 1`

**问题 C: env.vars 残留值覆盖 skill apiKey**

- `config.env.vars.GEMINI_API_KEY = "旧测试值"` 在 `loadConfig()` → `applyConfigEnv()` 时注入 `process.env`
- `applySkillEnvOverridesFromSnapshot` 检查 `!process.env[primaryEnv]` → false（已有旧值）
- skill 的真正 apiKey 永远不被注入
- 修复: 删除 config 中的 `env.vars.GEMINI_API_KEY`

**问题 D: SIGUSR1 不清 process.env**

- SIGUSR1 是进程内重启，`process.env` 保留旧值
- 即使配置已修改，旧环境变量仍在
- 修复: 必须 `docker compose restart` 完全重启容器

### 关键文件

- Snapshot 版本: `src/agents/skills/refresh.ts` (globalVersion, bumpSkillsSnapshotVersion)
- Snapshot 刷新检查: `src/auto-reply/reply/session-updates.ts`
- Skill 资格检查: `src/agents/skills/config.ts` (shouldIncludeSkill, hasBinary)
- Env 注入: `src/agents/skills/env-overrides.ts` (applySkillEnvOverridesFromSnapshot)
- Config env: `src/config/io.ts:164-170` (applyConfigEnv)

---

## 3. Gmail 批量删除

### 问题

批量删除邮件后，邮件仍在收件箱可见。

### 根因

`batchModify` API 只添加了 `TRASH` 标签，没有移除 `INBOX` 和 `UNREAD` 标签。

### 修复

```typescript
body: JSON.stringify({
  ids: messageIds,
  addLabelIds: ["TRASH"],
  removeLabelIds: ["INBOX", "UNREAD"],  // 必须加这行
}),
```

### 关键文件

- `extensions/google-services/src/gmail.ts` (google_gmail_batch_trash)

---

## 4. Docker 构建经验补充

### Plugin SDK 导出

任何 extensions 依赖的符号都必须在 `src/plugin-sdk/index.ts` 中导出。
例如添加 `bumpSkillsSnapshotVersion` 导出才能在 web-setup extension 中使用。

### 进程内重启 vs 完全重启

- SIGUSR1: 进程内重启，module cache 和 process.env 保留
- docker compose restart: 全新进程，所有状态清空
- 涉及环境变量变更时，必须完全重启

---

## 5. 通用经验

- **先查系统设计意图再改代码**: openclaw 阻断绝对路径是有意的安全设计，不是 bug
- **检查系统提示词**: agent 的行为由系统提示词引导，问题可能出在 skill 描述而非代码
- **环境变量注入优先级**: config.env.vars → process.env（loadConfig 时），skill.apiKey → process.env（仅当 key 不存在时）
- **调试 skill 问题看日志链**: Inbound → skills snapshot → env override → tool exec → MEDIA parse → outbound

---

## 6. Docker 容器管理：不要手动 docker run 覆盖 compose 容器

### 问题

手动 `docker run --name nanobots -v .nanobots:/home/node/.nanobots` 测试后，助手 skill snapshot 只有 2 个 skill，Telegram 消息也没到达。

### 根因链

**问题 A: bind mount vs named volume**

- 生产环境 `docker-compose.yml` 用 **named volume**（`nanobots-data:/home/node/.nanobots`）
- 手动 `docker run` 用 **bind mount**（`-v .nanobots:/home/node/.nanobots`）
- 两者数据完全隔离——手动容器读不到生产配置（Telegram token、API keys 等）

**问题 B: 容器名冲突**

- `docker run --name nanobots` 占用了容器名
- `docker compose up` 无法启动（名字冲突），或停掉了 compose 容器
- 导致 Telegram bot 断线，用户消息发到了一个没有正确配置的容器

**问题 C: session snapshot 缓存不刷新**

- 恢复 compose 容器后，旧 session 的 snapshot 仍缓存（version=1，只有 2 个 skill）
- `globalVersion` 在进程启动时重置为 1
- 刷新条件 `session.version(1) < globalVersion(1)` = false → 不刷新
- 即使调 `bumpSkillsSnapshotVersion`，是在旧容器中生效，新容器重启后又回到 1

### 解决方式

- 删除旧 session 文件（`sessions.json` + `*.jsonl`）
- 用户发新消息 → 创建全新 session → snapshot 重新构建 → 所有 skill 加载

### 教训

1. **永远用 `docker compose up -d --build` 重建/重启**，不要裸 `docker run`。compose 管理环境变量（API keys、tokens）、named volumes、depends_on、init 等，裸 run 会丢失这些配置导致各种诡异问题（无 gateway token、volume 数据不匹配、环境变量缺失）
2. 如果必须手动测试，用不同的容器名（如 `nanobots-test`）和不同端口
3. **skill 的 `requires.env` 检查的是 `process.env`**，不是 `config.env.vars`——API Key 必须通过 docker-compose 环境变量注入
4. session snapshot 不会因容器重启自动刷新（version 比较机制），需要删除旧 session 或确保 bump 在同一进程中生效

### 关键文件

- docker-compose.yml: named volumes 定义（`nanobots-data`, `nanobots-workspace`）
- `src/agents/skills/config.ts:165-178`: `shouldIncludeSkill` — `requires.env` 只查 `process.env` 和 `skillConfig.env`
- `src/agents/skills/refresh.ts:27`: `globalVersion = 1`（进程启动初始值）
- `src/auto-reply/reply/session-updates.ts:187-188`: snapshot 刷新条件

---

## 7. SKILL.md YAML Frontmatter 中 description 含冒号导致 Skill 静默跳过

### 问题

6 个 Skill 被 `loadSkillsFromDir` 静默跳过，不出现在 `<available_skills>` 列表中。

### 根因

description 值包含 `Keywords: xxx`（冒号+空格）模式，YAML 解析器误认为嵌套映射，导致 frontmatter 解析失败，description 为空，skill 被跳过。

### 修复

用双引号包裹 description 值：`description: "文本含Keywords: 冒号"`

### 诊断

```javascript
const {
  loadSkillsFromDir,
} = require("./node_modules/@mariozechner/pi-coding-agent/dist/core/skills.js");
const r = loadSkillsFromDir({ dir: "/path/to/skills", source: "test" });
console.log(r.diagnostics); // 看 "Nested mappings" 错误
```

### Frontmatter 允许字段

name, description, license, compatibility, metadata, homepage, allowed-tools, disable-model-invocation

---

## 8. Cron 定时提醒不触发（heartbeatsEnabled + recomputeNextRuns）

### 问题

用户通过 cron tool 设定 `kind: "at"` 的一次性提醒，cron job 正确触发了但用户没收到消息。

### 根因链（3 个独立 bug）

**Bug A: `recomputeNextRuns` 导致 `kind: "every"` job 永远不 due**

- `onTimer` → `ensureLoaded(forceReload: true)` → `recomputeNextRuns()` 将 `nextRunAtMs` 重置为 `now + everyMs`
- 接着 `runDueJobs` 检查 `now >= nextRunAtMs` → 永远 false
- 修复: `ensureLoaded` 添加 `skipRecompute` 选项，`onTimer` 中传 `skipRecompute: true`
- 文件: `src/cron/service/store.ts`, `src/cron/service/timer.ts`

**Bug B: 客户端禁用 heartbeat 导致 cron 提醒被跳过**

- `sessionTarget: "main"` 的 cron job 执行后调 `requestHeartbeatNow` 触发 agent 处理
- 但 Telegram/WhatsApp 客户端连接时调 `set-heartbeats: false` 暂停 periodic heartbeat
- `heartbeat-runner.ts` 的 `run()` handler 检查全局 `heartbeatsEnabled` flag → false → 返回 `skipped: disabled`
- System event 留在内存队列，直到用户下次主动发消息才被 drain（而非立即发送）
- 修复: cron 触发的 heartbeat（reason 非 "interval"/"requested"）用 `isExplicitWake` 绕过 `heartbeatsEnabled` 检查
- 文件: `src/infra/heartbeat-runner.ts` (run 函数 + runHeartbeatOnce 函数)

**Bug C: HEARTBEAT.md 空文件检查阻断 cron heartbeat**

- 即使 Bug B 修复后，`runHeartbeatOnce` 仍返回 `skipped: empty-heartbeat-file`
- 原因: workspace 中 HEARTBEAT.md 存在但内容为空（只有注释/标题），`isHeartbeatContentEffectivelyEmpty()` 返回 true
- 原设计意图: 节省 periodic heartbeat 的 LLM 调用成本
- 但 cron 触发的 heartbeat 不依赖 HEARTBEAT.md 内容——它们有 system events 在队列中等待处理
- 修复: 在 empty-heartbeat-file 检查中也加 `!isExplicitWake` 条件
- 文件: `src/infra/heartbeat-runner.ts` (runHeartbeatOnce 函数, HEARTBEAT.md 检查处)

### 调试技巧

- 在 `src/infra/heartbeat-wake.ts` 的 `schedule()` 和 `requestHeartbeatNow()` 加 `console.log` 可追踪完整调用链
- Docker 中 console.log 输出在 `/tmp/openclaw/openclaw-*.log`（JSON 格式，method: "console.log"）
- `cron/runs/*.jsonl` 记录每次 job 执行结果（status/summary/durationMs）
- `durationMs: 7` 说明走了 `requestHeartbeatNow` 快速路径而非同步 heartbeat

### 关键文件

- Heartbeat wake: `src/infra/heartbeat-wake.ts` (requestHeartbeatNow, schedule)
- Heartbeat runner: `src/infra/heartbeat-runner.ts` (run handler, runHeartbeatOnce, heartbeatsEnabled)
- Cron timer: `src/cron/service/timer.ts` (onTimer, executeJob)
- Cron store: `src/cron/service/store.ts` (ensureLoaded, skipRecompute)
- System events: `src/infra/system-events.ts` (enqueueSystemEvent, drainSystemEventEntries)
- Session updates: `src/auto-reply/reply/session-updates.ts` (prependSystemEvents — 实际消费 system events)

---

## 9. 宿主机 Gateway 模块死锁

### 问题

WSL2 上 `node dist/entry.js gateway` 进程启动但不绑定端口，无输出。

### 根因

dist ESM 模块循环依赖导致 import 死锁（sessions→sandbox→pi-embedded-helpers 链）。Node 22/24 都复现。可能与开发环境 `pnpm build`(tsdown) 产物有关。

### 建议

- 用 Docker 测试集成功能，宿主机仅用于纯 JS 单元测试
- `process.title = "openclaw"` 导致 `ps aux | grep node` 搜不到进程，需 `grep openclaw`

---

## 10. Config 写入触发 Gateway 全量重启（meta.lastTouchedAt 无 reload rule）

### 问题

WebUI 中 toggle skill 开关后，gateway 全量重启，导致：

1. 后续 API 请求撞上重启中的 server → 失败
2. 快速连续 toggle 多次 → 双重启叠加 → "shutdown timed out; exiting without full cleanup" → 容器崩溃
3. OAuth 弹窗在异步回调中被 popup blocker 拦截（因 API 响应延迟）

### 根因

`src/gateway/config-reload.ts` 中 `buildGatewayReloadPlan` 对每个 changed path 匹配 reload rule。`updateConfig` 每次写入 config 都会更新 `meta.lastTouchedAt` 时间戳。但 `meta` 前缀**没有对应的 reload rule**，未匹配的 path 默认触发 `restartGateway = true`。

即使 `skills` 前缀的规则是 `{ prefix: "skills", kind: "none" }`（不重启），`meta.lastTouchedAt` 的无规则匹配仍然会触发全量重启。

```
changed paths: meta.lastTouchedAt, skills.entries.notion.enabled
  ↓
  skills.entries.notion.enabled → 匹配 "skills" → none ✓
  meta.lastTouchedAt → 无匹配规则 → restartGateway = true ✗
```

### 修复

在 `BASE_RELOAD_RULES_TAIL` 数组头部添加 `{ prefix: "meta", kind: "none" }`。

### 验证

修复后 toggle skill 不再触发 gateway restart，`docker logs` 中无 `[reload]` 事件。

### 教训

- 查看 reload 日志 `config change requires gateway restart (reason)` 中的 reason 字段可直接定位触发重启的 path
- `config-reload.ts` 的 `matchRule` 采用前缀匹配，未匹配的 path 默认触发 full restart — 新增 config 字段时务必加对应 rule
- 时间戳类元数据字段（meta.lastTouchedAt）不应触发 gateway 重启

### 关键文件

- Reload 规则: `src/gateway/config-reload.ts` (BASE_RELOAD_RULES_TAIL, matchRule, buildGatewayReloadPlan)
- Config 写入: `updateConfig()` — 每次写入自动更新 `meta.lastTouchedAt`
- Reload 执行: `src/gateway/server-reload-handlers.ts`

---

## 11. WebUI OAuth 弹窗被浏览器拦截

### 问题

OAuth skill 启用时，`window.open()` 被浏览器 popup blocker 拦截。

### 根因

`handleOAuthEnable` 中 `window.open()` 在 `fetch().then()` 异步回调中调用，已脱离用户手势（click）上下文。浏览器只允许在用户手势的同步上下文或短时间窗口内打开弹窗。如果 API 响应延迟（如 gateway 重启中），时间窗口过期，弹窗被拦截。

### 修复

先在用户手势上下文中同步打开空白窗口 `window.open("about:blank", "oauth", ...)`，API 返回后再用 `popup.location.href = res.url` 重定向。失败时 `popup.close()` 关闭空白窗口。

### 同一模式需一致修复的地方

- `handleOAuthEnable` — skill 启用 OAuth
- `connectKnowledge` — 知识库连接 OAuth

---

## 12. 小卡片 Toggle 点击冒泡导致卡片展开

### 问题

点击 skill 小卡片上的 toggle 开关时，卡片同时展开。

### 根因

toggle 的 `change` 事件有 `stopPropagation`，但 `click` 事件仍然冒泡到卡片的 `click` handler，导致 `state.expandedSkill = skillId` + `render()`。

### 修复

在卡片 click handler 中添加检查：`if (e.target.closest(".toggle")) return;`

---

## 13. Docker 镜像和构建缓存清理

### 问题

频繁 `docker compose up --build` 后，磁盘被旧镜像占满（73 个悬空镜像 + 229GB 构建缓存）。

### 根因

Docker 不会自动清理。每次 `--build` 重建时，旧镜像失去 tag 变成悬空镜像（`<none>:<none>`），构建缓存也持续累积。

### 修复

在 `package.json` 中添加 `ship` 脚本，自动构建 + 清理：

```json
"ship": "docker compose up -d --build && docker image prune -f"
```

注意: 不能用 `deploy` 作为脚本名，会和 pnpm 内置的 `pnpm deploy` 命令冲突。必须用 `pnpm run deploy` 才能调用自定义脚本，所以改名为 `ship`。

### 使用方式

- 日常部署: `pnpm ship` — 重建镜像 + 启动容器 + 清理悬空镜像
- 构建缓存累积过多时: `docker builder prune -f` — 偶尔手动执行即可
- 检查磁盘占用: `docker system df`

---

## 14. Telegram 断开连接后重连新 bot 收不到消息

### 问题

在 WebUI 断开旧 Telegram bot 后，连接新 bot，发消息无任何响应。

### 根因

Telegram polling 启动时从 `{stateDir}/telegram/update-offset-default.json` 读取上次的 `lastUpdateId`，用 `offset=lastUpdateId+1` 拉消息。断开旧 bot 时只清了配置（botToken、allowFrom），但 **没有删除 offset 文件**。新 bot 的 update ID 序列与旧 bot 不同，旧 offset（如 670929447）远大于新 bot 的实际 update ID，导致所有消息被跳过（Telegram API 只返回 `update_id >= offset` 的消息）。

### 表现

- `[telegram] starting provider (@new_bot)` 正常
- 无 409 冲突、无错误、无 inbound 日志
- 手动不带 offset 调 getUpdates 能拿到消息，带旧 offset 拿不到

### 修复

`handleTelegramDisconnect` 中，清配置后同时删除 offset 文件：

```typescript
const offsetFile = path.join(resolveStateDir(), "telegram", "update-offset-default.json");
try {
  fs.unlinkSync(offsetFile);
} catch {
  /* file may not exist */
}
```

### 教训

- **断开通道连接时，必须清理所有相关状态文件**，不仅仅是配置字段
- Telegram update offset 是 per-bot 的，换 bot 必须重置
- 排查"消息收不到"问题时，先检查 offset 文件是否残留

### 关键文件

- Offset 存储: `src/telegram/update-offset-store.ts` (read/write 函数)
- Offset 路径: `{stateDir}/telegram/update-offset-{accountId}.json`
- Disconnect 处理: `extensions/web-setup/src/telegram-setup.ts` (handleTelegramDisconnect)

---

## 15. Workspace bootstrap 文件跨容器重建丢失（SOUL.md/IDENTITY.md 等）

### 问题

Bot 的人格设定（SOUL.md）、身份（IDENTITY.md）等 bootstrap 文件，每次 Docker 容器重建后丢失。用户感受为"AI 记忆被清空"。

### 根因

`resolveDefaultAgentWorkspaceDir()` 在 `src/agents/workspace.ts` 中**硬编码** `path.join(homedir(), ".openclaw", "workspace")`，没有使用 `resolveStateDir()`。

而 Docker 环境中：

- `NANOBOTS_STATE_DIR=/home/node/.nanobots` → `resolveStateDir()` 返回 `/home/node/.nanobots`
- docker-compose volume 挂载在 `/home/node/.nanobots/workspace`（持久化）
- 但代码实际写到 `/home/node/.openclaw/workspace`（容器临时层，重建即丢）

同样的硬编码还存在于 `resolveAgentWorkspaceDir()` 在 `src/agents/agent-scope.ts` 的多 agent fallback 路径。

### 修复

两处代码改为使用 `resolveStateDir()`：

**`src/agents/workspace.ts`**:

```typescript
import { resolveStateDir } from "../config/paths.js";
// 替换 path.join(homedir(), ".openclaw", "workspace")
const stateDir = resolveStateDir(env, homedir);
return path.join(stateDir, "workspace");
```

**`src/agents/agent-scope.ts`**:

```typescript
// 替换 path.join(os.homedir(), ".openclaw", `workspace-${id}`)
return path.join(resolveStateDir(), `workspace-${id}`);
```

### Bootstrap 文件说明

openclaw 在 workspace 目录下维护以下 bootstrap 文件，每次新 session 作为 context 嵌入系统提示：

- `SOUL.md` — Bot 人格、性格、语气（最重要）
- `IDENTITY.md` — Bot 名字、身份、Emoji、头像
- `USER.md` — 用户信息和偏好
- `TOOLS.md` — 工具使用指引
- `AGENTS.md` — 子 agent 定义
- `HEARTBEAT.md` — 定时心跳行为
- `MEMORY.md` — 记忆内容
  模板来自 `docs/reference/templates/`，首次访问时由 `ensureAgentWorkspace()` 自动创建。

### 教训

- nanobots fork 中所有用到 `.openclaw` 硬编码路径的地方都可能有类似问题
- Docker 中路径问题排查：先确认 volume mount 路径和代码实际读写路径是否一致
- `docker exec ls` 直接检查容器内文件是最快的排查方式

### 关键文件

- Workspace 初始化: `src/agents/workspace.ts` (resolveDefaultAgentWorkspaceDir, ensureAgentWorkspace)
- Agent scope: `src/agents/agent-scope.ts` (resolveAgentWorkspaceDir)
- State dir 解析: `src/config/paths.ts` (resolveStateDir)
- Bootstrap 模板: `docs/reference/templates/` (SOUL.md, IDENTITY.md 等)

---

## 16. 用户配置数据必须存储在持久化 volume 路径下（X Cookie 丢失案例）

### 问题

用户在 WebUI 配置了 X Cookie（auth_token + ct0），`pnpm ship` 重建容器后，X Cookie 变成"未配置"状态。

### 根因

`x-cookies-setup.ts` 中 cookie 文件存储路径为 `~/.local/share/baoyu-skills/x-to-markdown/cookies.json`（沿用旧的 baoyu skill 路径）。

Docker 容器中：

- `/home/node/.nanobots` → named volume（`nanobots-data`），**持久化**
- `/home/node/.local/share/` → 容器临时层，**重建即丢**

`resolveStateDir()` 返回 `/home/node/.nanobots`，但 cookie 文件写到了 `/home/node/.local/share/`，不在 volume 中。

### 修复

将存储路径改为 `resolveStateDir()/x-cookies/cookies.json`，保留旧路径作为 fallback 读取：

**`extensions/web-setup/src/x-cookies-setup.ts`**:

```typescript
const COOKIE_FILE_DIR = path.join(resolveStateDir(), "x-cookies");
const COOKIE_FILE_PATH = path.join(COOKIE_FILE_DIR, "cookies.json");
// Legacy fallback (read-only)
const LEGACY_COOKIE_PATH = path.join(
  os.homedir(),
  ".local",
  "share",
  "baoyu-skills",
  "x-to-markdown",
  "cookies.json",
);
```

**`extensions/x-cookie/src/cookies.ts`**:

```typescript
function resolveCookiePaths(): string[] {
  return [
    path.join(resolveStateDir(), "x-cookies", "cookies.json"), // primary: persistent volume
    path.join(resolveUserDataRoot(), "baoyu-skills", "x-to-markdown", "cookies.json"), // fallback: legacy
  ];
}
```

### 通用原则

**所有用户通过 WebUI 配置的数据，都必须存储在 `resolveStateDir()` 路径下。** 这包括：

- OAuth token（已正确：`resolveStateDir()/oauth/`）
- X Cookie（已修复：`resolveStateDir()/x-cookies/`）
- 任何新增的用户配置数据

在 Docker 环境中，只有 `resolveStateDir()` 指向的目录（`/home/node/.nanobots`）被挂载为 named volume，其他路径在容器重建后会丢失。

### 排查步骤

1. `docker exec nanobots ls -la /home/node/.nanobots/` — 检查持久化目录内容
2. 确认代码中写入路径是否使用 `resolveStateDir()` 而非硬编码
3. 对比 `docker-compose.yml` 中 volume mount 与代码实际读写路径

### 关键文件

- State dir 解析: `src/config/paths.ts` (resolveStateDir)
- X Cookie WebUI 存储: `extensions/web-setup/src/x-cookies-setup.ts`
- X Cookie Extension 读取: `extensions/x-cookie/src/cookies.ts`
- Docker volume 定义: `docker-compose.yml` (nanobots-data → /home/node/.nanobots)
