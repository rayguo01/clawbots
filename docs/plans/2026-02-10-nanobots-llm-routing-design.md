# Nanobots 智能 LLM 路由设计

> 日期: 2026-02-10
> 状态: Draft
> 参考: ClawRouter (BlockRunAI/ClawRouter) 15 维评分 + 4 级分层路由逻辑

## 1. 背景与目标

Nanobots 作为多租户 SaaS，LLM 推理成本是最大的运营开支。不同用户消息的复杂度差异巨大——"你好"和"帮我分析这份报告的优缺点"不应该用同一个模型。

**目标：** 在 Central Gateway 层实现自动化模型路由，对用户完全透明，预计节省 ~78% 的 LLM 成本。

**核心原则：**

- 纯规则评分，<1ms，零 LLM 调用开销
- 用户无感知，不需要选模型
- 配置可调，无需改代码

## 2. 架构

### Gateway 作为 LLM 代理

用户容器不再直接调 LLM API，而是通过 Gateway 的 LLM 代理端点。Gateway 持有所有 LLM API Key，容器不需要。

```
用户 (WhatsApp/Telegram)
     │
     ▼
┌──────────────┐
│ User Container│   不持有任何 LLM API Key
│  (nanobots)  │   LLM endpoint 配置为 Gateway 地址
│              │
│  Pi Agent ───┼──── POST http://gateway:3000/api/llm/chat/completions ──►┐
│              │     (OpenAI-compatible 格式)                              │
└──────────────┘                                                           │
                                                                           ▼
                                                           ┌──────────────────┐
                                                           │  Central Gateway  │
                                                           │                  │
                                                           │  1. 验证 userId   │
                                                           │  2. 路由评分 (<1ms)│
                                                           │  3. 选择模型       │
                                                           │  4. 转发请求       │
                                                           │  5. 记录用量       │
                                                           └────────┬─────────┘
                                                                    │
                                                 ┌──────────────────┼──────────────┐
                                                 ▼                  ▼              ▼
                                           ┌──────────┐     ┌──────────┐   ┌──────────┐
                                           │ DeepSeek │     │  Gemini  │   │  Claude  │
                                           │日常闲聊   │     │  兜底    │   │ 关键任务  │
                                           └──────────┘     └──────────┘   └──────────┘
```

### 容器侧改动

容器通过环境变量注入 Gateway LLM 地址：

```bash
docker run -d \
  -e NANOBOTS_USER_ID=u123 \
  -e NANOBOTS_LLM_BASE_URL=http://gateway:3000/api/llm \
  -e NANOBOTS_LLM_API_KEY=internal-u123-token \
  nanobots:latest
```

Gateway 的 `/api/llm/chat/completions` 端点兼容 OpenAI Chat Completions API 格式，对容器来说和直接调 OpenAI 没有区别。

## 3. 模型选择

### 供应商

| 供应商                 | 角色                     | 原因                            |
| ---------------------- | ------------------------ | ------------------------------- |
| **DeepSeek**           | 日常闲聊、简单问答、推理 | 极便宜，中文好                  |
| **Claude (Anthropic)** | 工具调用、复杂任务       | function calling 格式遵从度最高 |
| **Gemini (Google)**    | 兜底                     | 便宜、大上下文、稳定            |

### 简单理解

| 场景                                     | 模型              |
| ---------------------------------------- | ----------------- |
| 日常闲聊、简单问答                       | DeepSeek Chat     |
| 需要动手干活（调工具、发邮件、查日历等） | Claude Sonnet     |
| 需要深度思考（推理、计算、证明）         | DeepSeek Reasoner |
| 以上任何一个挂了                         | Gemini Flash      |

## 4. 路由评分引擎

### 10 维加权评分

针对 nanobots 对话助手场景，从 ClawRouter 的 15 维裁剪为 10 维：

