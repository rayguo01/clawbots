# Nanobots Phase 2-4: Web 界面 + OAuth + 打磨 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Phase 1 裁剪完成的基础上，为 nanobots 添加 Web 设置向导、OAuth 服务集成、以及整体打磨，使其成为面向小白用户的零配置 AI 助手。

**Architecture:** 利用现有 Gateway HTTP server 的 Plugin HTTP 路由机制 (`registerHttpRoute`)，注册 Web 静态文件服务和 API 端点。Web 前端用纯 HTML + vanilla JS（零依赖），通过 REST API 与后端交互，后端操作 nanobots 的 JSON5 配置文件实现设置持久化。

**Tech Stack:** TypeScript, Node.js 22+, pnpm, HTML/CSS/vanilla JS (Web 前端), Hono/Express-free (直接用 Node HTTP)

**References:**

- 设计文档: `docs/plans/2026-02-07-nanobots-design.md`
- Phase 1 计划: `docs/plans/2026-02-07-nanobots-phase1-implementation.md`

---

## Phase 2: Web 设置向导

### Task 1: 创建 Web Setup Plugin 骨架

**Files:**

- Create: `extensions/web-setup/openclaw.plugin.json`
- Create: `extensions/web-setup/index.ts`
- Create: `extensions/web-setup/src/api.ts`
- Create: `extensions/web-setup/src/static.ts`
- Create: `extensions/web-setup/public/index.html`
- Modify: `nanobots.json` (或等效配置，启用 web-setup 插件)

**Step 1: 创建 plugin manifest**

```json
// extensions/web-setup/openclaw.plugin.json
{
  "id": "web-setup",
  "name": "Nanobots Web Setup",
  "version": "0.1.0",
  "description": "Web-based setup wizard for nanobots",
  "main": "index.ts"
}
```

**Step 2: 创建 plugin 入口**

```typescript
// extensions/web-setup/index.ts
import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { createStaticHandler } from "./src/static.js";
import { registerApiRoutes } from "./src/api.js";

export default {
  id: "web-setup",
  register(api: OpenClawPluginApi) {
    // 注册静态文件服务 (Web UI)
    const staticHandler = createStaticHandler();
    api.registerHttpRoute({
      path: "/web",
      handler: staticHandler,
    });

    // 注册 API 路由
    registerApiRoutes(api);
  },
};
```

**Step 3: 创建静态文件服务**

```typescript
// extensions/web-setup/src/static.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function createStaticHandler() {
  return async (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let filePath = url.pathname.replace(/^\/web\/?/, "/");
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    const fullPath = path.join(PUBLIC_DIR, filePath);

    // 防止路径遍历
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return true;
    }

    try {
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile()) throw new Error("Not a file");
      const ext = path.extname(fullPath);
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
      return true;
    } catch {
      // 未找到文件时返回 index.html（SPA fallback）
      if (filePath !== "/index.html") {
        try {
          const indexPath = path.join(PUBLIC_DIR, "index.html");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          const stream = fs.createReadStream(indexPath);
          stream.pipe(res);
          return true;
        } catch {
          // fall through
        }
      }
      res.statusCode = 404;
      res.end("Not Found");
      return true;
    }
  };
}
```

**Step 4: 创建占位 API 模块**

```typescript
// extensions/web-setup/src/api.ts
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

export function registerApiRoutes(api: OpenClawPluginApi) {
  // API 路由在后续 Task 中逐步添加
  api.registerHttpRoute({
    path: "/api/setup/status",
    handler: async (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ configured: false, step: 0 }));
      return true;
    },
  });
}
```

**Step 5: 创建占位 HTML**

```html
<!-- extensions/web-setup/public/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nanobots Setup</title>
  </head>
  <body>
    <div id="app">
      <h1>Nanobots Setup</h1>
      <p>Loading...</p>
    </div>
    <script src="/web/app.js"></script>
  </body>
</html>
```

**Step 6: 在配置中启用 web-setup 插件**

确认 extensions/web-setup 在 nanobots 项目的插件加载路径中（检查 `src/plugins/loader.ts` 确认 extensions/ 下的插件如何被自动发现）。

**Step 7: 验证插件加载**

```bash
cd /mnt/d/02.mycode/toy/research/nanobots
# 确认编译通过
npx tsc --noEmit 2>&1 | head -20
```

**Step 8: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: add web-setup plugin skeleton with static file serving"
```

---

### Task 2: 实现 Setup Status API 和前端路由

**Files:**

- Modify: `extensions/web-setup/src/api.ts`
- Create: `extensions/web-setup/src/config-bridge.ts`
- Create: `extensions/web-setup/public/app.js`
- Create: `extensions/web-setup/public/style.css`
- Modify: `extensions/web-setup/public/index.html`

**Step 1: 创建配置桥接模块**

config-bridge.ts 负责读写 nanobots 的 JSON5 配置文件，是 Web API 和底层配置系统之间的桥梁。

```typescript
// extensions/web-setup/src/config-bridge.ts
import fs from "node:fs";
import { resolveConfigPath } from "../../../src/config/paths.js";
import { readConfigFromDisk } from "../../../src/config/io.js";

