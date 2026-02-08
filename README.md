# Nanobots

通过 WhatsApp 和 Telegram 使用的个人 AI 助手。零配置，单容器部署。

## 快速开始

### 方式一：Docker（推荐）

**前提条件：** 已安装 Docker 和 Docker Compose。

**1. 启动容器**

```bash
git clone <repo-url> nanobots && cd nanobots
docker compose up -d
```

首次启动需要构建镜像（约 5 分钟），之后启动秒级完成。

**2. 打开设置向导**

浏览器访问 [http://localhost:8080/web](http://localhost:8080/web)。

**3. 配置消息通道**

选择一个或两个都配：

- **Telegram**：通过 [@BotFather](https://t.me/BotFather) 创建 Bot，填入 Bot Token 和你的 User ID（向 [@userinfobot](https://t.me/userinfobot) 发消息即可获取）
- **WhatsApp**：用 WhatsApp 扫描向导中显示的二维码

**4. 配置 AI 模型**

选择模型提供商并填入 API Key：

| 提供商    | 获取 API Key                                                  |
| --------- | ------------------------------------------------------------- |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/)       |
| OpenAI    | [platform.openai.com](https://platform.openai.com/api-keys)   |
| Google    | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

**5. 开始聊天**

在 Telegram 或 WhatsApp 上给你的 Bot 发消息，助手已就绪。

### 方式二：本地开发

**前提条件：** Node.js 22+、pnpm 10+。

```bash
git clone <repo-url> nanobots && cd nanobots
pnpm install
pnpm dev
```

Gateway 启动后访问 `http://localhost:8080/web` 进行配置。

仅启动 Gateway（跳过消息通道，适合开发 Web UI）：

```bash
pnpm gateway:dev
```

### 验证配置

配置完成后可通过以下方式验证：

- **Web UI**：访问 `http://localhost:8080/web`，向导完成后显示绿色对勾
- **设置页**：访问 `http://localhost:8080/web#settings` 管理 OAuth 连接和服务设置
- **日志**（Docker）：`docker compose logs -f nanobots`

## 功能

- **消息通道**：WhatsApp（二维码登录）+ Telegram（Bot Token）
- **AI 模型**：Anthropic Claude、OpenAI、Google Gemini
- **Google 服务**：通过 OAuth 接入日历和 Gmail
- **Skills**：23 个内置技能（天气、摘要、PDF 工具、GitHub、邮件等）
- **插件系统**：可扩展的工具、Hook、HTTP 路由和服务
- **记忆**：跨会话持久化对话记忆
- **Web 设置**：浏览器端配置向导（端口 8080）

## 配置

### 环境变量

| 变量                            | 说明                    | 默认值        |
| ------------------------------- | ----------------------- | ------------- |
| `NANOBOTS_GATEWAY_TOKEN`        | Gateway 认证令牌        | `changeme`    |
| `NANOBOTS_PORT`                 | HTTP 端口               | `8080`        |
| `NANOBOTS_STATE_DIR`            | 数据目录                | `~/.nanobots` |
| `NANOBOTS_GOOGLE_CLIENT_ID`     | Google OAuth 客户端 ID  | -             |
| `NANOBOTS_GOOGLE_CLIENT_SECRET` | Google OAuth 客户端密钥 | -             |

也支持旧版 `OPENCLAW_*` 环境变量。

### Docker Compose

```yaml
services:
  nanobots:
    build: .
    container_name: nanobots
    ports:
      - "8080:8080"
    volumes:
      - nanobots-data:/home/node/.nanobots
    environment:
      - NANOBOTS_GATEWAY_TOKEN=your-secret-token
    restart: unless-stopped

volumes:
  nanobots-data:
```

### 可选：Google 日历和 Gmail

启用 Google 服务需要创建 Google OAuth 应用：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials
2. 创建 OAuth 2.0 客户端 ID（Web application 类型）
3. 添加 `http://localhost:8080/api/oauth/callback` 为授权重定向 URI
4. 设置环境变量：

```bash
NANOBOTS_GOOGLE_CLIENT_ID=your-client-id
NANOBOTS_GOOGLE_CLIENT_SECRET=your-client-secret
```

5. 在 Web UI 中连接：`http://localhost:8080/web#settings`

## 开发

```bash
pnpm install
pnpm dev          # 开发模式（自动重新构建）
pnpm gateway:dev  # 仅启动 Gateway（跳过消息通道）
pnpm test         # 运行测试
pnpm build        # 生产构建
```

## 架构

基于 Pi Agent 框架，采用插件化扩展体系：

- **Gateway**：HTTP 服务器，提供 Web UI、API 端点和插件路由
- **通道**：WhatsApp (Baileys) 和 Telegram (grammY)
- **插件**：扩展注册工具、Hook、HTTP 路由和服务
- **Web 设置**：浏览器端初始配置向导

## 许可证

MIT