| #   | 维度                  | 权重 | 检测内容                                         |
| --- | --------------------- | ---- | ------------------------------------------------ |
| 1   | **reasoningMarkers**  | 0.20 | "证明""推导""step by step""为什么"               |
| 2   | **toolInvocation**    | 0.18 | 请求带 tools 数组，或"帮我查""搜一下""发邮件"    |
| 3   | **taskComplexity**    | 0.15 | "先...然后""第一步""帮我规划" 等多步骤指令       |
| 4   | **tokenCount**        | 0.10 | 消息长度：短(<30 tokens) → 简单，长(>300) → 复杂 |
| 5   | **simpleIndicators**  | 0.10 | "你好""谢谢""是什么""几点了""天气"               |
| 6   | **creativeMarkers**   | 0.08 | "写一篇""帮我想""创意""故事""文案"               |
| 7   | **knowledgeDepth**    | 0.07 | "分析""比较""优缺点""详细解释"                   |
| 8   | **outputFormat**      | 0.05 | "表格""JSON""列出""清单"                         |
| 9   | **constraintCount**   | 0.04 | "不超过""至少""必须""限制"                       |
| 10  | **conversationDepth** | 0.03 | 上下文轮次：单轮 → 简单，10+ 轮 → 复杂           |

**总权重 = 1.00**

### 评分流程

```
用户消息
  │
  ▼
关键词匹配 (纯字符串搜索, <1ms)
  │
  ▼
加权求和: Σ(score × weight) → aggregate score
  │
  ▼
检查 Override 规则:
  • 2+ 推理关键词 → 强制 REASONING (置信度 ≥ 0.85)
  • 输入 > 100K tokens → 强制 COMPLEX (置信度 = 0.95)
  • 带 tools 数组 → 切换工具调用模型映射
  │
  ▼
分数 → 分层:
  • < 0.00  → SIMPLE
  • 0.00-0.15 → MEDIUM
  • 0.15-0.25 → COMPLEX
  • > 0.25 → REASONING
  │
  ▼
Sigmoid 置信度校准:
  • confidence = 1 / (1 + e^(-12 × distance))
  • distance = |score - nearest_boundary|
  • 置信度 < 0.70 → 默认 MEDIUM（不调 LLM 做二次分类）
  │
  ▼
选择模型 → 转发请求
```

## 5. 分层与模型映射

### 4 级分层

| 分层          | 分数范围    | 典型场景                         | 主模型            | 输出成本 $/M |
| ------------- | ----------- | -------------------------------- | ----------------- | ------------ |
| **SIMPLE**    | < 0.00      | "你好""几点了""谢谢"             | DeepSeek Chat     | $0.28        |
| **MEDIUM**    | 0.00 - 0.15 | "总结一下""翻译这段""写个短文案" | DeepSeek Chat     | $0.28        |
| **COMPLEX**   | 0.15 - 0.25 | "分析报告""规划行程""写长文"     | Claude Sonnet 4   | $15.00       |
| **REASONING** | > 0.25      | "证明""推导""逐步计算"           | DeepSeek Reasoner | $2.19        |

### 工具调用模型映射

当请求包含 `tools` 数组时自动切换：

| 分层          | 工具调用模型    | 原因                           |
| ------------- | --------------- | ------------------------------ |
| **SIMPLE**    | DeepSeek Chat   | 简单工具调用（查天气、查时间） |
| **MEDIUM**    | Claude Sonnet 4 | 工具调用稳定性好               |
| **COMPLEX**   | Claude Sonnet 4 | 复杂多步工具链                 |
| **REASONING** | Claude Sonnet 4 | 推理 + 工具组合                |

### Fallback 链

任何主模型请求失败（限流、超时、服务不可用）时，统一 fallback 到 Gemini 2.5 Flash。

## 6. 关键词表（中英文）

### reasoningMarkers（推理标记）

```
EN: "prove", "theorem", "derive", "step by step", "chain of thought",
    "logically", "mathematical", "proof", "deduce", "infer"
ZH: "证明", "定理", "推导", "逐步", "一步一步", "思维链",
    "逻辑上", "数学", "推理", "演绎"
```