export type SetupStatus = {
  configured: boolean;
  currentStep: number;
  channels: {
    telegram: { configured: boolean; botToken?: string; userId?: string };
    whatsapp: { configured: boolean; connected?: boolean };
  };
  model: {
    configured: boolean;
    defaultModel?: string;
  };
};

export function getSetupStatus(): SetupStatus {
  try {
    const config = readConfigFromDisk();
    const tgConfig = config?.channels?.telegram;
    const modelConfig = config?.agents;

    return {
      configured: !!(tgConfig || config?.channels?.whatsapp),
      currentStep: computeCurrentStep(config),
      channels: {
        telegram: {
          configured: !!tgConfig?.botToken,
          botToken: tgConfig?.botToken ? "***" : undefined,
          userId: tgConfig?.allowFrom?.[0],
        },
        whatsapp: {
          configured: !!config?.channels?.whatsapp?.enabled,
        },
      },
      model: {
        configured: !!modelConfig?.default?.model,
        defaultModel: modelConfig?.default?.model,
      },
    };
  } catch {
    return {
      configured: false,
      currentStep: 0,
      channels: {
        telegram: { configured: false },
        whatsapp: { configured: false },
      },
      model: { configured: false },
    };
  }
}

function computeCurrentStep(config: any): number {
  if (!config) return 0;
  const hasChannel = config?.channels?.telegram?.botToken || config?.channels?.whatsapp?.enabled;
  if (!hasChannel) return 1; // Step 1: 连接消息平台
  const hasModel = config?.agents?.default?.model;
  if (!hasModel) return 2; // Step 2: 配置模型
  return 3; // 完成
}
```

**注意:** 上面的代码是初步骨架。实际 import 路径和配置结构需要根据 nanobots 裁剪后的实际 schema 调整。实现时先检查 `src/config/schema.ts` 中关于 channels.telegram 和 agents 的确切 schema 定义。

**Step 2: 完善 API 路由**

```typescript
// extensions/web-setup/src/api.ts
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import { getSetupStatus } from "./config-bridge.js";

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function registerApiRoutes(api: OpenClawPluginApi) {
  // 获取设置状态
  api.registerHttpRoute({
    path: "/api/setup/status",
    handler: async (_req, res) => {
      const status = getSetupStatus();
      sendJson(res, 200, status);
      return true;
    },
  });
}
```

**Step 3: 创建前端 CSS**

```css
/* extensions/web-setup/public/style.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  min-height: 100vh;
}
.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
}
h1 {
  font-size: 24px;
  margin-bottom: 8px;
}
.subtitle {
  color: #666;
  margin-bottom: 32px;
}

/* Steps */
.steps {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
}
.step-indicator {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #ddd;
  transition: background 0.3s;
}
.step-indicator.active {
  background: #2563eb;
}
.step-indicator.done {
  background: #16a34a;
}

/* Cards */
.card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}
.card h2 {
  font-size: 18px;
  margin-bottom: 16px;
}

