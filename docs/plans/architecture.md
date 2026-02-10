# OpenClaw 系统架构文档

> 基于源码分析编写，反映项目当前代码结构。

---

## 1. 项目概览

**OpenClaw** 是一个本地优先（local-first）的多通道 AI 助手平台，提供统一的 Gateway 控制面，将多个消息通道（WhatsApp、Telegram、Slack、Discord 等 15+ 平台）连接到 AI Agent 运行时。

| 属性     | 值                          |
| -------- | --------------------------- |
| 语言     | TypeScript (Node.js 22.12+) |
| 包管理   | pnpm 10.x (monorepo)        |
| 构建     | esbuild / tsx               |
| 测试框架 | Vitest                      |
| 许可证   | Apache-2.0                  |
| 源码规模 | ~229MB, 1000+ 测试文件      |

**核心能力**:

- 多通道收发（15+ 消息平台）
- 多 Agent 路由与隔离
- 向量知识库（内存系统）
- 工具调用（Browser、Canvas、Cron、Sessions 等）
- 原生客户端（macOS / iOS / Android）
- 定时任务与 Webhook 自动化
- 沙箱隔离执行

---

## 2. Monorepo 工作区结构

`pnpm-workspace.yaml` 定义了四个工作区:

```yaml
packages:
  - . # 主包 (openclaw 核心)
  - ui # Control UI (Lit + Vite)
  - packages/* # 子包 (clawdbot, moltbot)
  - extensions/* # 扩展插件 (31 个)
```

### 顶层目录布局

```
openclaw/
├── src/                  # 核心源码 (45+ 模块)
│   ├── cli/              # CLI 入口与命令注册
│   ├── gateway/          # Gateway WS 控制面
│   ├── routing/          # 消息路由引擎
│   ├── auto-reply/       # 自动回复调度
│   ├── agents/           # Agent 运行时 + 工具 + 沙箱
│   ├── channels/         # 通道抽象层
│   ├── memory/           # 向量知识库
│   ├── config/           # 配置系统 (Zod schema)
│   ├── cron/             # 定时任务服务
│   ├── plugins/          # 插件注册 SDK
│   ├── commands/         # CLI 命令实现
│   ├── browser/          # 浏览器控制
│   ├── canvas-host/      # Canvas/A2UI 宿主
│   ├── security/         # 安全审计
│   ├── infra/            # 基础设施 (dotenv, TLS, etc.)
│   ├── hooks/            # 生命周期钩子
│   ├── logging/          # 日志子系统
│   ├── tts/              # 文字转语音
│   ├── media/            # 媒体处理管道
│   ├── pairing/          # DM 配对机制
│   ├── providers/        # LLM Provider 适配
│   ├── sessions/         # 会话存储
│   ├── discord/          # Discord 核心集成
│   ├── slack/            # Slack 核心集成
│   ├── telegram/         # Telegram 核心集成
│   ├── whatsapp/         # WhatsApp 核心集成
│   ├── signal/           # Signal 核心集成
│   ├── imessage/         # iMessage 核心集成
│   ├── feishu/           # 飞书集成
│   ├── line/             # LINE 集成
│   └── ...               # 更多模块
├── extensions/           # 31 个扩展插件
├── skills/               # 53 个 Skill
├── apps/                 # 原生客户端
│   ├── ios/              # iOS 应用 (Swift)
│   ├── macos/            # macOS 菜单栏应用 (Swift)
│   └── android/          # Android 应用 (Kotlin)
├── packages/             # 子包
│   ├── clawdbot/         # ClawdBot 包
│   └── moltbot/          # MoltBot 包
├── ui/                   # Control UI (Lit Web Components)
├── docs/                 # 文档站点 (Mintlify)
├── scripts/              # 构建/测试脚本
├── Dockerfile            # 主 Docker 镜像
├── Dockerfile.sandbox    # 沙箱 Docker 镜像
├── fly.toml              # Fly.io 部署配置
├── render.yaml           # Render 部署配置
├── docker-compose.yml    # Docker Compose 编排
└── package.json          # 根包配置
```

---

## 3. 系统架构总览

