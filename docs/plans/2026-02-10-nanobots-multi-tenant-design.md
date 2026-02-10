# Nanobots 多租户架构设计

> 日期: 2026-02-10
> 状态: Draft

## 1. 背景与目标

Nanobots 当前是单用户单实例部署架构，目标演进为多租户 SaaS 服务。核心挑战：

- 每个用户需要独立的 bot 运行时（WhatsApp session、Telegram bot、Skills、Memory 等）
- OAuth 第三方集成（Google、Todoist、Notion 等）的回调 URL 只能注册一个
- 需要用户隔离，同时控制资源开销

## 2. 整体架构

```
                         ┌─────────────────────────────┐
                         │         Nginx (入口)         │
                         │  nanobots.com:443            │
                         └──────────┬──────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌─────────────────┐            ┌──────────────────┐
          │  Central Gateway │            │ /webhook/telegram │
          │   (新服务)       │            │  /{userId}/*     │
          │                 │            └────────┬─────────┘
          │ • 用户注册/登录  │                     │
          │ • OAuth 全流程   │              ┌──────▼──────┐
          │ • Web 设置 UI   │              │ User Container│
          │ • 容器编排管理   │              │ (nanobots)   │
          └────────┬────────┘              │ • Bot 运行时  │
                   │                       │ • WhatsApp    │
                   ▼                       │ • Telegram    │
          ┌─────────────────┐              │ • Tools/Skills│
          │   PostgreSQL    │◄─────────────│ • Memory      │
          │ • users         │  读取 token   └──────────────┘
          │ • oauth_tokens  │
          │ • containers    │
          └─────────────────┘
```

### 核心分工

- **Nginx**: TLS 终结 + 路由分发。公共路径（`/`, `/api/*`, `/web/*`）→ Central Gateway；消息通道路径 → 用户容器
- **Central Gateway**: 新写的轻量 Node.js 服务，处理所有"共享关切"——用户体系、OAuth、Web 设置 UI、容器管理
- **User Container**: 现有的 nanobots 容器几乎不动，只改 token 读取方式（从文件 → 从 DB）
- **PostgreSQL**: 所有持久化状态的单一数据源

### 为什么不用"纯转发"架构

如果 Nginx 只做路由转发、所有逻辑都在用户容器里，OAuth 回调就无法路由到正确的容器——OAuth provider 只允许注册一个回调 URL，不支持通配符。中央网关统一接收回调是唯一可扩展的方案。

## 3. OAuth 流程重设计

### 当前问题

- OAuth state 存在进程内存中（`pendingStates` Map），多实例下回调会丢失
- Token 按 provider 存文件（`oauth_tokens/{provider}.json`），无用户隔离
- 回调 URL 从请求头动态拼接，不稳定

### 新流程

```
用户浏览器                Central Gateway              OAuth Provider
    │                          │                           │
    │  1. 点击"连接 Google"     │                           │
    ├─────────────────────────►│                           │
    │                          │                           │
    │  2. 生成 OAuth URL        │                           │
    │     state = encrypt({    │                           │
    │       userId: "u123",    │                           │
    │       provider: "google",│                           │
    │       nonce: "random",   │                           │
    │       timestamp: now()   │                           │
    │     })                   │                           │
    │  3. 返回跳转 URL          │                           │
    │◄─────────────────────────│                           │
    │                          │                           │
    │  4. 跳转到 Google 授权页  │                           │
    ├──────────────────────────┼──────────────────────────►│
    │                          │                           │
    │  5. 用户授权后回调         │                           │
    │     /api/oauth/callback  │                           │
    │     ?code=xxx&state=yyy  │                           │
    ├─────────────────────────►│                           │
    │                          │  6. 解密 state → 得到 userId│
    │                          │  7. 用 code 换 token       │
    │                          ├──────────────────────────►│
    │                          │◄──────────────────────────│
    │                          │                           │
    │                          │  8. token 加密写入 DB       │
    │                          │     (userId + provider)   │
    │                          │                           │
    │  9. 返回成功页面           │                           │
    │◄─────────────────────────│                           │
```