/* Forms */
.field {
  margin-bottom: 16px;
}
.field label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}
.field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.field input:focus {
  border-color: #2563eb;
}
.field .hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-secondary {
  background: #e5e7eb;
  color: #333;
}
.btn-success {
  background: #16a34a;
  color: #fff;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

/* Status badges */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.badge-success {
  background: #dcfce7;
  color: #16a34a;
}
.badge-pending {
  background: #fef3c7;
  color: #d97706;
}

/* QR code area */
.qr-area {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  border: 2px dashed #ddd;
  border-radius: 8px;
  margin: 16px 0;
}

/* Done page */
.done-page {
  text-align: center;
  padding: 48px 24px;
}
.done-page .icon {
  font-size: 64px;
  margin-bottom: 16px;
}
.done-page h2 {
  font-size: 24px;
  margin-bottom: 8px;
}
.done-page p {
  color: #666;
}
```

**Step 4: 创建前端路由框架 (app.js)**

```javascript
// extensions/web-setup/public/app.js
(function () {
  const app = document.getElementById("app");

  const state = {
    step: 0, // 0=loading, 1=channels, 2=model, 3=done
    telegram: { botToken: "", userId: "" },
    whatsapp: { enabled: false, connected: false },
    model: { provider: "", model: "", apiKey: "" },
  };

  async function fetchStatus() {
    try {
      const res = await fetch("/api/setup/status");
      return await res.json();
    } catch {
      return null;
    }
  }

  async function init() {
    const status = await fetchStatus();
    if (status) {
      state.step = status.currentStep || 1;
      if (status.channels.telegram.configured) {
        state.telegram.botToken = "configured";
        state.telegram.userId = status.channels.telegram.userId || "";
      }
      state.whatsapp.connected = status.channels.whatsapp.connected || false;
    } else {
      state.step = 1;
    }
    render();
  }

  function render() {
    switch (state.step) {
      case 1:
        renderChannelStep();
        break;
      case 2:
        renderModelStep();
        break;
      case 3:
        renderDonePage();
        break;
      default:
        renderChannelStep();
        break;
    }
  }

  function renderStepIndicator(current) {
    return `<div class="steps">
      <div class="step-indicator ${current >= 1 ? (current > 1 ? "done" : "active") : ""}"></div>
      <div class="step-indicator ${current >= 2 ? (current > 2 ? "done" : "active") : ""}"></div>
      <div class="step-indicator ${current >= 3 ? "done" : ""}"></div>
    </div>`;
  }

  function renderChannelStep() {
    // 将在 Task 3 中实现完整 UI
    app.innerHTML = `
      <div class="container">
        <h1>Nanobots Setup</h1>
        <p class="subtitle">Step 1: Connect messaging platform</p>
        ${renderStepIndicator(1)}
        <div id="channel-content">Loading...</div>
      </div>
    `;
  }

  function renderModelStep() {
    // 将在 Task 5 中实现完整 UI
    app.innerHTML = `
      <div class="container">
        <h1>Nanobots Setup</h1>
        <p class="subtitle">Step 2: Configure AI model</p>
        ${renderStepIndicator(2)}
        <div id="model-content">Loading...</div>
      </div>
    `;
  }

  function renderDonePage() {
    app.innerHTML = `
      <div class="container">
        ${renderStepIndicator(3)}
        <div class="done-page">
          <div class="icon">&#x2705;</div>
          <h2>Setup Complete!</h2>
          <p>Your Nanobots agent is ready. Go chat on WhatsApp or Telegram!</p>
        </div>
      </div>
    `;
  }

  init();
})();
```

**Step 5: 更新 index.html 引入 CSS**

```html
<!-- extensions/web-setup/public/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nanobots Setup</title>
    <link rel="stylesheet" href="/web/style.css" />
  </head>
  <body>
    <div id="app">
      <div class="container"><h1>Loading...</h1></div>
    </div>
    <script src="/web/app.js"></script>
  </body>
</html>
```

**Step 6: 验证编译**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 7: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: web setup status API and frontend routing framework"
```

---

### Task 3: 实现 Telegram 配置 API 和 UI

**Files:**

- Modify: `extensions/web-setup/src/api.ts`
- Create: `extensions/web-setup/src/telegram-setup.ts`
- Modify: `extensions/web-setup/public/app.js`

**Step 1: 创建 Telegram 配置 API**

```typescript
// extensions/web-setup/src/telegram-setup.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody } from "./helpers.js";
import { updateConfig } from "./config-bridge.js";

export async function handleTelegramSave(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readJsonBody(req);
  const { botToken, userId } = body as { botToken?: string; userId?: string };

  if (!botToken || !userId) {
    sendJson(res, 400, { error: "botToken and userId are required" });
    return true;
  }

  // 写入配置
  await updateConfig((config) => {
    config.channels = config.channels || {};
    config.channels.telegram = config.channels.telegram || {};
    config.channels.telegram.botToken = botToken;
    config.channels.telegram.allowFrom = [userId];
    return config;
  });

  sendJson(res, 200, { ok: true });
  return true;
}

export async function handleTelegramVerify(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readJsonBody(req);
  const { botToken } = body as { botToken?: string };

  if (!botToken) {
    sendJson(res, 400, { error: "botToken is required" });
    return true;
  }

  // 调用 Telegram API 验证 token
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    if (data.ok) {
      sendJson(res, 200, { ok: true, botName: data.result.username });
    } else {
      sendJson(res, 400, { ok: false, error: data.description || "Invalid token" });
    }
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "Failed to verify token" });
  }
  return true;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
```

**Step 2: 创建 JSON body 读取和配置更新 helpers**

```typescript
// extensions/web-setup/src/helpers.ts
import type { IncomingMessage } from "node:http";
import fs from "node:fs";
import { resolveConfigPath } from "../../../src/config/paths.js";

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}
```

```typescript
// 在 config-bridge.ts 中添加 updateConfig
export async function updateConfig(mutator: (config: any) => any): Promise<void> {
  const configPath = resolveConfigPath();
  let config: any = {};
  try {
    const raw = await fs.promises.readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // 文件不存在或无法解析，用空对象
  }
  config = mutator(config);
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}
```

**Step 3: 注册 Telegram API 路由**

在 `api.ts` 中添加:

```typescript
import { handleTelegramSave, handleTelegramVerify } from "./telegram-setup.js";

// 在 registerApiRoutes 中添加:
api.registerHttpRoute({
  path: "/api/setup/telegram/save",
  handler: handleTelegramSave,
});

api.registerHttpRoute({
  path: "/api/setup/telegram/verify",
  handler: handleTelegramVerify,
});
```

**Step 4: 实现 Telegram UI**

在 `app.js` 的 `renderChannelStep()` 中实现完整的 Telegram 配置表单:

```javascript
function renderChannelStep() {
  app.innerHTML = `
    <div class="container">
      <h1>Nanobots Setup</h1>
      <p class="subtitle">Step 1: 连接消息平台</p>
      ${renderStepIndicator(1)}

      <div class="card">
        <h2>Telegram</h2>
        <div class="field">
          <label>Bot Token</label>
          <input type="text" id="tg-token" placeholder="123456:ABC-DEF..."
                 value="${state.telegram.botToken === "configured" ? "" : state.telegram.botToken}">
          <div class="hint">在 Telegram 中找 @BotFather 创建 Bot 获取 Token</div>
        </div>
        <div class="field">
          <label>Your User ID</label>
          <input type="text" id="tg-userid" placeholder="123456789"
                 value="${state.telegram.userId}">
          <div class="hint">向 @userinfobot 发消息即可获取你的 User ID</div>
        </div>
        <div id="tg-status"></div>
        <div class="actions">
          <button class="btn btn-secondary" id="tg-verify">验证连接</button>
          <button class="btn btn-primary" id="tg-save">保存</button>
        </div>
      </div>

      <div class="card">
        <h2>WhatsApp</h2>
        <div class="qr-area" id="wa-qr">
          <p>WhatsApp 连接功能将在后续版本中实现</p>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" id="next-step">下一步 →</button>
      </div>
    </div>
  `;

  // Event handlers
  document.getElementById("tg-verify").onclick = async () => {
    const token = document.getElementById("tg-token").value.trim();
    const statusEl = document.getElementById("tg-status");
    if (!token) {
      statusEl.innerHTML = '<span style="color:red">请输入 Bot Token</span>';
      return;
    }
    statusEl.innerHTML = "验证中...";
    const res = await fetch("/api/setup/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token }),
    });
    const data = await res.json();
    if (data.ok) {
      statusEl.innerHTML = `<span class="badge badge-success">✓ Bot: @${data.botName}</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:red">✗ ${data.error}</span>`;
    }
  };

  document.getElementById("tg-save").onclick = async () => {
    const token = document.getElementById("tg-token").value.trim();
    const userId = document.getElementById("tg-userid").value.trim();
    if (!token || !userId) {
      alert("请填写 Bot Token 和 User ID");
      return;
    }
    const res = await fetch("/api/setup/telegram/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token, userId }),
    });
    const data = await res.json();
    if (data.ok) {
      state.telegram = { botToken: "configured", userId };
      alert("Telegram 配置已保存");
    }
  };

  document.getElementById("next-step").onclick = () => {
    state.step = 2;
    render();
  };
}
```

**Step 5: 验证编译**

```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 6: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: Telegram bot token + user ID setup via web UI"
```

---

### Task 4: 实现 WhatsApp QR 码配置

**Files:**

- Create: `extensions/web-setup/src/whatsapp-setup.ts`
- Modify: `extensions/web-setup/src/api.ts`
- Modify: `extensions/web-setup/public/app.js`

**说明:** WhatsApp 使用 Baileys 库通过 QR 码登录。现有的 `src/web/login-qr.ts` 已有 QR 生成逻辑。Web Setup 需要：

1. 触发 WhatsApp 连接流程
2. 获取 QR 码图片 (或文本)
3. 前端轮询连接状态

**Step 1: 查看现有 WhatsApp QR 实现**

先读取 `src/web/login-qr.ts` 和 `src/web/login.ts`，理解现有的 QR 生成 API，然后封装为 HTTP 端点。

**Step 2: 创建 WhatsApp Setup API**

```typescript
// extensions/web-setup/src/whatsapp-setup.ts
// 具体实现取决于 src/web/login-qr.ts 的实际 API
// 基本思路：
// - POST /api/setup/whatsapp/start  → 启动 WhatsApp 连接，返回 session ID
// - GET  /api/setup/whatsapp/qr     → 获取当前 QR 码（base64 PNG 或文本）
// - GET  /api/setup/whatsapp/status → 获取连接状态（waiting/connected/error）
```

**Step 3: 注册路由并实现前端 QR 展示**

前端用 `<img>` 展示 QR 码 base64 图片，每 3 秒轮询状态，连接成功后显示成功提示。

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: WhatsApp QR code login via web setup"
```