### 3.1 分层架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      客户端层 (Clients)                         │
│  macOS App │ iOS Node │ Android Node │ CLI │ WebChat │ Control UI│
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket / HTTP
┌──────────────────────────▼──────────────────────────────────────┐
│                    Gateway 控制面                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ WS Server│ │HTTP Hooks│ │ Control  │ │  OpenAI/Responses│   │
│  │ Protocol │ │ Webhooks │ │    UI    │ │   兼容 HTTP API  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       └─────────────┴────────────┴────────────────┘             │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │              消息路由引擎 (Routing)                      │    │
│  │  Bindings → Channel/Account/Peer 匹配 → Agent 分配     │    │
│  └──────────────────────┬──────────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Agent 运行时层                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Pi Embedded Runner (RPC 模式, 工具流式, 块流式)        │    │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐   │    │
│  │  │Model选择 │  │System Prompt│  │   会话管理/压缩   │   │    │
│  │  │ 故障转移 │  │  + Skills  │  │  (SessionManager) │   │    │
│  │  └──────────┘  └────────────┘  └───────────────────┘   │    │
│  └─────────────────────┬───────────────────────────────────┘    │
│                        │                                        │
│  ┌─────────────────────▼───────────────────────────────────┐    │
│  │                  工具系统 (Tools)                        │    │
│  │  browser │ canvas │ cron │ memory │ sessions │ web-fetch│    │
│  │  message │ image  │ tts  │ nodes  │ gateway  │ 平台动作 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  沙箱隔离 (Sandbox)                      │    │
│  │  Docker 容器 │ 工具策略 │ 工作区隔离 │ 浏览器桥接       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    通道层 (Channels)                             │
│  核心通道 (src/):                                                │
│    WhatsApp │ Telegram │ Slack │ Discord │ Signal │ iMessage    │
│    Google Chat │ 飞书 │ LINE                                    │
│  扩展通道 (extensions/):                                         │
│    BlueBubbles │ Matrix │ MS Teams │ Mattermost │ Nostr │ Twitch│
│    Zalo │ Zalo Personal │ Nextcloud Talk │ Tlon                 │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    持久化层                                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ 会话存储 │  │向量知识库  │  │ Cron 作业存储│  │ 配置文件 │  │
│  │ (JSON)   │  │(SQLite+Vec)│  │  (SQLite)    │  │ (YAML)   │  │
│  └──────────┘  └────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心数据流

**入站消息处理**:

```
消息平台 → Channel Monitor → Gateway 事件 → 路由匹配 (resolveAgentRoute)
  → Auto-Reply 调度 (dispatchInboundMessage)
    → 命令检测 → 如果是命令: 执行命令
    → 否则: Pi Agent 运行 (runEmbeddedPiAgent)
      → 模型调用 (Anthropic/OpenAI/Gemini/...)
      → 工具调用循环
      → 回复分块 (chunkMarkdownText)
  → 回复发送 → Channel Send → 消息平台
```

---

## 4. 核心模块详解

### 4.1 CLI 与入口

**入口文件链**:

```
src/entry.ts
  └→ src/index.ts (shebang 入口, hashbang guard)
      └→ src/cli/run-main.ts → runCli()
          ├→ loadDotEnv(), normalizeEnv(), ensureOpenClawCliOnPath()
          ├→ assertSupportedRuntime()
          ├→ tryRouteCli() (快速路由: daemon 等)
          ├→ buildProgram() (Commander.js)
          │   └→ src/cli/program/build-program.ts
          │       ├→ createProgramContext() (版本, 通道选项)
          │       ├→ configureProgramHelp()
          │       ├→ registerPreActionHooks()
          │       └→ registerProgramCommands() (命令注册表)
          │           ├→ register.agent.ts      (openclaw agent)
          │           ├→ register.message.ts    (openclaw send)
          │           ├→ register.onboard.ts    (openclaw onboard)
          │           ├→ register.setup.ts      (openclaw setup)
          │           ├→ register.configure.ts  (openclaw config)
          │           ├→ register.maintenance.ts(openclaw doctor)
          │           └→ register.subclis.ts    (子命令懒加载)
          └→ registerPluginCliCommands() (插件 CLI 注册)
```

**关键文件**:

- `src/entry.ts` — 顶层入口
- `src/cli/run-main.ts` — CLI 启动流程
- `src/cli/program/build-program.ts` — Commander 程序构建
- `src/cli/program/command-registry.ts` — 命令注册中心

### 4.2 Gateway 控制面

**位置**: `src/gateway/`

