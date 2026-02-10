# Shipcast Skill 功能说明书

> 状态：草案 | 日期：2026-02-10

## 一、产品定位

**一句话**：代码推了就自动发推 — 填平「写代码」和「告诉别人你写了代码」之间的鸿沟。

**目标用户**：独立开发者、一人公司、小团队 — 有大量 commit 但从不宣传的人。

**核心洞察**：Vibe coding 项目太多，vibe marketing 远远不够。保持社交媒体存在感对产品成长至关重要，但手动维护太耗精力。

## 二、核心流程

```
GitHub Push → Commits 聚合 → AI 改写 → 定时发布 → 社交媒体
```

**唯一输入**：Push 代码
**自动输出**：社交媒体推文

### 用户设置流程（一次性）

| 步骤 | 操作        | 说明                     |
| ---- | ----------- | ------------------------ |
| 1    | GitHub 登录 | 绑定目标 repo            |
| 2    | 连接 X 账号 | 授权发推权限             |
| 3    | 设置偏好    | 语言、语气风格、发布时间 |
| 4    | 完成        | 之后不需要任何手动操作   |

### 自动执行流程

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│ GitHub Push  │────▶│ Commit 聚合   │────▶│ AI 改写生成   │────▶│ 队列等待    │
└─────────────┘     │ & 过滤       │     │ 推文草稿      │     │ 定时发布    │
                    └──────────────┘     └──────────────┘     └────────────┘
```

## 三、功能模块

### 3.1 GitHub 集成

**功能**：监听 repo 的 push 事件，获取 commit 信息。

| 项目     | 说明                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 认证方式 | GitHub OAuth（复用 nanobots OAuth 框架，多租户就绪）                                      |
| 触发方式 | MVP: Cron 定时轮询 GitHub REST API；后期: Webhook                                         |
| API      | `GET /repos/{owner}/{repo}/commits` + `GET /repos/{owner}/{repo}/compare/{base}...{head}` |
| 数据提取 | commit message, 变更文件列表, diff 统计, author, timestamp                                |
| 多 repo  | 支持绑定多个 repo，分别生成推文                                                           |

**为什么用 OAuth 而不是 `gh` CLI**：

- `gh` CLI 需要在服务器安装二进制 + `gh auth login`，只适合单用户自部署
- Nanobots 目标是多租户开放服务，每个用户需独立授权自己的 GitHub
- OAuth 与现有框架一致（Google、Todoist、Notion、Spotify 均如此）
- GitHub OAuth scope: `repo`（读取私有 repo）或 `public_repo`（仅公开 repo）

**Commit 过滤规则**：

- 过滤掉 merge commit（`Merge branch ...`、`Merge pull request ...`）
- 过滤掉纯格式化/lint 修复（`fix lint`、`format code`）
- 过滤掉 bump version / dependency update（可配置是否保留）
- 保留有实际功能改动的 commit

**Commit 聚合策略**：

- 按时间窗口聚合（默认：上次发布以来的所有 commit）
- 智能分组：相关 commit 归为同一主题（如多个 commit 都是关于 "添加暗黑模式"）
- 优先级排序：新功能 > Bug 修复 > 重构 > 文档 > 其他

### 3.2 AI 改写引擎

**功能**：把枯燥的 commit message 改写成用户看得懂的社交媒体推文。

**输入**：

- 聚合后的 commit 列表（message + diff 摘要）
- 用户设置（语言、语气、项目描述）

**输出**：

- 一条主推文（≤280 字符，适配 X 限制）
- [Pro] Changelog thread（主推文 + 详细更新日志串成 thread）

**改写原则**：
| 原则 | 说明 |
|------|------|
| 用户视角 | 说「你现在可以 XXX」而非「实现了 XXX 功能」 |
| 具体有价值 | 说「暗黑模式上线」而非「更新了样式」 |
| 简洁有力 | 避免「我们很高兴地宣布」等套话 |
| 适度 emoji | 让推文视觉上有节奏，但不过度 |

**改写示例**：

```
# 原始 commits:
- fix: dark mode toggle not persisting
- feat: add dark mode support for all pages
- style: update color tokens for dark theme

