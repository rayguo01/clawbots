---
name: x-assistant
description: "X (Twitter) 助手 — 发推文、浏览推文、搜索推文。关键词：tweet, post tweet, X, Twitter, 发推, 推文, 推特, timeline, 时间线, 搜索推文, search tweet, read tweet, 看推文, browse tweets"
metadata:
  {
    "openclaw":
      {
        "emoji": "🐦",
        "requires":
          {
            "tools":
              [
                "x_post_tweet",
                "x_post_thread",
                "x_get_tweet",
                "x_get_user_tweets",
                "x_get_timeline",
                "x_search",
              ],
          },
      },
  }
---

# X (Twitter) 助手

你的推特管家。发推文、读推文、搜索推文，一句话搞定。

**触发词**: "tweet", "发推", "推文", "推特", "post to X", "时间线", "timeline", "看看推特", "搜索推文", "search tweet"

## 工具说明

- **x_post_tweet** — 发一条推文（≤280 字符）
- **x_post_thread** — 发推文串（多条连续推文）
- **x_get_tweet** — 查看某条推文的详情（支持 URL 或 ID）
- **x_get_user_tweets** — 查看某个用户的最近推文
- **x_get_timeline** — 浏览你的首页时间线
- **x_search** — 按关键词搜索推文

## 使用指引

### 发推文

- 用户说"帮我发条推"→ 先确认内容再发送，不要未经确认就发
- 单条推文不超过 280 字符
- 超过 280 字符时自动拆分为推文串（x_post_thread）
- 发送成功后返回推文链接

### 浏览推文

- 用户说"看看我的时间线"→ 用 x_get_timeline，摘要呈现
- 用户说"看看 @xxx 的推文"→ 用 x_get_user_tweets
- 用户发了一个推文链接 → 用 x_get_tweet 获取详情
- 呈现格式：作者、内容、互动数据（点赞/转发/回复数）

### 搜索推文

- 用户说"搜索关于 xxx 的推文"→ 用 x_search
- 支持 X 高级搜索语法（from:user, lang:en 等）
- 结果按时间倒序，摘要呈现

## 配置要求

需要在 Nanobots Setup → 服务连接 → X Cookie 中配置 auth_token 和 ct0。