Gateway 是 OpenClaw 的核心控制面，通过 WebSocket 协议连接所有客户端（CLI、macOS App、iOS/Android Node、浏览器等）。

**核心组件**:

| 文件                            | 职责                                  |
| ------------------------------- | ------------------------------------- |
| `server-http.ts`                | HTTP/HTTPS 服务器，Hooks/Webhook 端点 |
| `server-methods/`               | Gateway RPC 方法注册                  |
| `client.ts`                     | `GatewayClient` 类 — WS 客户端实现    |
| `protocol/`                     | Gateway 协议定义 (PROTOCOL_VERSION)   |
| `boot.ts`                       | Gateway 启动引导                      |
| `call.ts`                       | RPC 调用封装                          |
| `auth.ts`                       | Token/Password 认证                   |
| `device-auth.ts`                | 设备身份认证 (Ed25519)                |
| `config-reload.ts`              | 配置热重载                            |
| `exec-approval-manager.ts`      | 命令执行审批管理                      |
| `control-ui.ts`                 | Control UI 服务                       |
| `hooks.ts` / `hooks-mapping.ts` | Webhook 钩子处理                      |
| `openai-http.ts`                | OpenAI 兼容 HTTP API                  |
| `openresponses-http.ts`         | Open Responses HTTP API               |
| `tools-invoke-http.ts`          | 工具调用 HTTP API                     |

**GatewayClient 连接选项**:

```typescript
type GatewayClientOptions = {
  url?: string; // ws://127.0.0.1:18789
  token?: string;
  password?: string;
  clientName?: GatewayClientName;
  mode?: GatewayClientMode;
  caps?: string[];
  onEvent?: (evt: EventFrame) => void;
  // ...
};
```

**默认端口**: `18789` (WS) / `18790` (HTTP)

### 4.3 消息路由

**位置**: `src/routing/`

路由系统根据 `bindings` 配置将入站消息分配到正确的 Agent。

**路由匹配优先级** (从高到低):

1. `binding.peer` — 精确匹配对话对象 (DM/群组/频道 ID)
2. `binding.peer.parent` — 线程父消息匹配
3. `binding.guild` — Guild/服务器级匹配
4. `binding.team` — Team 级匹配
5. `binding.account` — 账户级匹配
6. `binding.channel` — 通道级匹配 (通配符 `*`)
7. `default` — 默认 Agent

**核心类型**:

```typescript
type ResolvedAgentRoute = {
  agentId: string;
  channel: string;
  accountId: string;
  sessionKey: string;      // 会话持久化键
  mainSessionKey: string;  // DM 合并键
  matchedBy: "binding.peer" | "binding.channel" | "default" | ...;
};
```

**关键文件**:

- `src/routing/resolve-route.ts` — 路由解析核心
- `src/routing/bindings.ts` — Binding 配置管理
- `src/routing/session-key.ts` — 会话键生成

### 4.4 自动回复调度

**位置**: `src/auto-reply/`

负责入站消息的完整处理流程：命令检测、Agent 调度、回复分块与发送。

**关键模块**:

| 文件                   | 职责                                        |
| ---------------------- | ------------------------------------------- |
| `dispatch.ts`          | 入站消息调度入口 (`dispatchInboundMessage`) |
| `reply.ts`             | 回复生成 (`getReplyFromConfig`)             |
| `command-detection.ts` | 文本命令识别 (以 `/` 开头)                  |
| `commands-registry.ts` | 命令注册表                                  |
| `chunk.ts`             | 回复文本分块                                |
| `group-activation.ts`  | 群组激活检测 (mention gating)               |
| `inbound-debounce.ts`  | 入站消息防抖                                |
| `thinking.ts`          | Thinking level 控制                         |
| `send-policy.ts`       | 发送策略                                    |
| `envelope.ts`          | 消息信封格式化                              |
| `templating.ts`        | 消息上下文模板                              |
| `heartbeat.ts`         | 心跳检测                                    |
| `skill-commands.ts`    | Skill 命令集成                              |

### 4.5 Agent 运行时

**位置**: `src/agents/`

#### Pi Embedded Runner (`src/agents/pi-embedded-runner/`)

Agent 运行时核心，以 RPC 模式运行，支持工具流式和块流式输出。

**关键文件**:

| 文件                       | 职责                            |
| -------------------------- | ------------------------------- |
| `run.ts`                   | Agent 单轮运行入口              |
| `run/attempt.ts`           | 单次 API 调用尝试               |
| `run/payloads.ts`          | API 请求构造                    |
| `run/images.ts`            | 图片处理                        |
| `model.ts`                 | 模型选择与参数                  |
| `system-prompt.ts`         | 系统提示词构建                  |
| `history.ts`               | 对话历史管理                    |
| `compact.ts`               | 上下文压缩                      |
| `session-manager-init.ts`  | 会话文件初始化                  |
| `session-manager-cache.ts` | 会话缓存                        |
| `extensions.ts`            | 运行时扩展 (context-pruning 等) |
| `lanes.ts`                 | 并发通道管理                    |
| `types.ts`                 | Agent 运行时类型                |
| `google.ts`                | Google Gemini 适配              |
| `sandbox-info.ts`          | 沙箱状态信息                    |

**运行流程**:

```
runEmbeddedPiAgent()
  → 初始化 SessionManager (pi-coding-agent)
  → 构建 system prompt (含 skills snapshot)
  → 执行 run loop:
      → buildPayload() (构造 API 请求)
      → callModel() (Anthropic/OpenAI/Gemini)
      → 处理 tool_use → 执行工具 → 收集结果
      → 如果有更多 tool calls → 继续循环
      → 否则 → 返回 assistant 文本
```

**支持的模型提供商**:

- Anthropic Claude (默认)
- OpenAI (GPT-4o 等)
- Google Gemini
- 其他 OpenAI 兼容 API

#### 工具系统 (`src/agents/tools/`)

Agent 可调用的工具集，共 60+ 个工具文件:

| 工具          | 文件                  | 说明                    |
| ------------- | --------------------- | ----------------------- |
| 浏览器控制    | `browser-tool.ts`     | Chrome/Chromium 操控    |
| Canvas        | `canvas-tool.ts`      | A2UI 画布推送           |
| 定时任务      | `cron-tool.ts`        | 创建/管理 Cron          |
| 内存检索      | `memory-tool.ts`      | 向量知识库搜索          |
| 消息发送      | `message-tool.ts`     | 跨通道消息发送          |
| 图片生成      | `image-tool.ts`       | 图片处理/生成           |
| Web 抓取      | `web-fetch.ts`        | URL 内容抓取            |
| Web 搜索      | `web-search.ts`       | 网页搜索                |
| 会话管理      | `sessions-*.ts`       | 会话列表/历史/发送/派生 |
| Gateway 调用  | `gateway-tool.ts`     | Gateway RPC 调用        |
| 节点控制      | `nodes-tool.ts`       | 远程节点操作            |
| TTS           | `tts-tool.ts`         | 文字转语音              |
| Discord 动作  | `discord-actions*.ts` | Discord 消息/管理/状态  |
| Slack 动作    | `slack-actions.ts`    | Slack 消息操作          |
| Telegram 动作 | `telegram-actions.ts` | Telegram 消息操作       |
| WhatsApp 动作 | `whatsapp-actions.ts` | WhatsApp 消息操作       |

#### 沙箱隔离 (`src/agents/sandbox/`)

基于 Docker 的隔离执行环境：

| 文件                 | 职责            |
| -------------------- | --------------- |
| `docker.ts`          | Docker 容器管理 |
| `config.ts`          | 沙箱配置        |
| `context.ts`         | 执行上下文      |
| `manage.ts`          | 生命周期管理    |
| `tool-policy.ts`     | 工具权限策略    |
| `workspace.ts`       | 工作区隔离      |
| `browser-bridges.ts` | 浏览器桥接      |
| `prune.ts`           | 容器清理        |
| `registry.ts`        | 沙箱注册表      |

**沙箱 Docker 镜像**: `Dockerfile.sandbox` (基础) + `Dockerfile.sandbox-browser` (含浏览器)

### 4.6 通道抽象层

**位置**: `src/channels/`

#### 通道注册表 (`src/channels/registry.ts`)

定义核心通道列表和元数据:

```typescript
const CHAT_CHANNEL_ORDER = [
  "telegram",
  "whatsapp",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
] as const;

const DEFAULT_CHAT_CHANNEL = "whatsapp";
```

#### 通道插件接口 (`src/channels/plugins/types.ts`)

每个通道实现 `ChannelPlugin` 接口:

