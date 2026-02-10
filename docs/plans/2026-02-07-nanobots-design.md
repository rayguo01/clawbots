# Nanobots 设计文档

> 面向小白用户的零配置个人 AI 助手，基于 openclaw fork 裁剪。

## 1. 项目定位

**目标用户**：非技术用户（小白）
**交互方式**：WhatsApp + Telegram 聊天
**部署方式**：Docker 一键启动，Web 页面完成所有配置
**核心价值**：用户零配置，登录后选个模型就能用

### 核心原则

- 用户零配置：Web 向导完成设置，无需编辑配置文件
- 功能不弱：多模型、工具丰富、记忆系统、定时任务、浏览器控制
- 基于 openclaw fork：继承成熟的 Agent 运行时，裁剪不必要的复杂度

## 2. 技术选型

| 决策       | 选择                                   | 理由                                         |
| ---------- | -------------------------------------- | -------------------------------------------- |
| 基础框架   | Fork openclaw                          | 继承 Pi 多模型、会话压缩、工具系统等成熟能力 |
| 语言       | TypeScript                             | openclaw 原生语言                            |
| LLM 调用   | Pi 框架 (@mariozechner/pi-ai)          | 多模型 + fallback + 认证管理                 |
| 消息通道   | WhatsApp (Baileys) + Telegram (grammY) | 现有实现                                     |
| 向量知识库 | SQLite + sqlite-vec                    | 现有 memory-core 实现                        |
| 部署       | Docker 单容器                          | 简单，一条命令                               |

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  Docker Container (常驻)                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  HTTP Server                                       │ │
│  │  ├─ /webhook/whatsapp    ← 消息入口               │ │
│  │  ├─ /webhook/telegram    ← 消息入口               │ │
│  │  ├─ /web/setup/*         ← 设置向导               │ │
│  │  ├─ /web/auth/*          ← OAuth 授权管理         │ │
│  │  └─ /web/settings/*      ← 用户选模型/填 Key     │ │
│  └──────────────┬─────────────────────────────────────┘ │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  消息调度 (简化版)                                 │ │
│  │  1. 识别用户身份 (channel + chat_id)               │ │
│  │  2. 加载用户配置 (模型、OAuth token)               │ │
│  │  3. 命令检测 (/ 开头 → Skill 命令)                │ │
│  │  4. 交给 Agent Core                               │ │
│  └──────────────┬─────────────────────────────────────┘ │
│                 ▼                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Agent Core (Pi embedded runner)                   │ │
│  │  ├─ Pi LLM 调用 (多模型 + fallback)               │ │
│  │  ├─ 工具系统 (exec/read/write/web/browser/cron..) │ │
│  │  ├─ Skill 系统 (SKILL.md + 脚本)                  │ │
│  │  ├─ 会话管理 + 自动压缩                           │ │
│  │  ├─ 三层记忆系统                                   │ │
│  │  ├─ TTS 语音回复                                   │ │
│  │  └─ Plugin 架构 (扩展工具/Hook/HTTP)               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  /app/data/           ← 持久化：配置、会话、记忆、token │
│  /app/workspace/      ← 持久化：Skill、用户文件、记忆   │
└─────────────────────────────────────────────────────────┘
```

## 4. 从 openclaw 裁剪清单

### 删除

| 模块                                      | 原因                                     |
| ----------------------------------------- | ---------------------------------------- |
| 原生客户端 (apps/macos, ios, android)     | 不需要                                   |
| Control UI (ui/)                          | 自己做 Web 设置向导                      |
| 多余通道 (discord, slack, signal 等)      | 只需 WhatsApp + Telegram                 |
| Gateway WS 协议 (src/gateway/ WS 部分)    | 用简单 HTTP 替代                         |
| 复杂路由系统 (src/routing/)               | 单租户大幅简化                           |
| DM 配对机制 (src/pairing/)                | 不需要                                   |
| 设备认证 (device-auth, Ed25519)           | 不需要                                   |
| 子包 (packages/clawdbot, moltbot)         | 向后兼容空壳                             |
| Fly.io / Render 部署配置                  | 只保留 Docker                            |
| 5 个认证扩展 (google-antigravity-auth 等) | LLM 认证用内置的                         |
| 28 个不需要的 extension                   | 只保留 whatsapp + telegram + memory-core |
| Canvas/A2UI (src/canvas-host/)            | 无接收端                                 |

### 保留

| 模块                              | 说明                         |
| --------------------------------- | ---------------------------- |
| Agent 运行时 (Pi embedded runner) | 核心 Agent Loop              |
| 工具系统 (60+ 工具)               | 丰富的内置工具               |
| LLM 多模型支持 (Pi)               | 多模型 + fallback + 认证轮转 |
| Claude setup-token 认证           | Claude Max 订阅              |
| model-auth + auth-profiles 体系   | 认证管理                     |
| Plugin 架构                       | 后续扩展                     |
| Skill 系统 (原样保留)             | SKILL.md + 脚本              |
| 向量知识库 (memory-core)          | 三层记忆基础                 |
| 会话管理 + 自动压缩               | 核心                         |
| Cron 定时任务                     | 实用                         |
| 浏览器控制 (browser)              | 实用                         |
| TTS 语音                          | 实用                         |
| WhatsApp 通道 (extension)         | 核心                         |
| Telegram 通道 (extension)         | 核心                         |
| Docker 部署                       | 核心                         |
| System Prompt 构建                | 分层 + 模块化，现有够用      |

### 需要新做

| 模块               | 说明                                    |
| ------------------ | --------------------------------------- |
| Web 设置向导       | 首次启动配置（通道、模型、API Key）     |
| Web OAuth 管理页   | 用户授权 Google Calendar 等服务         |
| Web 模型选择页     | 用户选模型/填自己的 API Key             |
| OAuth 用户服务集成 | 以 Plugin 形式注册工具 + HTTP 路由      |
| 配置简化           | Web 向导生成 config.json，替代复杂 yaml |

## 5. Web 设置向导

### 首次启动流程

```
docker compose up → 打开 http://localhost:8080

Step 1: 连接消息平台
  WhatsApp: [扫码连接]
  Telegram: [填写 Bot Token] [验证连接]
            [填写你的 User ID]
            提示：向 @userinfobot 发消息即可获取

Step 2: 配置 AI 模型
  默认模型: [Claude Sonnet 4.5 ▼]
  API Key:  [sk-ant-oat01-...]
  + 添加更多模型

Step 3: 连接外部服务 (可选，后续也可配)
  Google Calendar  [连接]
  Gmail            [连接]

完成! Agent 已就绪，去 WhatsApp/Telegram 聊天吧
```

### 用户模型管理

- 管理员预配置默认模型和 API Key
- 用户可在 Web 页面选择管理员配置的模型
- 用户也可填写自己的 API Key 使用其他模型

## 6. 消息流转

```
用户在 WhatsApp/Telegram 发消息
  │
  ▼
Webhook 接收 (Baileys / grammY)
  │
  ▼
消息调度 (简化版 auto-reply)
  ├─ 识别用户身份
  ├─ 加载用户配置 (模型、OAuth token)
  ├─ 命令检测 (/ 开头)
  └─ 交给 Agent Core
  │
  ▼
Agent Core (Pi embedded runner)
  ├─ 构建 System Prompt (身份 + Skill 索引 + 记忆 + 工具)
  ├─ 加载会话历史 (自动压缩)
  ├─ 调用 LLM (用户选的模型)
  ├─ 执行工具 (可能用用户 OAuth token)
  ├─ 保存会话 + 更新记忆
  └─ 生成回复
  │
  ▼
回复发送
  ├─ 文本分块 (长消息拆分)
  ├─ 可选 TTS 语音回复
  └─ 通过对应通道 API 发回给用户
```

## 7. OAuth 用户服务集成

### 架构

管理员注册 OAuth 应用（如 Google），用户在 Web 页面一键授权，Agent 拿用户 token 操作服务。

### 实现方式

每个外部服务封装为 Plugin：

```typescript
// extensions/google-services/index.ts
export default {
  id: "google-services",
  register(api) {
    // 注册 OAuth 回调路由
    api.registerHttpRoute({
      path: "/web/auth/google/callback",
      handler: handleGoogleOAuthCallback,
    });

    // 注册 Agent 工具
    api.registerTool(createGoogleCalendarTools(api));
    api.registerTool(createGmailTools(api));
  },
};
```

### OAuth 流程

1. 管理员在 Google Console 注册 OAuth 应用
2. 用户在 Web 页面点击 "连接 Google"
3. 跳转 Google 授权页，用户同意
4. 回调存储 token 到 /app/data/oauth_tokens/
5. Agent 通过工具使用 token 调用 Google Calendar API 等

## 8. 记忆系统

三层记忆，全部使用 openclaw 现有实现，无需改动：

| 层       | 来源            | 存储                 | 生命周期           |
| -------- | --------------- | -------------------- | ------------------ |
| 短期记忆 | SessionManager  | 会话文件             | 会话期间，自动压缩 |
| 长期记忆 | Agent 主动写入  | MEMORY.md + 向量索引 | 永久，可更新删除   |
| 知识库   | 用户/管理员导入 | SQLite + sqlite-vec  | 永久，可管理增删   |

## 9. 文件存储

```
/app/
├── data/                          # 持久化卷
│   ├── config.json                # Web 向导生成的配置
│   ├── sessions/                  # 会话历史
│   ├── memory/                    # 向量知识库
│   ├── oauth_tokens/              # 用户 OAuth token
│   └── auth-profiles.json         # LLM 认证
│
└── workspace/                     # 持久化卷
    ├── skills/                    # 自定义 Skill
    ├── files/                     # 用户文件空间
    │   ├── uploads/               # 用户上传的文件 (PPT、图片等)
    │   └── generated/             # Agent 生成的文件
    └── MEMORY.md                  # 长期记忆
```

## 10. 部署

```yaml
# docker-compose.yaml
services:
  nanobots:
    image: nanobots:latest
    ports:
      - "8080:8080"
    volumes:
      - nanobots-data:/app/data
      - nanobots-workspace:/app/workspace

volumes:
  nanobots-data:
  nanobots-workspace:
```

**管理员部署两步**：

1. `docker compose up -d`
2. 浏览器打开 `http://localhost:8080` → 设置向导完成配置

## 11. 实施路径

### Phase 1: Fork + 裁剪（可用）

- Fork openclaw
- 删除不需要的模块（按裁剪清单）
- 简化配置系统
- 确保 WhatsApp + Telegram + Agent Core 正常工作

### Phase 2: Web 界面（易用）

- 开发 Web 设置向导
- 开发用户模型选择页
- 用 Web 生成 config.json 替代手动编辑配置文件

### Phase 3: OAuth 服务集成（增值）

- 开发 OAuth 管理页
- 实现 Google Calendar 等服务的 Plugin
- 用户一键授权

### Phase 4: 打磨（体验）

- Skill 挑选和定制
- 记忆系统调优
- Docker 镜像优化
- 文档完善