---

### Task 5: 实现模型配置 API 和 UI

**Files:**

- Create: `extensions/web-setup/src/model-setup.ts`
- Modify: `extensions/web-setup/src/api.ts`
- Modify: `extensions/web-setup/public/app.js`
- Modify: `extensions/web-setup/src/config-bridge.ts`

**Step 1: 查看现有模型配置 schema**

先读取 `src/config/schema.ts` 中关于 `agents` 和 `models` 的 schema 定义，理解如何配置默认模型和 API Key。

关键路径：

- `src/config/types.ts` → agents 配置结构
- `src/providers/` → 支持的模型提供商列表
- `src/agents/auth-profiles/` → API Key 存储方式

**Step 2: 创建模型配置 API**

```typescript
// extensions/web-setup/src/model-setup.ts

// GET  /api/setup/models/providers → 返回支持的模型提供商列表
// POST /api/setup/models/save      → 保存默认模型 + API Key
// POST /api/setup/models/verify    → 测试 API Key 可用性

export async function handleModelProviders(req, res) {
  // 返回可用的模型提供商和模型列表
  const providers = [
    {
      id: "anthropic",
      name: "Anthropic (Claude)",
      models: ["claude-sonnet-4-5-20250929", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
    },
    { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"] },
    { id: "google", name: "Google (Gemini)", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  ];
  sendJson(res, 200, { providers });
}

export async function handleModelSave(req, res) {
  const body = await readJsonBody(req);
  const { provider, model, apiKey, authMethod } = body;

  await updateConfig((config) => {
    // 设置默认模型
    config.agents = config.agents || {};
    config.agents.default = config.agents.default || {};
    config.agents.default.model = model;

    // 设置 API Key（根据 auth-profiles 体系）
    // 具体实现需要参考 src/agents/auth-profiles/ 的存储方式
    return config;
  });

  // 如果有 API Key，保存到 auth-profiles
  if (apiKey) {
    await saveApiKey(provider, apiKey);
  }

  sendJson(res, 200, { ok: true });
}

export async function handleModelVerify(req, res) {
  const body = await readJsonBody(req);
  const { provider, model, apiKey } = body;

  // 使用 Pi 框架做一次简单的测试调用
  // 具体实现需要参考 Pi 的 API
  try {
    // 尝试发送一条简单消息验证连接
    sendJson(res, 200, { ok: true, message: "API key is valid" });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: String(err) });
  }
}
```