```typescript
interface ChannelPlugin<T> {
  id: string;
  meta: ChannelMeta;
  capabilities: {
    chatTypes: ("direct" | "group")[];
    media: boolean;
    reactions: boolean;
    edit: boolean;
    // ...
  };
  groups: { ... };       // 群组策略
  threading: { ... };    // 线程上下文
  reload: { ... };       // 配置重载
  configSchema: { ... }; // 配置 Schema
  onboarding: { ... };   // 向导流程
  config: { ... };       // 账户管理
}
```

#### 核心通道 vs 扩展通道

**核心通道** (在 `src/` 中):

- WhatsApp (Baileys), Telegram (grammY), Slack (Bolt), Discord (discord.js)
- Google Chat, Signal (signal-cli), iMessage (legacy), 飞书, LINE

**扩展通道** (在 `extensions/` 中):

- BlueBubbles (推荐的 iMessage 替代)
- Matrix, MS Teams, Mattermost, Zalo, Nostr, Twitch, Nextcloud Talk, Tlon

### 4.7 内存与知识库

**位置**: `src/memory/`

基于 SQLite + sqlite-vec 的本地向量知识库，支持混合搜索。

**核心架构**:

```
                    ┌──────────────────────┐
                    │  MemoryIndexManager   │ (manager.ts, 75KB)
                    │  - 索引管理           │
                    │  - 嵌入批处理         │
                    │  - 文件同步           │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌────────────┐  ┌──────────────┐  ┌──────────────┐
     │ 向量搜索   │  │ 全文搜索     │  │ 混合搜索     │
     │ (sqlite-vec)│  │ (FTS5/BM25) │  │ (hybrid.ts)  │
     └────────────┘  └──────────────┘  └──────────────┘
              │                │
              ▼                ▼
     ┌──────────────────────────────┐
     │     Embedding Providers      │
     │  OpenAI │ Gemini │ 本地     │
     │  (批处理 API 支持)           │
     └──────────────────────────────┘
```

**搜索接口**:

```typescript
interface MemorySearchManager {
  search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
    },
  ): Promise<MemorySearchResult[]>;
  sync?(params?: { force?: boolean }): Promise<void>;
}
```

**内存文件发现**: 扫描 `MEMORY.md` / `memory/` 目录 + 会话文件转录。

**关键常量**:

- 嵌入批处理上限: 8000 tokens
- 并发嵌入操作: 4
- 向量加载超时: 30s
- 远程批处理超时: 2min

### 4.8 会话管理

**位置**: `src/config/sessions/`

**会话模型**:

- **Main Session**: DM 直聊的默认会话
- **Per-Peer Session**: 按对话对象隔离
- **Group Session**: 群组独立会话
- **Isolated Session**: 沙箱工具派生

**SessionEntry 核心字段**:

```typescript
type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  chatType?: "dm" | "group" | "channel";
  thinkingLevel?: string;
  queueMode?: "steer" | "followup" | "collect" | "queue" | "interrupt";
  modelOverride?: string;
  inputTokens?: number;
  outputTokens?: number;
  skillsSnapshot?: SessionSkillSnapshot;
  // ...
};
```

**会话键生成**: `{agentId}:{channel}:{accountId}:{peerKind}:{peerId}`

**DM 作用域** (`dmScope` 配置):

- `main` — 所有 DM 合并到一个会话
- `per-peer` — 每个对话对象独立会话
- `per-channel-peer` — 按通道+对象隔离
- `per-account-channel-peer` — 完全隔离

**缓存策略**: 内存缓存 + 45s TTL

### 4.9 定时任务与自动化

**位置**: `src/cron/`

**调度类型**:

```typescript
type CronSchedule =
  | { kind: "at"; at: string } // 一次性
  | { kind: "every"; everyMs: number } // 固定间隔
  | { kind: "cron"; expr: string; tz?: string }; // Cron 表达式
```

**负载类型**:

- `systemEvent` — 系统事件文本
- `agentTurn` — Agent 对话轮次 (含 model, thinking, deliver 等选项)

**CronService 接口**:

```typescript
class CronService {
  start(): Promise<void>;
  stop(): void;
  list(opts?): Promise<CronJob[]>;
  add(input: CronJobCreate): Promise<CronJob>;
  update(id, patch): Promise<CronJob>;
  remove(id): Promise<void>;
  run(id, mode?: "due" | "force"): Promise<void>;
  wake(opts: { mode: "now" | "next-heartbeat"; text: string }): void;
}
```