### toolInvocation（工具调用意图）

```
EN: "search for", "send email", "check calendar", "add task",
    "play music", "set reminder", "find restaurant", "book", "look up"
ZH: "帮我查", "搜一下", "发邮件", "看日历", "添加任务",
    "播放音乐", "提醒我", "找餐厅", "预订", "查一下"
```

### taskComplexity（任务复杂度）

```
EN: "first...then", "step 1", "plan for", "help me organize",
    "compare and", "analyze", "multiple", "schedule"
ZH: "先...然后", "第一步", "帮我规划", "帮我安排",
    "对比", "分析一下", "多个", "行程"
```

### simpleIndicators（简单指标）

```
EN: "hello", "hi", "thanks", "what is", "define", "who is",
    "what time", "weather", "yes", "no", "ok"
ZH: "你好", "谢谢", "是什么", "什么意思", "几点",
    "天气", "好的", "嗯", "对", "早上好", "晚安"
```

### creativeMarkers（创意标记）

```
EN: "write a", "compose", "brainstorm", "story", "creative",
    "copywriting", "slogan", "poem"
ZH: "写一篇", "帮我想", "创意", "故事", "文案",
    "广告语", "口号", "作文", "小说"
```

### knowledgeDepth（知识深度）

```
EN: "explain in detail", "pros and cons", "differences between",
    "deep dive", "comprehensive", "why does"
ZH: "详细解释", "优缺点", "区别是什么", "深入分析",
    "全面", "为什么会"
```

### outputFormat（输出格式）

```
EN: "json", "yaml", "table", "list", "schema", "csv"
ZH: "表格", "列出", "清单", "格式", "列表"
```

### constraintCount（约束条件）

```
EN: "at most", "at least", "within", "maximum", "must", "no more than"
ZH: "不超过", "至少", "必须", "限制", "以内", "最多"
```

### conversationDepth / tokenCount

不依赖关键词：

- **conversationDepth**: messages 中 user 轮次数
- **tokenCount**: 最后一条 user 消息的 token 估算

关键词表后续可通过运营数据持续补充，无需改代码。

## 7. Gateway LLM 代理 API

### 端点

```
POST /api/llm/chat/completions
```

兼容 OpenAI Chat Completions API 格式。

### 处理流程

```typescript
async function handleLlmProxy(req, res) {
  // 1. 验证容器身份
  const userId = verifyInternalToken(req.headers.authorization);

  // 2. 路由评分 (<1ms)
  const messages = req.body.messages;
  const hasTools = req.body.tools?.length > 0;
  const lastUserMsg = messages.findLast((m) => m.role === "user")?.content ?? "";

  const { tier, confidence } = score(lastUserMsg, {
    tokenCount: estimateTokens(messages),
    hasTools,
    conversationDepth: messages.filter((m) => m.role === "user").length,
  });

  // 3. 选模型
  const model = selectModel(tier, hasTools);

  // 4. 转发到真实 LLM API（流式透传）
  const response = await forwardToProvider(model, req.body);

  // 5. 记录用量（异步，不阻塞响应）
  logUsage(userId, model, tier, inputTokens, outputTokens);

  // 6. 流式返回给容器
  pipe(response, res);
}
```

### 用量记录表

```sql
CREATE TABLE llm_usage (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(id),
    model         VARCHAR(100) NOT NULL,    -- deepseek/deepseek-chat
    tier          VARCHAR(20) NOT NULL,     -- SIMPLE / MEDIUM / COMPLEX / REASONING
    input_tokens  INT NOT NULL,
    output_tokens INT NOT NULL,
    cost_usd      NUMERIC(10, 6) NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_llm_usage_user_date ON llm_usage(user_id, created_at);
```

## 8. 可调配置

所有路由参数通过配置管理，改配置即可调整行为，无需改代码：