**Step 3: 实现模型选择 UI**

在 `app.js` 的 `renderModelStep()` 中：

- 下拉选择模型提供商
- 提供商变更后显示对应模型列表
- API Key 输入框
- 验证按钮
- Claude Max 用户可选择 setup-token 认证方式（无需 API Key）

**Step 4: 实现 Claude setup-token 认证选项**

查看 `src/providers/` 和 `src/agents/auth-profiles/` 理解 setup-token 认证的配置方式，在 UI 中提供 "使用 Claude Max 订阅" 选项。

**Step 5: 验证编译**

**Step 6: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: model selection and API key configuration via web UI"
```

---

### Task 6: 端口和启动流程调整

**Files:**

- Modify: `src/config/paths.ts` (默认端口改为 8080)
- Modify: `Dockerfile` (更新端口和启动命令)
- Modify: `docker-compose.yml` (如果有)

**Step 1: 调整默认端口**

nanobots 的 Gateway 默认端口是 18789，设计文档要求 Web 在 8080。两种方案：

- A) Gateway + Web 共用一个端口（推荐，简单）
- B) 两个端口分别服务

推荐方案 A：Gateway HTTP server 已经支持 plugin HTTP route，Web Setup 的静态文件和 API 直接挂在 Gateway 上。只需把默认端口改为 8080。

```typescript
// src/config/paths.ts
// 修改 DEFAULT_GATEWAY_PORT = 18789 → 8080
export const DEFAULT_GATEWAY_PORT = 8080;
```

**Step 2: 更新 Dockerfile**

```dockerfile
# 更新 CMD 添加 --bind lan (容器内需要外部访问)
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
EXPOSE 8080
```

**Step 3: 更新 docker-compose.yml**

```yaml
services:
  nanobots:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - nanobots-data:/root/.openclaw
      - nanobots-workspace:/app/workspace
    environment:
      - OPENCLAW_GATEWAY_TOKEN=changeme

volumes:
  nanobots-data:
  nanobots-workspace:
```

**Step 4: 验证本地启动**

```bash
# 尝试启动 gateway 确认端口变更生效
node --import tsx src/entry.ts gateway --port 8080 --allow-unconfigured 2>&1 | head -20
```

**Step 5: 提交**

```bash
git add src/config/paths.ts Dockerfile docker-compose.yml
git commit -m "feat: change default port to 8080, update Docker config"
```

---

### Task 7: 重命名内部引用 (openclaw → nanobots)

**Files:**

- Modify: `src/config/paths.ts` (环境变量名)
- Modify: 各处 OPENCLAW\_\* 环境变量引用
- Modify: `package.json` (scripts 中的 openclaw 引用)

**说明:** 这是一个渐进式任务。Phase 2 只做最必要的重命名：

1. 用户可见的名称（CLI help, 错误消息中的 "openclaw"）
2. 配置文件名 (`openclaw.json` → `nanobots.json`)
3. 状态目录 (`.openclaw` → `.nanobots`)

环境变量 `OPENCLAW_*` 暂时保留兼容，同时添加 `NANOBOTS_*` 别名。

**Step 1: 更新配置路径常量**

```typescript
// src/config/paths.ts
const NEW_STATE_DIRNAME = ".nanobots"; // 从 ".openclaw" 改为
const CONFIG_FILENAME = "nanobots.json"; // 从 "openclaw.json" 改为
```

**Step 2: 添加环境变量别名**

在 `resolveStateDir` 等函数中添加 `NANOBOTS_STATE_DIR` 作为优先别名：

```typescript
export function resolveStateDir(...) {
  const override = env.NANOBOTS_STATE_DIR?.trim()
    || env.OPENCLAW_STATE_DIR?.trim()
    || env.CLAWDBOT_STATE_DIR?.trim();
  ...
}
```

**Step 3: 更新 package.json 中的 description 和 bin**

```json
{
  "description": "Personal AI assistant via WhatsApp + Telegram",
  "bin": {
    "nanobots": "openclaw.mjs"
  }
}
```

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add -A
git commit -m "feat: rename config paths and env vars to nanobots (with openclaw compat)"
```

---

### Task 8: Web Setup 集成测试

**Files:**

- Create: `extensions/web-setup/src/__tests__/api.test.ts`
- Create: `extensions/web-setup/src/__tests__/config-bridge.test.ts`

**Step 1: 测试 config-bridge**

```typescript
import { describe, it, expect } from "vitest";
import { getSetupStatus, updateConfig } from "../config-bridge.js";

describe("config-bridge", () => {
  it("returns unconfigured status for empty config", () => {
    const status = getSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.currentStep).toBe(0);
  });

  it("updateConfig creates config file if missing", async () => {
    await updateConfig((config) => {
      config.test = true;
      return config;
    });
    // 验证文件已创建
  });
});
```

**Step 2: 测试 Telegram API**

```typescript
// 使用 vitest mock fetch，测试 handleTelegramVerify
```

**Step 3: 运行测试**

```bash
npx vitest run extensions/web-setup/
```

**Step 4: 提交**

```bash
git add extensions/web-setup/src/__tests__/
git commit -m "test: add web setup API and config bridge tests"
```

---

## Phase 3: OAuth 服务集成

### Task 9: OAuth 基础架构

**Files:**

- Create: `extensions/web-setup/src/oauth/core.ts`
- Create: `extensions/web-setup/src/oauth/store.ts`
- Modify: `extensions/web-setup/src/api.ts`

**Step 1: 创建 OAuth token 存储**

```typescript
// extensions/web-setup/src/oauth/store.ts
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../../../src/config/paths.js";

const OAUTH_DIR = path.join(resolveStateDir(), "oauth_tokens");

export type OAuthToken = {
  provider: string; // "google", "github", etc.
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  scopes: string[];
};

export async function saveToken(provider: string, token: OAuthToken): Promise<void> {
  await fs.promises.mkdir(OAUTH_DIR, { recursive: true });
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(token, null, 2));
}

export async function loadToken(provider: string): Promise<OAuthToken | null> {
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteToken(provider: string): Promise<void> {
  const filePath = path.join(OAUTH_DIR, `${provider}.json`);
  try {
    await fs.promises.unlink(filePath);
  } catch {}
}

export async function refreshTokenIfNeeded(
  provider: string,
  refreshFn: (token: OAuthToken) => Promise<OAuthToken>,
): Promise<OAuthToken | null> {
  const token = await loadToken(provider);
  if (!token) return null;
  if (Date.now() < token.expiresAt - 60000) return token; // 提前 1 分钟刷新
  const newToken = await refreshFn(token);
  await saveToken(provider, newToken);
  return newToken;
}
```

**Step 2: 创建 OAuth 核心流程**

```typescript
// extensions/web-setup/src/oauth/core.ts

export type OAuthProviderConfig = {
  id: string; // "google"
  name: string; // "Google"
  authUrl: string; // "https://accounts.google.com/o/oauth2/v2/auth"
  tokenUrl: string; // "https://oauth2.googleapis.com/token"
  scopes: string[]; // ["calendar", "gmail.readonly"]
  clientId: string; // 从环境变量或配置读取
  clientSecret: string; // 从环境变量或配置读取
};

export function buildAuthorizationUrl(
  provider: OAuthProviderConfig,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${provider.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}
```