# AI 改写后:
🌙 Dark mode is here!

Toggle it on — it remembers your preference across sessions.
Every page, every component, fully themed.

Ship it. #buildinpublic
```

**语言支持**：

- 中文、英文、日文（MVP）
- 根据用户设置自动切换
- 也支持双语发布（一条中文一条英文）

**语气风格选项**：
| 风格 | 描述 | 适用场景 |
|------|------|----------|
| Casual | 轻松随意，像跟朋友聊天 | 个人项目、side project |
| Professional | 正式但不死板 | SaaS 产品、To-B |
| Hype | 热情激昂，带 emoji 和话题标签 | 发布重大功能 |
| Minimal | 简洁克制，纯信息 | 技术向受众 |
| Custom | [Pro] 用户自定义 prompt | 完全定制 |

### 3.3 X/Twitter OAuth 集成

**功能**：直连 X API 发推，不依赖第三方中间服务。

**架构**：与 Google/Todoist/Spotify 同一模式 — nanobots 自己申请 Twitter Developer App，用户在 Web Setup 点一下授权即可。

**OAuth 配置**（新增到 `providers.ts`）：

```typescript
export function getTwitterProvider(): OAuthProviderConfig {
  return {
    id: "twitter",
    name: "X (Twitter)",
    // X 用 OAuth 2.0 with PKCE
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientId: envOrEmpty("NANOBOTS_TWITTER_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_TWITTER_CLIENT_SECRET"),
    extraAuthParams: { code_challenge_method: "S256" }, // PKCE
    envHint: {
      clientId: "NANOBOTS_TWITTER_CLIENT_ID",
      clientSecret: "NANOBOTS_TWITTER_CLIENT_SECRET",
    },
  };
}
```

**X API 发推**：

```
POST https://api.twitter.com/2/tweets
Authorization: Bearer {access_token}
Body: { "text": "推文内容" }
```

**Thread 发布**（Pro）：

```
POST /2/tweets  → { "text": "1/3 ..." }             → 拿到 tweet_id
POST /2/tweets  → { "text": "2/3 ...", "reply": { "in_reply_to_tweet_id": tweet_id } }
POST /2/tweets  → { "text": "3/3 ...", "reply": { "in_reply_to_tweet_id": tweet_id_2 } }
```

**配图上传**：

```
POST https://upload.twitter.com/1.1/media/upload.json  → 拿到 media_id
POST /2/tweets → { "text": "...", "media": { "media_ids": [media_id] } }
```

**运维注意**：

- X Free tier API: 发推 1,500 条/月（50/天），读取 10,000/月
- 需申请 Twitter Developer App（Free tier 即可）
- OAuth 2.0 with PKCE — nanobots OAuth 框架可能需要小改以支持 PKCE

### 3.4 GitHub OAuth 集成

**功能**：读取用户 repo 的 commit 历史，不依赖 `gh` CLI。

**OAuth 配置**（新增到 `providers.ts`）：

```typescript
export function getGitHubProvider(): OAuthProviderConfig {
  return {
    id: "github",
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo"], // 或 "public_repo" 仅公开
    clientId: envOrEmpty("NANOBOTS_GITHUB_CLIENT_ID"),
    clientSecret: envOrEmpty("NANOBOTS_GITHUB_CLIENT_SECRET"),
    extraAuthParams: {},
    envHint: {
      clientId: "NANOBOTS_GITHUB_CLIENT_ID",
      clientSecret: "NANOBOTS_GITHUB_CLIENT_SECRET",
    },
  };
}
```

**Commit 获取 API**：

```
GET https://api.github.com/repos/{owner}/{repo}/commits?since={last_published_at}
Authorization: Bearer {access_token}
```

**Repo 列表**（让用户选择绑定哪个 repo）：

```
GET https://api.github.com/user/repos?sort=pushed&per_page=20
```

### 3.5 定时发布

**功能**：按设定时间自动发布推文到社交平台。

| 项目     | 说明                                             |
| -------- | ------------------------------------------------ |
| 发布频率 | 每天 1 次（默认）/ 每次 push 立即发 / 自定义频率 |
| 发布时间 | 用户设定，支持时区                               |
| 推文队列 | 多条待发推文按 FIFO 排队                         |
| 手动审核 | 可选：发布前推送给用户确认 / 全自动              |

**推荐发布时间**（基于一般社交媒体活跃度）：

- 英文受众：UTC 14:00-16:00（北美早间）
- 中文受众：UTC+8 12:00-13:00 或 20:00-21:00
- 日文受众：UTC+9 12:00-13:00 或 19:00-20:00

### 3.6 [Pro] AI 配图

**功能**：为推文自动生成视觉配图，提高传播力。

**配图类型**：
| 类型 | 说明 |
|------|------|
| Feature Card | 功能更新卡片（功能名 + 一句话描述 + 项目 Logo） |
| Changelog Card | 更新日志卡片（多条更新项 + 版本号） |
| Code Diff | 代码对比图（Before/After） |
| Screenshot | [未来] 自动截取产品界面 |

**技术实现**：可复用 nano-banana-pro（Gemini 图片生成）生成配图。

### 3.7 [Pro] Changelog Thread

**功能**：主推文 + 详细更新串成 X thread。

```
# Thread 结构:
[1/3] 🚀 v2.1 just dropped — Dark mode, faster search, and 12 bug fixes.
[2/3] What's new:
      • 🌙 Dark mode across all pages
      • 🔍 Search now 3x faster with new index
      • 📱 Mobile nav redesign
