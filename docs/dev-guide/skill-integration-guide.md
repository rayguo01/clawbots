# Nanobots Skill 集成完整指南

从分析到上线的全流程参考，以 half-full（饮食记录）为例。

---

## 第一步：分析 Skill 目录结构

典型的 clawhub skill 目录：

```
skill-name/
├── SKILL.md          # 核心文件：frontmatter + 指令（必须有）
├── _meta.json        # clawhub 发布元数据（可忽略）
├── README.md         # 用户说明文档（可忽略）
├── AGENT_GUIDE.md    # Agent 行为准则（需合并到 SKILL.md）
└── scripts/          # 可执行脚本
    ├── profile.py
    ├── food_db.py
    └── log.py
```

**重点检查**：

- `SKILL.md` frontmatter 的 `requires` 字段：`bins`（命令行依赖）、`env`（环境变量）、`plugins`（插件依赖）
- scripts 目录的语言和依赖（Python 需要 python3，Node 需要 node）
- 原始 SKILL.md 是否包含完整的脚本调用指令（clawhub 上的 skill 经常只有诗意描述，缺少实际命令）

---

## 第二步：改写 SKILL.md

### 关键原则

原始 skill 可能只有 3 行诗意文字，**必须改写为 agent 可执行的指令文档**。

### Frontmatter 格式

```yaml
---
name: skill-name
description: 简明触发描述。用户说了什么时使用。关键词：词1、词2、词3。
version: 0.1.3
author: xxx
tags: [tag1, tag2]
metadata:
  openclaw:
    emoji: "🍃"
    requires:
      bins: ["python3"] # 可选：需要的命令行工具
      env: ["SOME_API_KEY"] # 可选：需要的环境变量
      plugins: ["some-plugin"] # 可选：需要的插件
---
```

### description 字段 — 最关键

**这是决定 skill 能否被触发的唯一依据。** Agent 在回复前扫描 `<available_skills>` 中每个 skill 的 description，匹配则读取 SKILL.md。

**写法要求**：

- **必须双语**：主语言写完整描述 + 对方语言补充关键词（见下方规范）
- 明确说明"用户说了什么时使用"
- 列出关键词帮助 LLM 匹配
- **与其他 skill 的 description 区分开**（如 half-full 与 ezbookkeeping 都涉及"吃"，必须用"不涉及金额"vs"花了多少钱"区分）

### description 必须双语（重要）

Nanobots 用户有中文和英文两种语言。Skill 触发完全依赖 LLM 将用户意图与 description 语义匹配。**单语 description 会显著降低另一种语言用户的触发率**，原因：

- LLM 虽有跨语言理解能力，但 description 中的关键词列表是重要匹配信号
- 中文关键词"吃了、午餐、减肥"无法被英文用户的 "I had salad for lunch" 直接命中
- 英文 "Generate or edit images" 无法被中文 "帮我生成一张图" 直接命中

**规范：主语言完整描述 + 对方语言关键词补充**

中文为主的 skill：

```
description: 饮食健康记录。用户提到吃了什么食物（不涉及金额）、记录餐食、查询营养时使用。关键词：吃了、午餐、晚餐、体重、diet、food log、nutrition、calories、weight。
```

英文为主的 skill：

```
description: Generate or edit images via Gemini. Use when user asks to create, draw, or modify images. 关键词：生成图片、画图、修图、AI绘画。
```

**成本很低**（description 只占几十 token），**收益很高**（双语触发率大幅提升）。

**好的例子**：

```
description: 饮食健康记录。用户提到吃了什么食物（不涉及金额）、想记录今天的餐食内容、查询饮食营养、记录体重、查看体重趋势时使用。关键词：吃了、午餐、晚餐、早餐、体重、营养、热量、减肥、diet、food log、nutrition、calories、weight tracking。
```

**坏的例子**：

```
description: A warm diet companion.
```

### Body 格式 — 脚本调用指令

body 中的 bash 代码块使用 `{baseDir}` 占位符，运行时自动替换为 skill 目录的实际路径。

````markdown
# Skill 名称

## 功能一

说明文字。