**Webhook 支持**: Gateway HTTP 端点接收外部触发，支持 `/hooks/wake` 和 `/hooks/agent` 端点。

---

## 5. 扩展与插件体系

### 5.1 插件 API

每个扩展通过 `openclaw.plugin.json` 清单注册:

```json
{
  "id": "bluebubbles",
  "configSchema": { ... },
  "kind": "channel",
  "channels": ["bluebubbles"],
  "name": "BlueBubbles",
  "description": "iMessage via BlueBubbles"
}
```

**插件注册 API** (`OpenClawPluginApi`):

```typescript
api.registerChannel({ plugin: channelPlugin });
api.registerTool(toolFactory, { optional: true });
api.registerCli(registrar, { commands: ["mycommand"] });
api.registerHttpHandler(webhookHandler);
api.registerProvider(providerPlugin);
api.registerHook(hookEntry);
```

### 5.2 扩展目录 (`extensions/`)

**31 个扩展**, 按类别分组:

| 类别          | 扩展                                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 消息通道 (14) | bluebubbles, discord, feishu, googlechat, imessage, line, matrix, mattermost, msteams, nextcloud-talk, nostr, signal, slack, telegram, tlon, twitch, whatsapp, zalo, zalouser |
| 内存后端 (2)  | memory-core, memory-lancedb                                                                                                                                                   |
| 认证 (4)      | google-antigravity-auth, google-gemini-cli-auth, minimax-portal-auth, qwen-portal-auth                                                                                        |
| 工具 (4)      | llm-task, lobster, copilot-proxy, voice-call                                                                                                                                  |
| 诊断 (1)      | diagnostics-otel                                                                                                                                                              |
| 其他 (1)      | open-prose                                                                                                                                                                    |

### 5.3 Skill 系统

**位置**: `skills/` (53 个 Skill)

Skill 是用户可扩展的领域工具包，通过 `SKILL.md` 元数据发现。

**发现来源**:

1. **Bundled** — 内置 Skill
2. **Managed** — NPM 安装
3. **Workspace** — 本地路径

**Skill 配置**:

```typescript
type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
  config?: Record<string, unknown>;
};
```

**Skill 举例**: `coding-agent`, `github`, `spotify-player`, `weather`, `obsidian`, `canvas`, `nano-pdf` 等。

---

## 6. 多平台客户端

### 6.1 macOS 应用

**位置**: `apps/macos/`
**语言**: Swift
**功能**: 菜单栏控制面, Voice Wake/PTT, Talk Mode 浮层, WebChat, Canvas, 远程 Gateway 控制

### 6.2 iOS 应用

**位置**: `apps/ios/`
**语言**: Swift
**功能**: Canvas, Voice Wake, Talk Mode, 相机, 屏幕录制, Bonjour 配对

### 6.3 Android 应用

**位置**: `apps/android/`
**语言**: Kotlin
**功能**: Canvas, Talk Mode, 相机, 屏幕录制, 可选 SMS

### 6.4 Control UI

**位置**: `ui/`
**技术**: Lit Web Components + Vite
**运行时依赖**: `@noble/ed25519`, `dompurify`, `marked`
**功能**: 会话管理, 配置编辑, 状态监控 — 直接由 Gateway HTTP 服务

---

## 7. 部署架构

### 7.1 Docker

**镜像**:

| Dockerfile                   | 用途                              |
| ---------------------------- | --------------------------------- |
| `Dockerfile`                 | 主应用 (Node.js 22, 非 root 用户) |
| `Dockerfile.sandbox`         | 代码执行沙箱                      |
| `Dockerfile.sandbox-browser` | 含浏览器的沙箱                    |

**Docker Compose** (`docker-compose.yml`): 编排主服务 + 沙箱容器

**安全实践**:

```bash
docker run --read-only --cap-drop=ALL \
  -v openclaw-data:/app/data \
  openclaw/openclaw:latest
```

### 7.2 Fly.io

**配置文件**: `fly.toml` + `fly.private.toml`

### 7.3 Render

**配置文件**: `render.yaml`

### 7.4 CI/CD

**GitHub Actions** (`.github/workflows/`):