```typescript
const routingConfig = {
  // 维度权重
  weights: {
    reasoningMarkers: 0.2,
    toolInvocation: 0.18,
    taskComplexity: 0.15,
    tokenCount: 0.1,
    simpleIndicators: 0.1,
    creativeMarkers: 0.08,
    knowledgeDepth: 0.07,
    outputFormat: 0.05,
    constraintCount: 0.04,
    conversationDepth: 0.03,
  },

  // 分层阈值
  tierBoundaries: {
    simpleMedium: 0.0,
    mediumComplex: 0.15,
    complexReasoning: 0.25,
  },

  // 置信度参数
  confidenceThreshold: 0.7,
  confidenceSteepness: 12,

  // 标准模型映射
  tiers: {
    SIMPLE: { primary: "deepseek/deepseek-chat", fallback: "google/gemini-2.5-flash" },
    MEDIUM: { primary: "deepseek/deepseek-chat", fallback: "google/gemini-2.5-flash" },
    COMPLEX: { primary: "anthropic/claude-sonnet-4", fallback: "google/gemini-2.5-flash" },
    REASONING: { primary: "deepseek/deepseek-reasoner", fallback: "google/gemini-2.5-flash" },
  },

  // 工具调用模型映射
  toolTiers: {
    SIMPLE: { primary: "deepseek/deepseek-chat", fallback: "google/gemini-2.5-flash" },
    MEDIUM: { primary: "anthropic/claude-sonnet-4", fallback: "google/gemini-2.5-flash" },
    COMPLEX: { primary: "anthropic/claude-sonnet-4", fallback: "google/gemini-2.5-flash" },
    REASONING: { primary: "anthropic/claude-sonnet-4", fallback: "google/gemini-2.5-flash" },
  },

  // token 阈值
  tokenThresholds: { simple: 30, complex: 300 },

  // 大上下文强制升级
  maxTokensForceComplex: 100_000,
};
```

### 运营场景

- **模型降本**: 供应商降价 → 改 tiers 配置
- **新模型上线**: 加到 fallback 或替换 primary
- **质量调优**: 用户反馈简单问题回答差 → 调高 `simpleMedium` 阈值
- **AB 测试**: 后续可按 userId 百分比灰度不同配置

## 9. 成本估算

### 模型价格

| 模型              | Input $/M tokens | Output $/M tokens |
| ----------------- | ---------------- | ----------------- |
| DeepSeek Chat     | $0.14            | $0.28             |
| DeepSeek Reasoner | $0.55            | $2.19             |
| Claude Sonnet 4   | $3.00            | $15.00            |
| Gemini 2.5 Flash  | $0.15            | $0.60             |

### 预估流量分布（对话助手场景）

| 分层                  | 占比 | 主模型            | 加权输出成本              |
| --------------------- | ---- | ----------------- | ------------------------- |
| SIMPLE                | 40%  | DeepSeek Chat     | $0.28 × 40% = $0.112      |
| MEDIUM                | 35%  | DeepSeek Chat     | $0.28 × 35% = $0.098      |
| COMPLEX（含工具调用） | 20%  | Claude Sonnet     | $15.00 × 20% = $3.000     |
| REASONING             | 5%   | DeepSeek Reasoner | $2.19 × 5% = $0.110       |
| **加权平均**          |      |                   | **$3.32/M output tokens** |

### 对比全部用 Claude Sonnet

| 方案               | 输出成本 /M tokens | 相对节省 |
| ------------------ | ------------------ | -------- |
| 全用 Claude Sonnet | $15.00             | —        |
| 智能路由           | $3.32              | **~78%** |

### 实际成本（每用户每天约 5 万 output tokens，约 50 轮对话）

| 方案        | 每用户每天 | 100 用户每月 |
| ----------- | ---------- | ------------ |
| 全用 Claude | $0.75      | $2,250       |
| 智能路由    | $0.17      | $510         |
| **月省**    |            | **$1,740**   |

## 10. 分级记忆注入（借鉴 Claw Compactor）