**Step 3: 注册 OAuth API 路由**

```typescript
// 在 api.ts 中添加:
// GET  /api/oauth/providers      → 列出可用的 OAuth 服务
// GET  /api/oauth/start/:provider → 重定向到 OAuth 授权页
// GET  /api/oauth/callback       → OAuth 回调，存储 token
// GET  /api/oauth/status         → 各服务的授权状态
// DELETE /api/oauth/:provider    → 撤销授权
```

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add extensions/web-setup/src/oauth/
git commit -m "feat: OAuth token storage and authorization flow core"
```

---

### Task 10: Google Services Plugin

**Files:**

- Create: `extensions/google-services/openclaw.plugin.json`
- Create: `extensions/google-services/index.ts`
- Create: `extensions/google-services/src/calendar.ts`
- Create: `extensions/google-services/src/gmail.ts`

**Step 1: 创建 Google Services 插件**

这个插件通过 Plugin API 的 `registerTool` 注册 Google Calendar 和 Gmail 工具。工具使用 `extensions/web-setup/src/oauth/store.ts` 中存储的用户 OAuth token。

```typescript
// extensions/google-services/index.ts
import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { createCalendarTools } from "./src/calendar.js";
import { createGmailTools } from "./src/gmail.js";

export default {
  id: "google-services",
  register(api: OpenClawPluginApi) {
    api.registerTool(createCalendarTools());
    api.registerTool(createGmailTools());
  },
};
```

**Step 2: 实现 Calendar 工具**

```typescript
// extensions/google-services/src/calendar.ts
// Agent 可用的工具:
// - google_calendar_list_events: 列出日历事件
// - google_calendar_create_event: 创建日历事件
// - google_calendar_update_event: 更新日历事件
// - google_calendar_delete_event: 删除日历事件
```

**Step 3: 实现 Gmail 工具**

```typescript
// extensions/google-services/src/gmail.ts
// Agent 可用的工具:
// - google_gmail_search: 搜索邮件
// - google_gmail_read: 读取邮件内容
// - google_gmail_send: 发送邮件
// - google_gmail_reply: 回复邮件
```

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add extensions/google-services/
git commit -m "feat: Google Calendar + Gmail tools as plugin"
```

---

### Task 11: OAuth Web UI

**Files:**

- Modify: `extensions/web-setup/public/app.js`
- Modify: `extensions/web-setup/public/style.css`

**Step 1: 添加 OAuth 管理页面**

在 Setup Wizard 的 Step 3（可选，后续也可配）中展示已连接的服务和连接按钮。

同时提供 `/web/settings` 路径，让用户在设置完成后随时管理 OAuth 连接。

**Step 2: 实现服务连接/断开 UI**

- 每个服务显示为卡片
- 未连接：显示 "连接" 按钮 → 点击后跳转 OAuth 授权
- 已连接：显示 "已连接" 状态 + "断开" 按钮
- OAuth 回调后自动回到管理页面

**Step 3: 提交**

```bash
git add extensions/web-setup/
git commit -m "feat: OAuth service management web UI"
```

---

## Phase 4: 打磨

### Task 12: 清理不需要的 Scripts 和配置引用

**Files:**

- Modify: `package.json` (删除不需要的 scripts)
- Delete: 不需要的 scripts 目录中的文件
- Delete: 不需要的 vitest config 文件

**Step 1: 清理 package.json scripts**

删除以下 scripts：

- `android:*` (已删 apps/)
- `ios:*` (已删 apps/)
- `mac:*` (已删 apps/)
- `canvas:*` (已删 canvas)
- `tui:*` (已删 TUI)
- `ui:*` (已删 Control UI)
- `format:swift` (已删 Swift)
- `lint:swift` (已删 Swift)
- `protocol:*` (不需要)
- `docs:*` (暂时不需要)
- `openclaw` → 改为 `nanobots`
- `openclaw:rpc` → 改为 `nanobots:rpc`
- `moltbot:rpc` (删除)

**Step 2: 删除不需要的 vitest 配置**

```bash
# 可能需要删除：
rm -f vitest.e2e.config.ts vitest.extensions.config.ts vitest.gateway.config.ts vitest.live.config.ts vitest.unit.config.ts
# 只保留 vitest.config.ts
```

**Step 3: 删除无用的 scripts/ 文件**