[3/3] Bug fixes:
      • Fixed login redirect loop
      • Fixed CSV export encoding
      • ...and 10 more

      Full changelog: [link]
```

### 3.8 [未来] 多渠道发布

| 渠道         | 优先级   | 说明                      |
| ------------ | -------- | ------------------------- |
| X (Twitter)  | P0 - MVP | 首发渠道                  |
| 小红书       | P1       | 中文开发者社区            |
| LinkedIn     | P2       | To-B 产品推广             |
| 邮件订阅     | P2       | 用户收件箱直达            |
| DM 自动回复  | P3       | AI Agent 响应用户私信咨询 |
| KOL 广告发布 | P3       | 联系 KOL 代发推广         |

### 3.9 [未来] DM 自动回复

**功能**：基于产品文档 + 更新记录，用 AI Agent 自动响应社交媒体私信咨询。

- 7x24 在线的智能客服
- 知识库来源：GitHub README、Changelog、用户文档
- 能回答：功能咨询、价格、使用方法、已知问题
- 不能回答的：转交人工 / 标记待处理

## 四、数据模型

### 4.1 Repo 配置

```yaml
repo:
  owner: "username"
  name: "my-project"
  branch: "main" # 监听的分支
  description: "一句话描述项目" # 用于 AI 改写上下文

publish:
  platform: "x" # 发布平台
  language: "en" # 推文语言
  tone: "casual" # 语气风格
  schedule: "0 14 * * *" # Cron 表达式 (每天 UTC 14:00)
  timezone: "Asia/Singapore"
  auto_publish: true # false = 发布前人工确认

filters:
  skip_merge: true
  skip_deps: true
  skip_patterns: # 自定义跳过模式
    - "^chore:"
    - "^ci:"

pro:
  ai_image: false
  changelog_thread: false
  custom_prompt: ""
  remove_watermark: false
```

### 4.2 推文队列

```yaml
# knowledge/shipcast/{repo}/queue/
- id: "2026-02-10-001"
  repo: "username/my-project"
  commits: # 聚合的 commit 列表
    - sha: "abc1234"
      message: "feat: add dark mode"
      files_changed: 12
      additions: 340
      deletions: 45
  generated_tweet: "..." # AI 生成的推文
  generated_image: null # Pro: 配图路径
  thread: null # Pro: thread 内容
  status: "pending" # pending → approved → published → failed
  scheduled_at: "2026-02-10T14:00:00Z"
  published_at: null
