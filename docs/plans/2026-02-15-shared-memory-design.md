# 跨 Agent 共享记忆设计

## 背景

Nanobots 支持多 Agent（Pi 个人助理、Lily 营销顾问等），但记忆系统当前按 Agent 完全隔离。每个 Agent 有独立的 workspace、独立的 QMD 索引，无法搜索到其他 Agent 的记忆。

**问题：**

- 用户告诉 Pi "下周三产品发布"，Lily 在规划内容时不知道这个信息
- Lily 建立的品牌档案，Pi 无法在回答用户问题时引用
- 用户画像分散在各 Agent 的 `user-profile.md` 中，不一致

**竞品对比：** Sintra AI 的 12 个助手之间也不共享上下文，被评测指出为核心缺陷。

## 现有记忆架构

### QMD 三层检索（`NANOBOTS_MEMORY_BACKEND=qmd`）

| 层            | 技术                        | 作用                                   |
| ------------- | --------------------------- | -------------------------------------- |
| BM25 全文索引 | SQLite FTS5                 | 精确匹配：人名、ID、代码符号、专有名词 |
| 向量语义搜索  | 本地 GGUF 模型 + sqlite-vec | 语义匹配："产品发布" ↔ "launch event"  |
| Reranking     | 本地 GGUF reranker          | 综合排序，提升相关性                   |

Markdown 文件是 source of truth，QMD 自动索引。Agent 通过 `memory_search` 工具查询，三层检索自动生效。

### 当前 QMD 默认 Collections

```
memory-root  →  {workspace}/MEMORY.md          (长期策展记忆)
memory-alt   →  {workspace}/memory.md           (备选)
memory-dir   →  {workspace}/memory/**/*.md      (每日日记)
```

**已知缺陷：** `knowledge/` 目录（Google Drive 同步的知识库）未加入 QMD 索引。Builtin backend 的 `listMemoryFiles()` 包含 `knowledge/`，但 QMD 的 `resolveDefaultCollections()` 遗漏了。这导致知识库文档无法被 `memory_search` 语义搜索到。

## 设计方案

### 数据分层

```
~/.nanobots/
  shared/                              ← QMD collection "shared"（跨 Agent 共享）
    USER-PROFILE.md                    ← 统一用户画像
    cross-context.md                   ← Agent 间传递的关键上下文
    decisions.md                       ← 重要决策记录

  workspace/                           ← Pi workspace（私有）
    MEMORY.md                          ← QMD collection "memory-root"
    memory/*.md                        ← QMD collection "memory-dir"
    knowledge/                         ← QMD collection "knowledge"（各 Agent 各自）

  workspace-lily/                      ← Lily workspace（私有）
    MEMORY.md                          ← QMD collection "memory-root"
    memory/*.md                        ← QMD collection "memory-dir"
    knowledge/                         ← QMD collection "knowledge"（各 Agent 各自）
```

### QMD Collections 配置

在 `nanobots.json` 中添加：

```jsonc
{
  "memory": {
    "backend": "qmd",
    "qmd": {
      "includeDefaultMemory": true,
      "paths": [
        {
          "name": "knowledge",
          "path": "knowledge",
          "pattern": "**/*.md",
        },
        {
          "name": "shared",
          "path": "/home/node/.nanobots/shared",
          "pattern": "**/*.md",
        },
      ],
    },
  },
}
```

**路径解析规则：**

- `"knowledge"` — workspace-relative，QMD 为每个 Agent 解析为各自 workspace 下的 `knowledge/` 目录
- `"/home/node/.nanobots/shared"` — absolute，所有 Agent 共享同一个目录

### 每个 Agent 的完整索引范围

| Collection    | 路径                                  | 作用域       | 内容                    |
| ------------- | ------------------------------------- | ------------ | ----------------------- |
| `memory-root` | `{workspace}/MEMORY.md`               | Agent 私有   | 长期策展记忆            |
| `memory-dir`  | `{workspace}/memory/**/*.md`          | Agent 私有   | 每日会话日记            |
| `knowledge`   | `{workspace}/knowledge/**/*.md`       | Agent 私有\* | Google Drive 知识库缓存 |
| `shared`      | `/home/node/.nanobots/shared/**/*.md` | 全局共享     | 跨 Agent 上下文         |