> 参考: [aeromomo/claw-compactor](https://github.com/aeromomo/claw-compactor) — 一个 AI Agent token 压缩工具，通过 5 层压缩策略减少 memory/session 的 token 消耗。
> 结论: 不直接集成（Python 依赖、字典编码 `$XX` 会降低 LLM 理解力、有损压缩对聊天记忆敏感），但借鉴其两个核心思路。

### 10.1 思路一：按路由分层注入不同粒度的记忆

Claw Compactor 的分级摘要（L0 ~200 tokens / L1 ~500 tokens / L2 全量）与路由引擎天然配合——简单问题不需要完整记忆上下文：

| 路由分层  | 注入记忆级别   | token 量 | 原因                     |
| --------- | -------------- | -------- | ------------------------ |
| SIMPLE    | L0（精简摘要） | ~200     | "你好""几点了"不需要记忆 |
| MEDIUM    | L1（中等摘要） | ~500     | 一般任务需要基本偏好     |
| COMPLEX   | L2（完整记忆） | 全量     | 复杂任务需要完整上下文   |
| REASONING | L1（中等摘要） | ~500     | 推理任务重逻辑，记忆次要 |

**实现位置：** Gateway LLM 代理层。在转发请求前，根据路由分层结果，从 DB 读取对应级别的用户记忆，注入到 messages 的 system prompt 中。

```typescript
async function handleLlmProxy(req, res) {
  const { tier } = score(lastUserMsg, ...);

  // 按分层选择记忆粒度
  const memoryLevel = {
    SIMPLE: "L0",
    MEDIUM: "L1",
    COMPLEX: "L2",
    REASONING: "L1",
  }[tier];

  const memory = await loadUserMemory(userId, memoryLevel);

  // 注入记忆到 system prompt
  req.body.messages = injectMemory(req.body.messages, memory);

  // 继续正常路由...
}
```

**双重节省效果：**

- 路由引擎选便宜模型 → 省 output 成本
- 精简记忆注入 → 省 input 成本
- 叠加效果预计在原有 78% 基础上再省 10-15% 的 input token 费用

### 10.2 思路二：定期记忆摘要生成

用户的记忆文件会随时间增长。定期用便宜模型（DeepSeek Chat）生成 L0/L1 摘要：

```
每日定时任务 (cron)
  │
  ▼
遍历所有用户的完整记忆 (L2)
  │
  ▼
调用 DeepSeek Chat 生成:
  • L0 摘要 (~200 tokens): 用户核心偏好和关键事实
  • L1 摘要 (~500 tokens): 偏好 + 近期重要事件
  │
  ▼
存入 DB: user_memory 表 (user_id, level, content, updated_at)
```

**为什么用 LLM 生成而非规则压缩：**

- 规则压缩（如 Claw Compactor 的字典编码）是面向 token 计数的机械压缩，LLM 读压缩后的文本理解力下降
- 用 LLM 做摘要是语义级压缩，产出的是自然语言，任何模型都能正常理解
- DeepSeek Chat 做摘要成本极低（$0.28/M output），每用户每天不到 $0.001

### 10.3 记忆表 Schema

```sql
CREATE TABLE user_memory (
    user_id     UUID NOT NULL REFERENCES users(id),
    level       VARCHAR(5) NOT NULL,      -- L0 / L1 / L2
    content     TEXT NOT NULL,
    token_count INT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, level)
);
```

## 11. 与多租户架构的集成

本设计与 [多租户架构设计](2026-02-10-nanobots-multi-tenant-design.md) 无缝集成：

- **LLM API Key** 全部由 Central Gateway 持有，容器不需要
- **用量记录** 按 userId 存入 `llm_usage` 表，为未来计费系统提供数据
- **路由配置** 全局生效，通过 Gateway 统一管控
- **容器改动** 只需把 LLM endpoint 从直连供应商改为指向 Gateway 内网地址
- **分级记忆** Gateway 按路由分层注入不同粒度的记忆，双重降低 token 成本