```

### 4.3 发布历史

```yaml
# knowledge/shipcast/{repo}/history/
- id: "2026-02-09-001"
  tweet_url: "https://x.com/user/status/123456"
  commits_covered: ["sha1", "sha2", "sha3"]
  published_at: "2026-02-09T14:00:00Z"
  engagement: null # 未来：自动抓取互动数据
```

## 五、与 Nanobots 现有能力的映射

| Shipcast 需求      | Nanobots 现有能力                              | 差距                                                     |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| GitHub commit 获取 | OAuth 框架 (`extensions/web-setup/src/oauth/`) | 需新增：GitHub OAuth provider + commit 获取工具          |
| X 发推             | OAuth 框架（同上）                             | 需新增：Twitter OAuth provider（含 PKCE 支持）+ 发推工具 |
| 定时执行           | `src/cron/service.ts` (内置)                   | 已满足：支持 cron 表达式 + 时区                          |
| AI 改写            | Agent 核心能力 (LLM)                           | 已满足：prompt-driven 即可                               |
| AI 配图            | `skills/nano-banana-pro/` (Gemini)             | 已满足：可直接调用                                       |
| 推文队列/历史      | `knowledge/` 知识库                            | 已满足：文件存储 + memory_search                         |
| 小红书发布         | 无                                             | 需新增                                                   |
| 邮件推送           | Gmail (extensions/google-services/)            | 可复用：但需模板化                                       |
| DM 自动回复        | 无                                             | 需新增                                                   |

## 六、实现路径建议

### Phase 1 — MVP（双 OAuth + Cron 轮询 + 自动发推）

- 新增 GitHub OAuth provider（`providers.ts`）
- 新增 Twitter/X OAuth provider（`providers.ts`，含 PKCE 支持）
- 新增 `extensions/shipcast/`：GitHub commit 获取工具 + X 发推工具
- 用户通过 Web Setup 一键授权 GitHub 和 X 账号
- Cron 定时任务每天执行：拉 commit → AI 改写 → 发推
- 可选人工审核（发布前推送给用户确认）

**用户体验**：Web Setup 点两下授权 → 设个时间 → 不用管了
**工作量**：2 个 OAuth provider + 1 个 extension（含工具）+ SKILL.md

### Phase 2 — Pro 功能

- AI 配图（复用 nano-banana-pro）
- Changelog thread（连续发推 API）
- 自定义 AI prompt
- GitHub Webhook 实时监听 push（替代 Cron 轮询）

### Phase 3 — 多渠道

- 小红书、LinkedIn 等渠道 OAuth 集成
- 邮件订阅推送

### Phase 4 — 平台化

- 多用户/多租户管理界面
- DM 自动回复 AI Agent
- KOL 广告发布
- 互动数据追踪

## 七、开放问题

| #   | 问题                                 | 影响         | 建议                                                   |
| --- | ------------------------------------ | ------------ | ------------------------------------------------------ |
| 1   | ~~X 发布走 Postiz 还是直接 OAuth？~~ | ~~架构选择~~ | **已决定**：X OAuth 直连，不依赖 Postiz                |
| 2   | Commit 获取用 Webhook 还是轮询？     | MVP 复杂度   | MVP 先 Cron + GitHub REST API 轮询，Phase 2 加 Webhook |
| 3   | 推文审核流程？全自动 vs 人工确认     | 用户信任     | 默认人工确认，可切全自动                               |
| 4   | 多 repo 如何组织？                   | 数据模型     | knowledge/shipcast/{owner}-{repo}/                     |
| 5   | 免费/Pro 功能边界？                  | 商业模型     | MVP 先全免费，验证需求后加 Pro                         |
| 6   | 推文失败重试策略？                   | 可靠性       | 最多 3 次，失败通知用户                                |
| 7   | Commit 信息不够描述功能怎么办？      | 改写质量     | 结合 diff 统计 + 变更文件推断功能                      |