\*注：knowledge 虽然是各 Agent 各自的 collection，但内容来自同一个 Google Drive，所以实际上是共享的。

## 共享目录规范

### 文件结构

```
shared/
  USER-PROFILE.md        ← 用户基础画像（姓名、时区、行业、偏好）
  cross-context.md       ← 跨 Agent 上下文（追加式）
  decisions.md           ← 关键决策记录（追加式）
```

### 写入规范

**谁可以写：** 所有 Agent 都可以写入 shared 目录。

**什么时候写：**

- **用户画像更新时** — 任何 Agent 从对话中获取了新的用户信息（姓名、偏好、公司变动等），更新 `USER-PROFILE.md`
- **跨 Agent 相关事件时** — 例如 Pi 得知产品发布日期、Lily 完成品牌建库，写入 `cross-context.md`
- **重大决策时** — 例如定价策略变更、品牌调性调整，写入 `decisions.md`

**格式约定（追加式文件）：**

```markdown
## YYYY-MM-DD [Agent名] 事件标题

简短描述。

---
```

### SOUL.md 约定

各 Agent 的 SOUL.md 需要添加共享记忆的写入指引：

```markdown
## 共享记忆

shared/ 目录是跨 Agent 共享的记忆空间，所有 Agent 的 memory_search 都能搜索到。

**写入时机：**

- 获取用户新信息时 → 更新 shared/USER-PROFILE.md
- 发生影响其他 Agent 的事件时 → 追加到 shared/cross-context.md
- 做出重大决策时 → 追加到 shared/decisions.md

**写入方式：** 使用 exec 命令写入文件（shared/ 在本地文件系统，不在 Google Drive）。

**读取：** 无需专门操作，memory_search 自动覆盖 shared/ 目录。
```

## 数据流示例

### 场景 1：Pi 得知产品发布日期

```
用户 → Pi: "下周三 Remembro 正式发布"
Pi:
  1. 在 Google Calendar 创建事件
  2. 追加到 shared/cross-context.md:
     "## 2026-02-15 [Pi] Remembro 产品发布
      发布日期: 2026-02-19 (周三)。用户计划正式上线。"
  3. QMD 检测文件变更 → 15s debounce → 自动更新索引

稍后...

用户 → Lily: "这周内容怎么安排？"
Lily:
  1. 调用 memory_search("产品发布 计划")
  2. QMD 三层检索命中 shared/cross-context.md 中的发布信息
  3. Lily 据此安排发布前预热内容
```

### 场景 2：Lily 完成品牌建库

```
Lily:
  1. 品牌档案写入 Google Drive CompanyBrain/
  2. 追加到 shared/cross-context.md:
     "## 2026-02-15 [Lily] 品牌建库完成
      品牌: Remembro，AI 词汇学习 App
      定位: AEIS/KET/PET 考试备考
      核心卖点: 独家万张试卷高频词库
      目标客户: 新加坡国际学校备考家长"

稍后...

用户 → Pi: "帮我写一封给合作方的邮件介绍产品"
Pi:
  1. 调用 memory_search("Remembro 产品 定位")
  2. 命中 shared/ 中 Lily 写的品牌摘要
  3. Pi 用准确的品牌定位起草邮件
```

## 实施步骤

1. **`setup-lily-agent.sh`** — 添加 `memory.qmd.paths` 配置（knowledge + shared）
2. **创建 shared/ 初始文件** — 在 setup 脚本中创建目录和模板文件
3. **各 Agent SOUL.md** — 添加共享记忆写入约定
4. **Docker compose** — 无需修改（shared/ 在 nanobots-data volume 内）

## 与 Sintra 的差异

| 维度         | Sintra AI            | Nanobots                             |
| ------------ | -------------------- | ------------------------------------ |
| 助手间上下文 | 完全隔离，需手动搬运 | QMD shared collection 自动共享       |
| 搜索方式     | 无跨助手搜索         | BM25 + 向量 + Reranking 三层语义搜索 |
| 知识库       | Brain AI（平台锁定） | Google Drive（用户自有数据）         |
| 用户画像     | 各助手各自维护       | shared/USER-PROFILE.md 统一维护      |
| 自定义       | 不可修改             | SOUL.md 完全可定制                   |