### 关键设计决策

1. **State 参数用 AES-256-GCM 加密** — 包含 `{userId, provider, nonce, timestamp}`，密钥只有 Central Gateway 知道。无需内存存储，Gateway 天然无状态可水平扩展。timestamp 用于防重放（10 分钟过期）。
2. **回调 URL 全局唯一** — `https://nanobots.com/api/oauth/callback`，在每个 OAuth provider 只注册这一个。
3. **Token 存储按 `(userId, provider)` 为主键** — 替代现有文件方案。

## 4. 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- OAuth Token 表 (替代现有文件存储)
CREATE TABLE oauth_tokens (
    user_id       UUID NOT NULL REFERENCES users(id),
    provider      VARCHAR(50) NOT NULL,       -- google, todoist, notion...
    access_token  TEXT NOT NULL,               -- AES 加密存储
    refresh_token TEXT,                        -- AES 加密存储
    expires_at    BIGINT,                     -- Unix ms, NULL = 永不过期
    scopes        TEXT[],                     -- PostgreSQL 数组
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, provider)
);

-- 用户容器表
CREATE TABLE containers (
    user_id       UUID PRIMARY KEY REFERENCES users(id),
    container_id  VARCHAR(100),               -- Docker container ID
    internal_port INT NOT NULL,               -- 容器内部端口
    status        VARCHAR(20) DEFAULT 'running', -- running / stopped / creating
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 要点

- `oauth_tokens` 以 `(user_id, provider)` 为联合主键，重新授权用 `ON CONFLICT ... DO UPDATE`
- `access_token` / `refresh_token` 用 Gateway 密钥 AES 加密后入库，防止 DB 泄露即泄露全部 token
- `containers` 表记录每个用户的容器映射，Gateway 据此做路由转发
- Schema 刻意精简，MVP 够用即可，后续按需加字段（`plan`, `quota` 等）

## 5. 用户容器改造

### 改动范围

唯一需要改的文件：`extensions/web-setup/src/oauth/store.ts`

**现在（从文件读）：**

```typescript
export async function loadToken(provider: string): Promise<OAuthToken | null> {
  const filePath = path.join(STATE_DIR, "oauth_tokens", `${provider}.json`);
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}
```

**改为（从 DB 读）：**

```typescript
export async function loadToken(provider: string): Promise<OAuthToken | null> {
  const userId = process.env.NANOBOTS_USER_ID;
  const row = await db.query("SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2", [
    userId,
    provider,
  ]);
  return row ? decryptToken(row) : null;
}
```

### 容器身份注入

容器启动时由 Central Gateway 注入环境变量：

```bash
docker run -d \
  --name nanobots-u123 \
  --network nanobots-net \
  -e NANOBOTS_USER_ID=u123 \
  -e NANOBOTS_DB_URL=postgres://nanobots:xxx@db:5432/nanobots \
  nanobots:latest
```

容器不需要知道多租户的存在，它只知道"我是 u123，从这个 DB 读我的 token"。

### Token 刷新策略：容器自刷新

容器现有的 `getValidToken()` 已有刷新逻辑，只需改存储层。按需刷新比 Gateway 统一轮询更高效，用 DB 乐观锁（`UPDATE ... WHERE updated_at = 原值`）防止并发重复刷新。

### 不需要改的部分

- OAuth 发起和回调 — 已移到 Central Gateway
- Tool 调用链 — `getValidToken(provider)` 接口不变
- WhatsApp / Telegram — 完全不受影响
- Skills / Memory — 不涉及 OAuth

## 6. Central Gateway 服务设计

### 技术选型

Node.js + Express/Fastify，与 nanobots 同语言栈，方便复用 OAuth 逻辑代码。

### API 设计

```
# 用户认证
POST   /api/auth/register        { email, password }
POST   /api/auth/login           { email, password } → { token (JWT) }

# OAuth (从 web-setup 插件迁移)
GET    /api/oauth/providers      → 可用 provider 列表 + 该用户连接状态
POST   /api/oauth/start          { provider } → { url }
GET    /api/oauth/callback       ← OAuth provider 回调
POST   /api/oauth/disconnect     { provider }

# 容器管理
GET    /api/container/status     → 当前用户容器状态
POST   /api/container/provision  → 创建并启动容器（注册后自动调用）

# Web 设置页面 (静态文件)
GET    /web/*                    → 设置向导 UI
```

### Nginx 路由规则

```nginx
server {
    listen 443 ssl;
    server_name nanobots.com;

    # 公共路径 → Central Gateway
    location / {
        proxy_pass http://gateway:3000;
    }

    # Telegram webhook → 转给 Gateway 内部代理到容器
    location /webhook/telegram/ {
        proxy_pass http://gateway:3000;
    }
}
```

### 关键点

- **Telegram webhook** 是唯一需要路由到用户容器的外部回调。注册 webhook 时 URL 设为 `https://nanobots.com/webhook/telegram/{userId}`，Gateway 查 containers 表找到对应容器后内部代理转发。
- **WhatsApp** 用 Web 协议主动外连，不存在外部回调问题。
- **Web 设置 UI** 全部由 Central Gateway 提供，用户登录后才能访问。
- Gateway 本身无状态（state 加密、session 用 JWT），可水平扩展。

## 7. 部署架构

### 单机部署（MVP）

```
                    ┌─── VPS ──────────────────────────────────────┐
                    │                                              │
  浏览器 ────443──►│  ┌──────────────────┐                        │
  Telegram ──443──►│  │     Nginx         │                        │
                    │  │  :443 (TLS终结)   │                        │
                    │  └──┬────────┬──────┘                        │
                    │     │        │                                │
                    │     │公共路径 │ /webhook/telegram/*            │
                    │     ▼        ▼                                │
                    │  ┌─────────────┐    Docker Network            │
                    │  │   Gateway   │    (nanobots-net)            │
                    │  │    :3000    │   ┌──────────┐ ┌──────────┐ │
                    │  │   Node.js   │   │ user-001 │ │ user-002 │ │
                    │  │             │   │  :8080   │ │  :8080   │ │
                    │  └──────┬──────┘   └──────────┘ └──────────┘ │
                    │         │                ...                  │
                    │         ▼                                     │
                    │  ┌─────────────┐                             │
                    │  │ PostgreSQL  │                              │
                    │  │   :5432     │                              │
                    │  └─────────────┘                             │
                    └──────────────────────────────────────────────┘
```

### Docker Compose

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - gateway

  gateway:
    build: ./gateway
    expose:
      - "3000"
    environment:
      - DATABASE_URL=postgres://nanobots:secret@db:5432/nanobots
      - JWT_SECRET=xxx
      - OAUTH_ENCRYPTION_KEY=xxx
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=nanobots
      - POSTGRES_USER=nanobots
      - POSTGRES_PASSWORD=secret

  # 用户容器不写在 compose 里
  # 由 Gateway 通过 Docker API (dockerode) 动态创建

volumes:
  pgdata:
```

### 容器资源估算

每个 nanobots 容器包含 Chromium、Python3、Node.js 22、Bun 等：

| 组件                         | 内存           |
| ---------------------------- | -------------- |
| Node.js 进程 (nanobots)      | ~80-120MB      |
| Chromium 空闲 (已启动未使用) | ~100-150MB     |
| Chromium 活跃 (打开页面时)   | ~200-400MB     |
| Python 进程 (如有)           | ~30-50MB       |
| **每容器总计**               | **~300-500MB** |

| 服务器规格                | 可承载用户数  |
| ------------------------- | ------------- |
| 8GB VPS                   | ~10-12 个用户 |
| 16GB VPS                  | ~25-30 个用户 |
| 32GB VPS                  | ~55-60 个用户 |
| Gateway + DB + Nginx 开销 | ~1-1.5GB      |

## 8. 安全与隔离

### 容器隔离

- **网络隔离**: 每个容器只能访问 DB 和外部 API，容器间不可互访（Docker network + iptables）
- **存储隔离**: 每个容器独立 volume 存本地数据（WhatsApp session、memory 等）
- **DB 隔离**: MVP 阶段信任应用层查询条件（`WHERE user_id = $1`），后续可启用 PostgreSQL RLS

### Gateway 安全

- **JWT 认证**: 用户登录后获得 JWT，所有 `/api/*` 请求带 `Authorization: Bearer <token>`
- **OAuth state 加密**: AES-256-GCM，state 内含 timestamp 防重放（10 分钟过期）
- **Token 加密存储**: DB 中的 access_token / refresh_token 用 Gateway 密钥加密
- **Rate limiting**: Nginx 层做基础限流，防止暴力登录

## 9. 资源优化路线（后续迭代）

### 9.1 容器按需启停

每容器 300-500MB 的内存开销使得常驻运行模式无法支撑大量用户。按需启停是扩展性的关键：

**触发启动的场景：**

- 用户通过 WhatsApp / Telegram 发送消息
- 用户访问 Web 设置页面
- 定时任务（Cron Skills）触发

**休眠策略：**

- 空闲超过 N 分钟（如 30 分钟）后自动 `docker stop`
- Gateway 维护容器状态机：`running → idle → stopped`
- 收到消息时先检查容器状态，如已停止则 `docker start` 并缓冲消息

**冷启动优化：**

- `docker stop` 而非 `docker rm`，避免重建容器开销
- Node.js 进程启动约 3-5 秒，对消息场景可接受
- 对 WhatsApp 需要验证 session 恢复是否需要重新扫码

### 9.2 Chromium 抽离为共享服务

Chromium 是容器内存的最大开销来源（100-400MB）。可以将其抽离为共享的浏览器池服务：

**方案：使用 browserless 或类似服务**

```
┌──────────────┐     ┌──────────────────────┐
│ User Container│────►│  Browserless Pool     │
│ (无 Chromium) │     │  (共享 2-4 个实例)     │
└──────────────┘     │  按需分配 browser tab  │
                      └──────────────────────┘
```

**收益：**

- 每个用户容器内存降至 ~80-150MB（去掉 Chromium）
- 8GB VPS 可承载 ~30-40 个用户（提升 3x）
- Chromium 实例可在用户间复用，按需分配 tab

**注意事项：**

- 需要确认 nanobots 中哪些功能依赖 Chromium（URL 抓取工具、WhatsApp Web 等）
- WhatsApp Web 协议（Baileys）不依赖 Chromium，使用的是 WebSocket 直连
- 主要使用场景可能是 URL 内容抓取工具，适合按需调用共享实例

## 10. 实施路线图

### Phase 1 — 基础设施

1. PostgreSQL 部署 + schema 创建
2. Central Gateway 骨架（Express/Fastify，用户注册/登录/JWT）
3. 容器编排模块（通过 Docker API 创建/管理用户容器）
4. Nginx 配置（TLS + 路由规则）

### Phase 2 — OAuth 迁移

5. Gateway 实现 OAuth 全流程（从 web-setup 迁移，state 改为加密方案）
6. nanobots 容器改造 `store.ts`（文件读取 → DB 读取 + token 刷新写回）
7. Web 设置 UI 迁移到 Gateway（加入用户登录页，OAuth 连接页改为调 Gateway API）

### Phase 3 — 通道适配

8. Telegram webhook 按用户路由
9. WhatsApp 容器内独立运行（无需路由改动）
10. 端到端测试：注册 → 登录 → 连接 OAuth → WhatsApp/Telegram 收发消息

### Phase 4 — 资源优化

11. 容器按需启停（空闲休眠 + 消息触发唤醒）
12. Chromium 抽离为共享 browserless 服务（可选）
13. 容器健康检查 + 自动重启

### Phase 5 — 加固

14. Token 加密存储
15. Nginx rate limiting
16. 基础监控（容器状态、OAuth 成功率、内存使用）

## 11. MVP 不做的事项

- Kubernetes / 自动扩缩容
- 用户配额 / 计费系统
- 多区域部署
- PostgreSQL RLS 级别的 DB 隔离
- 子域名分发（用中央网关统一路由）