- `ci.yml` — 类型检查 (tsgo), lint, 单元测试, 扩展测试
- `docker-release.yml` — Docker 镜像构建 + 推送到 GHCR (amd64 + arm64)
- 更多: macOS/iOS 构建, install smoke test, E2E 测试

---

## 8. 安全机制

### 8.1 DM 策略

默认 `dmPolicy="pairing"`: 未知发送者收到配对码，管理员通过 `openclaw pairing approve` 批准。

策略选项:

- `pairing` — 配对码验证 (默认)
- `open` — 开放接收 (需显式 opt-in)

### 8.2 沙箱隔离

- Docker 容器化执行
- 工具策略控制 (`tool-policy.ts`)
- 工作区目录隔离
- 容器自动清理

### 8.3 命令审批

- `exec-approval-manager.ts` — Agent 工具执行审批
- 可配置审批策略 (`types.approvals.ts`)

### 8.4 密钥管理

- `detect-secrets` 自动检测 (`.detect-secrets.cfg`)
- `.secrets.baseline` 基线文件
- 环境变量替换 (`env-substitution.ts`): 支持 `${VAR_NAME}` 语法
- `.env.example` 模板

### 8.5 安全审计

```bash
openclaw security audit --deep   # 深度安全审计
openclaw security audit --fix    # 自动修复
openclaw doctor                  # 配置健康检查
```

### 8.6 设备认证

- Ed25519 密钥对 (`device-auth.ts`)
- TLS 指纹验证
- Gateway Token/Password 认证

---

## 9. 测试体系

### 9.1 测试分层

| 层级      | 命名约定             | 说明                 |
| --------- | -------------------- | -------------------- |
| 单元测试  | `*.test.ts`          | 模块级测试, 就近放置 |
| 覆盖测试  | `*.coverage.test.ts` | 关注覆盖率           |
| Live 测试 | `*.live.test.ts`     | 需要真实 API 密钥    |
| E2E 测试  | `scripts/e2e/`       | 端到端集成测试       |

### 9.2 测试配置

- **框架**: Vitest
- **配置**: `vitest.config.ts` (根目录 + UI 子包)
- **测试文件数**: 1000+
- **CI 矩阵**: `pnpm test:unit`, 各扩展独立测试

### 9.3 测试分布

测试文件就近放置在源码旁边:

- `src/agents/tools/*.test.ts` — 工具测试
- `src/config/*.test.ts` — 配置测试
- `src/routing/*.test.ts` — 路由测试
- `extensions/*/src/*.test.ts` — 扩展测试
- `src/cron/*.test.ts` — Cron 测试

---

## 10. 关键配置参考

### 10.1 配置文件结构

主配置文件: `openclaw.yaml` (或 `openclaw.json`)

**Schema 定义**: `src/config/schema.ts` (55KB, Zod 完整 schema)

**顶层分组**:

```yaml
# Agent 定义
agents:
  list:
    - id: "default"
      model: "claude-sonnet-4-5-20250929"
      thinking: "medium"

# 通道配置
channels:
  whatsapp: { ... }
  telegram: { ... }
  discord: { ... }

# 路由绑定
bindings:
  - match: { channel: "telegram", accountId: "*" }
    agentId: "default"

# 工具配置
tools:
  browser: { enabled: true }
  memory: { enabled: true }

# 会话设置
session:
  dmScope: "main"

# 内存知识库
memory:
  provider: "openai"
  model: "text-embedding-3-small"

# Cron 定时任务
cron:
  jobs: [...]

# Gateway 设置
gateway:
  port: 18789
  token: "..."

# Skills
skills:
  entries:
    github: { enabled: true }

# 安全
security:
  sandbox: { docker: true }
  approvals: { ... }
```

### 10.2 环境变量优先级

```
1. 命令行参数 (最高)
2. 环境变量 ($OPENCLAW_*)
3. .env 文件 (loadDotEnv)
4. 配置文件 (openclaw.yaml)
5. 默认值 (src/config/defaults.ts)
```

**`.env.example`** 模板提供基础环境变量参考。

### 10.3 配置验证

- Zod schema 严格验证 (`src/config/zod-schema.*.ts`)
- UI hint 自动生成 (`GROUP_LABELS` 分组)
- Legacy 配置自动迁移 (`legacy.migrations.*.ts`)
- `openclaw doctor` 检查配置健康度