\```bash
python3 {baseDir}/scripts/xxx.py command --param value
\```

- `--param`: 参数说明

## 行为准则

（从 AGENT_GUIDE.md 合并进来的内容）
````

**注意**：如果原始 skill 有单独的 AGENT_GUIDE.md，必须将其内容合并到 SKILL.md 的 body 中。Agent 只读 SKILL.md，不会自动读其他 .md 文件。

---

## 第三步：安装 Skill

### 复制到 skills 目录

```bash
cp -r temp/skill-name skills/skill-name/
```

### 目录结构

```
nanobots/skills/
├── half-full/
│   ├── SKILL.md        # 改写后的
│   ├── AGENT_GUIDE.md  # 保留原文件（不影响，但 agent 不会自动读）
│   └── scripts/
│       ├── profile.py
│       ├── food_db.py
│       └── log.py
├── nano-banana-pro/
│   └── SKILL.md
└── ...
```

### Dockerfile 确认

如果 skill 有额外的系统依赖（如 python3），确认 Dockerfile 已安装：

```dockerfile
RUN apk add --no-cache python3 python3-pip
```

Nanobots 的 Dockerfile 已预装 python3。

### npm 依赖确认（重要！）

**必须检查 skill scripts 中所有非相对路径、非 `node:` 内置模块的 import，确认对应的 npm 包已在根 `package.json` 中声明。**

Skills 目录没有独立的 package.json，脚本运行时依赖根目录 `node_modules/`（Docker 中为 `/app/node_modules/`）。如果 import 的包不在根 package.json 中，Docker 里 `pnpm install` 不会安装它，运行时必然报 `Cannot find package` 错误。

**检查方法**：

```bash
# 列出所有外部 npm 包 import
grep -rh "^import.*from ['\"]" skills/skill-name/scripts/ | grep -v "from ['\"]\./" | grep -v "from ['\"]node:" | sort -u
```

**然后逐个确认**是否已在根 package.json 的 dependencies 中。缺失的用 `pnpm add -w <package>` 添加。

**踩坑案例**：`baoyu-url-to-markdown` 的 `html-to-markdown.ts` import 了 `turndown-plugin-gfm`，但未在 package.json 中声明。本地开发可能全局安装过所以不报错，Docker 构建后运行才暴露。

---

## 第四步：验证 Skill 加载

### 检查文件是否在容器中

```bash
docker exec nanobots ls /app/skills/skill-name/
docker exec nanobots cat /app/skills/skill-name/SKILL.md | head -20
```

### 检查依赖是否满足

```bash
docker exec nanobots which python3
```

### 检查 skill 是否被加载

Skill 加载无日志输出。要验证需要检查 skill 发现链：

- `loadSkillEntries()` 从 4 个来源加载：extra < bundled < managed < workspace
- Bundled dir 通过 `resolveBundledSkillsDir()` 解析（Docker 中为 `/app/skills/`）
- `shouldIncludeSkill()` 检查资格：bins（PATH 中是否存在）、env、plugins、OS

### 关键文件

- `src/agents/skills/workspace.ts` — loadSkillEntries, buildWorkspaceSkillSnapshot
- `src/agents/skills/config.ts` — shouldIncludeSkill, hasBinary
- `src/agents/skills/bundled-dir.ts` — resolveBundledSkillsDir

---

## 第五步：Web UI 展示

### 5a. 后端 — skills-setup.ts

文件：`extensions/web-setup/src/skills-setup.ts`

在 `handleSkillsStatus` 中添加新 skill 的状态检测：

```typescript
// 不需要配置的 skill（如 half-full 只需要 python3）
import { execSync } from "node:child_process";