检查 `scripts/` 目录，删除与已删模块相关的脚本（如 bundle-a2ui.sh, canvas-a2ui-copy.ts, package-mac-app.sh 等）。

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add -A
git commit -m "chore: clean up scripts, vitest configs, and dead references"
```

---

### Task 13: 清理 package.json 依赖

**Files:**

- Modify: `package.json`

**Step 1: 删除不需要的 dependencies**

检查并移除与已删模块相关的依赖：

- `@buape/carbon` (Discord)
- `@grammyjs/runner`, `@grammyjs/transformer-throttler` → 检查 Telegram 是否使用
- `@homebridge/ciao` (Bonjour 发现，可能不需要)
- `@larksuiteoapi/node-sdk` (飞书)
- `@line/bot-sdk` (Line)
- `@lydell/node-pty` (PTY，TUI 相关)
- `@slack/bolt`, `@slack/web-api` (Slack)
- `discord-api-types` (Discord)
- `signal-utils` (Signal)

**Step 2: 删除不需要的 devDependencies**

- `@lit-labs/signals`, `@lit/context`, `lit` (Control UI)
- `rolldown` (如果只用于 UI build)
- `oxfmt`, `oxlint`, `oxlint-tsgolint` → 看是否保留 lint
- `@typescript/native-preview` (实验性的)

**Step 3: 重新安装**

```bash
pnpm install
```

**Step 4: 验证编译**

**Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove unused dependencies"
```

---

### Task 14: 精选 Skills

**Files:**

- Modify: `skills/` 目录

**Step 1: 审查现有 Skills**

查看 `skills/` 目录下所有 Skill，根据目标用户（小白用户个人助手）保留实用的 Skills：

**推荐保留：**

- 日常助手类（翻译、总结、日程管理等）
- 工具使用类（搜索、浏览器等）
- 编程辅助类（如果用户需要）

**推荐删除：**

- 与 openclaw 平台特定的 Skill
- 过于专业化的 Skill

**Step 2: 创建 nanobots 专属 Skill**

可以创建一些面向小白用户的 Skill，如：

- 每日新闻摘要
- 定时提醒
- 文件管理助手

**Step 3: 提交**

```bash
git add skills/
git commit -m "chore: curate skills for personal assistant use case"
```

---

### Task 15: Dockerfile 优化

**Files:**

- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

**Step 1: 优化 Dockerfile**

```dockerfile
FROM node:22-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/openclaw.mjs ./

# 创建数据目录
RUN mkdir -p /root/.nanobots /app/workspace && \
    chown -R node:node /app /root/.nanobots

USER node
EXPOSE 8080

ENV NODE_ENV=production
ENV NANOBOTS_STATE_DIR=/root/.nanobots

CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--bind", "lan"]
```

**Step 2: 完善 docker-compose.yml**

```yaml
services:
  nanobots:
    build: .
    container_name: nanobots
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - nanobots-data:/root/.nanobots
      - nanobots-workspace:/app/workspace
    environment:
      - NANOBOTS_GATEWAY_TOKEN=${NANOBOTS_TOKEN:-changeme}

volumes:
  nanobots-data:
  nanobots-workspace:
```

**Step 3: 构建并测试 Docker 镜像**

```bash
docker compose build
docker compose up -d
# 访问 http://localhost:8080 验证 Web Setup
```

**Step 4: 提交**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: optimize Docker build with multi-stage, add docker-compose"
```

---

### Task 16: 更新文档

**Files:**

- Modify: `README.md`
- Create: `CLAUDE.md` (nanobots 专用)

**Step 1: 编写 README.md**

包含：

- 项目介绍（一句话）
- 快速开始（docker compose up）
- 功能列表
- 配置说明
- 常见问题

**Step 2: 更新 CLAUDE.md**

为 Claude Code / Agent 提供项目上下文，描述 nanobots 的架构和开发约定。

**Step 3: 提交**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for nanobots"
```

---

## 执行注意事项

1. **Phase 2 (Task 1-8)** 是核心工作量，建议按顺序执行。每个 Task 完成后验证编译。

2. **Phase 3 (Task 9-11)** 的 OAuth 需要实际的 Google OAuth 应用才能端到端测试。开发阶段可以先 mock。

3. **Phase 4 (Task 12-16)** 相对独立，可以并行执行。

4. **关键依赖关系：**
   - Task 1 → Task 2-8（所有 Web Setup 功能依赖骨架）
   - Task 2 → Task 3, 4, 5（UI 框架依赖路由和状态 API）
   - Task 9 → Task 10, 11（Google Services 依赖 OAuth 核心）
   - Task 12, 13 可以在任何时候执行

5. **实现时的关键文件参考：**
   - Plugin 注册: `src/plugins/registry.ts`, `src/plugins/types.ts`
   - HTTP 路由: `src/gateway/server/plugins-http.ts`
   - 配置读写: `src/config/io.ts`, `src/config/paths.ts`
   - 配置 Schema: `src/config/schema.ts`
   - Auth Profiles: `src/agents/auth-profiles/`
   - WhatsApp QR: `src/web/login-qr.ts`, `src/web/login.ts`
   - Telegram: `extensions/telegram/src/channel.ts`
