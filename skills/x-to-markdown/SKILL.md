---
name: x-to-markdown
description: "Converts X (Twitter) tweets, threads, and articles to markdown files with YAML front matter. Use when user provides x.com/twitter.com URLs (including /i/article/ URLs), or mentions: save tweet, tweet to markdown, X to markdown, 保存推文, 推文转Markdown, 保存文章."
metadata:
  { "openclaw": { "emoji": "📝", "requires": { "tools": ["x_get_tweet", "x_get_article"] } } }
---

# X to Markdown

将 X 推文/线程/长文 (Article) 转为 Markdown 文件，带 YAML front matter。

**触发词**: "x to markdown", "tweet to markdown", "save tweet", "保存推文", "推文转markdown", "保存文章", 或用户直接发送 x.com/twitter.com 链接要求保存。

## 依赖

- `x_get_tweet` 工具（获取推文）
- `x_get_article` 工具（获取 X Article 长文）
- X Cookie 已配置

## 工作流程

### 1. 解析 URL 并选择工具

根据 URL 格式决定使用哪个工具：

- `https://x.com/<user>/status/<id>` → 推文，用 `x_get_tweet`
- `https://twitter.com/<user>/status/<id>` → 推文，用 `x_get_tweet`
- `https://x.com/i/article/<id>` → Article 长文，用 `x_get_article`
- 纯数字默认视为推文 ID，用 `x_get_tweet`

### 2a. 获取推文（普通推文/线程）

调用 `x_get_tweet` 获取推文数据，返回结构包含：

```
tweet_id, author, username, text, created_at,
reply_count, retweet_count, like_count, quote_count, bookmark_count,
url, replies[]
```

### 2b. 获取 Article（长文）

调用 `x_get_article` 获取文章数据，返回结构包含：

```
article_id, title, text, cover_image, url, author, username, created_at
```

### 3. 生成 Markdown

#### 单条推文

```markdown
---
url: https://x.com/{username}/status/{tweet_id}
author: "{author}"
username: "{username}"
created_at: "{created_at}"
likes: { like_count }
retweets: { retweet_count }
---

{text}
```

#### 线程（同一用户的连续推文）

如果 replies 中包含同一 username 的推文，视为线程：

```markdown
---
url: https://x.com/{username}/status/{tweet_id}
author: "{author}"
username: "{username}"
created_at: "{created_at}"
tweet_count: { n }
likes: { like_count }
retweets: { retweet_count }
---

{第一条推文 text}

---

{第二条推文 text}

---

{第三条推文 text}
```

#### X Article 长文

```markdown
---
type: article
url: https://x.com/i/article/{article_id}
title: "{title}"
author: "{author}"
username: "{username}"
created_at: "{created_at}"
---

# {title}

{text}
```

### 4. 输出

- 默认直接显示 Markdown 内容给用户
- 如果用户要求保存文件，使用 `write` 工具写入：
  - 推文路径：`x-to-markdown/{username}/{tweet_id}.md`
  - Article 路径：`x-to-markdown/articles/{article_id}.md`
- 告知用户文件路径

## 注意事项

- 保留推文/文章原文，不翻译、不改写
- 图片/视频 URL 如果在推文 text 中出现，保留为 Markdown 链接
- Article 的 cover_image 如果存在，在标题后插入 `![cover]({cover_image})`
- 如果获取失败，告知用户检查 X Cookie 配置