function hasBinary(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// 在 sendJson 中添加：
"half-full": { configured: hasBinary("python3") },

// 需要 API Key 的 skill（如 nano-banana-pro）
"nano-banana-pro": { configured: hasApiKey || hasEnvKey },

// 需要外部服务的 skill（如 ezbookkeeping）
"ezbookkeeping": { configured: !!process.env.NANOBOTS_EZBOOKKEEPING_URL },
```

**别忘了在 catch 块的兜底响应中也添加对应字段。**

### 5b. 前端 — app.js renderSkills()

文件：`extensions/web-setup/public/app.js`

在 `renderSkills()` 函数中添加卡片 HTML：

```javascript
// ── 新 skill 卡片 ──
'<div class="card">' +
'<div class="service-header">' +
'<h2>🍃 半饱 (Half Full)</h2>' +
'<span class="badge badge-success" id="halffull-badge">加载中...</span>' +
"</div>" +
'<p class="hint" style="margin-bottom:12px">一句话功能描述</p>' +
'<div class="hint"><strong>功能：</strong>功能列表</div>' +
'<div class="hint"><strong>特点：</strong>特点说明</div>' +
'<div class="hint"><strong>依赖：</strong>依赖说明</div>' +
"</div>" +
```

在 `api("/api/setup/skills/status").then(...)` 回调中添加 badge 更新：

```javascript
var badge = document.getElementById("halffull-badge");
if (badge) {
  if (d && d["half-full"] && d["half-full"].configured) {
    badge.className = "badge badge-success";
    badge.textContent = "已就绪 ✓";
  } else {
    badge.className = "badge badge-error";
    badge.textContent = "缺少 Python3";
  }
}
```

### Skill 卡片的三种模式

| 类型         | 例子            | 卡片内容                         |
| ------------ | --------------- | -------------------------------- |
| 无需配置     | half-full       | 只展示状态 badge，无输入框       |
| 需要 API Key | nano-banana-pro | 有输入框 + 保存按钮              |
| 依赖外部服务 | ezbookkeeping   | 展示状态，由 docker-compose 配置 |

---

## 第六步：构建部署

```bash
docker compose build --no-cache nanobots
docker compose up -d nanobots
sleep 8 && docker logs nanobots --tail 15
curl -s http://localhost:8080/api/setup/skills/status | python3 -m json.tool
```

---

## 第七步：测试触发

### Skill 触发机制（重要）

Skill 触发是 **100% LLM 驱动**，没有框架层面的自动匹配：

1. 系统提示中有 `## Skills (mandatory)` 段落，指令 LLM："Before replying: scan <available_skills>"
2. `<available_skills>` XML 包含每个 skill 的 name、description、location
3. LLM 判断用户意图匹配某 skill → 用 `read` 工具读取 SKILL.md → 按指令执行脚本
4. 如果 LLM 跳过扫描 → 直接用通用知识回答 → skill 未触发

### 模型选择对触发率的影响

- **Gemini 3 Flash**: 指令遵循弱，skill 触发不稳定
- **Gemini 3 Pro**: 指令遵循强，推荐使用
- 模型配置: `nanobots.json` → `agents.defaults.model.primary`

### 相关代码

- 系统提示构建: `src/agents/system-prompt.ts` — `buildSkillsSection()`
- Skills prompt 格式化: `node_modules/@mariozechner/pi-coding-agent` → `formatSkillsForPrompt()`
- Skill 注入点: `src/agents/pi-embedded-runner/run/attempt.ts` — `resolveSkillsPromptForRun()`

---

## Skill 三层懒加载机制（重要）

Skill 的内容**不是**一次性全部注入 system prompt，而是分三层按需加载：

### 第一层：System Prompt — 仅 name + description（全部 skill）

`formatSkillsForPrompt()` 将所有合格 skill 格式化为 XML 注入 system prompt：

```xml
<available_skills>
  <skill>
    <name>skill-name</name>
    <description>触发描述...</description>
    <location>/app/skills/skill-name/SKILL.md</location>
  </skill>
  <!-- 所有 skill 都列出，只有这 3 个字段 -->
</available_skills>
```

**代码位置**: `node_modules/@mariozechner/pi-coding-agent/dist/core/skills.js` → `formatSkillsForPrompt()`

### 第二层：按需读取 SKILL.md（仅匹配的 1 个）

System prompt 中的指令：

```
## Skills (mandatory)
Before replying: scan <available_skills> <description> entries.
- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
Constraints: never read more than one skill up front; only read after selecting.
```

**代码位置**: `src/agents/system-prompt.ts` → `buildSkillsSection()`

### 第三层：SKILL.md 引用的其他文件（按需再读）

`formatSkillsForPrompt` 中有关键提示：

> "When a skill file references a relative path, resolve it against the skill directory"

SKILL.md 可以用 `{baseDir}` 引用同目录下的其他文件（如 AGENTS.md、references/sources.md），LLM 会用 read 工具按需加载。

### 实践指导

| 场景                                 | 做法                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| Skill 只有简单指令                   | 全部写在 SKILL.md 即可                                              |
| Skill 有详细参考文档（如 AGENTS.md） | 保持独立文件，SKILL.md 中用 `[AGENTS.md]({baseDir}/AGENTS.md)` 引用 |
| Skill 有新闻源列表等参考数据         | 放 references/ 目录，SKILL.md 中引用                                |
| ~~所有内容合并到 SKILL.md~~          | **不要这样做** — 会浪费上下文窗口，大部分情况 LLM 不需要全部内容    |

**核心原则**：SKILL.md 是入口和概要，详细内容通过引用分层加载。Skill 越多，这个设计越重要。

---

## 常见问题

### Q: Skill 文件存在但没被加载？

检查 `shouldIncludeSkill()` 的过滤条件：bins 是否在 PATH 中、env 变量是否设置、是否在 allowBundled 列表中。

### Q: Skill 加载了但不触发？

1. 检查 description 是否足够明确
2. 检查与其他 skill 是否有描述重叠
3. 确认模型够强（推荐 Gemini Pro 而非 Flash）
4. 触发是概率性的，不是 100%

### Q: 如何强制触发 skill？

在支持 skill commands 的通道中，用户可发 `/skill:skill-name` 直接调用（需 `user-invocable: true`，默认为 true）。

### Q: Docker 中 skill 脚本路径是什么？

`/app/skills/skill-name/scripts/xxx.py`，由 `{baseDir}` 占位符在运行时替换。

### Q: Skill 有 AGENTS.md 等额外文件，需要合并到 SKILL.md 吗？

**不需要。** Skill 系统是三层懒加载设计，SKILL.md 中用相对路径引用即可（如 `[AGENTS.md]({baseDir}/AGENTS.md)`）。LLM 触发 skill 后读 SKILL.md，需要详细信息时再按需读取引用文件。合并反而浪费上下文窗口。
