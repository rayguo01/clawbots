# X Cookie Extension 设计文档

**日期**: 2026-02-13
**目标**: 用 Cookie 认证替代 OAuth，统一 X (Twitter) 的发推和读推功能

## 背景

现有 X/Twitter 集成分散在两处：

- `extensions/twitter/` — OAuth 2.0 官方 API v2，只能发推文（需要开发者账号）
- `skills/baoyu-danger-x-to-markdown/` — Cookie + 逆向 GraphQL API，只能读推文

问题：

1. OAuth 需要 Twitter 开发者账号，对普通用户门槛太高
2. 两套认证体系不统一
3. 功能分散，用户体验割裂

## 方案

创建 `extensions/x-cookie/` 统一使用 Cookie 认证（auth_token + ct0），通过逆向 GraphQL API 同时支持读和写。

## 文件结构

```
extensions/x-cookie/
├── index.ts              # Plugin 入口
├── package.json
└── src/
    ├── cookies.ts         # Cookie 读取（env → file）
    ├── constants.ts       # Bearer token、User-Agent、GraphQL fallback IDs
    ├── http.ts            # 请求头构建、GraphQL query ID 解析
    ├── types.ts           # 类型定义
    ├── post.ts            # 发推文 / 发推文串
    ├── read.ts            # 获取推文详情、用户推文、时间线
    ├── search.ts          # 搜索推文
    └── tools.ts           # 6 个工具定义
```

## 工具列表

| 工具名              | 说明         | 输入             | 输出                   |
| ------------------- | ------------ | ---------------- | ---------------------- |
| `x_post_tweet`      | 发单条推文   | text (≤280)      | {tweet_id, text, url}  |
| `x_post_thread`     | 发推文串     | tweets[]         | {thread[], count, url} |
| `x_get_tweet`       | 获取推文详情 | tweet_id 或 url  | 作者、内容、互动数据   |
| `x_get_user_tweets` | 获取用户推文 | username, count? | 推文列表               |
| `x_get_timeline`    | 获取时间线   | count?           | 推文列表               |
| `x_search`          | 搜索推文     | query, count?    | 推文列表               |

## Cookie 认证

复用现有 `x-cookies-setup.ts` 的存储路径：

1. 环境变量 `X_AUTH_TOKEN` + `X_CT0`（优先）
2. 文件 `~/.local/share/baoyu-skills/x-to-markdown/cookies.json`

请求头：

- `cookie: auth_token=xxx; ct0=xxx`
- `x-csrf-token: <ct0>`
- `authorization: Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAA...`（X 内置 bearer token）

## GraphQL API

从 baoyu skill 移植核心 GraphQL 逻辑：

- 动态解析 x.com 页面获取 queryId 和 featureSwitches
- 内置 fallback 值确保稳定性
- 发推文使用 `CreateTweet` mutation
- 读推文使用 `TweetResultByRestId` / `TweetDetail` query
- 用户推文使用 `UserTweets` query
- 时间线使用 `HomeTimeline` query
- 搜索使用 adaptive search API

## Skill

创建 `skills/x-assistant/SKILL.md`：

- type: service-dep
- requiredServices: [x-cookies]
- 提供 prompt 引导：发推风格、浏览摘要、交互方式

## 清理

| 操作 | 目标                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 删除 | `extensions/twitter/`                                                                   |
| 删除 | `skills/baoyu-danger-x-to-markdown/`                                                    |
| 新增 | `extensions/x-cookie/`                                                                  |
| 新增 | `skills/x-assistant/`                                                                   |
| 更新 | `skills/shipcast/SKILL.md` — twitter*\* → x*\*                                          |
| 更新 | `Dockerfile` — twitter → x-cookie                                                       |
| 更新 | `src/plugins/config-state.ts` — BUNDLED_ENABLED_BY_DEFAULT                              |
| 更新 | WebUI `app.js` SERVICES_META — 移除 twitter OAuth，更新 x-cookies 描述                  |
| 保留 | `extensions/web-setup/src/x-cookies-setup.ts`                                           |
| 保留 | `extensions/web-setup/src/oauth/providers.ts` 中的 twitter provider（暂不删除，不影响） |
