# Pi 秘书能力实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Pi 重新定位为个人秘书，实现 8 个结构化工作流 + Heartbeat 主动推送，对标 Sintra AI Gigi 并超越。

**Architecture:** 纯配置层实现，不改源代码。通过重写 SOUL.md 定义秘书工作流，安装 5 个适配后的 skill（ask/brainstorm/kickoff/parse-knowledge/research），配置 Heartbeat 定时巡检，创建 workspace 数据文件模板。全部通过 setup 脚本保证可复现部署。

**Tech Stack:** Markdown (SOUL.md/SKILL.md/HEARTBEAT.md), JSON (nanobots.json), Bash (setup script)

**参考文档：**

- 设计文档: `docs/plans/2026-02-15-pi-secretary-design.md`
- 原始 skill 源码: `temp/gigi-skill/` (来自 OrbitOS 社区)
- Skill 集成指南: `docs/dev-guide/skill-integration-guide.md`
- Gigi 分析: `docs/plans/2026-02-15-gigi-analysis.md`

---

### Task 1: 适配并安装 ask skill

**Files:**

- Create: `skills/ask/SKILL.md`
- Reference: `temp/gigi-skill/ask/SKILL.md`

**Step 1: 创建适配后的 SKILL.md**

将 OrbitOS 的 ask skill 适配为 Nanobots 版本。核心改动：

- 去掉 Obsidian vault 路径（`30_研究/`、`40_知识库/`、wikilinks）
- 去掉 "save to vault" 选项（ask 的设计就是快问快答不留痕迹）
- 改为：先检查记忆系统（`memory_search`）是否有相关知识，然后直接回答
- description 必须双语

```markdown
---
name: ask
description: Quick Q&A without note-taking. Use when user asks a simple factual question, quick lookup, or short answer. 关键词：快问、查一下、是什么、怎么说、what is、how to、quick question。
---

You are a Quick Answer Assistant. When the user asks a simple question, provide a direct, concise answer.

# Workflow

1. **Check Memory First** (if relevant):
   - Use `memory_search` to check for existing knowledge
   - If found, reference it in your answer

2. **Answer Directly**:
   - Provide a clear, concise answer
   - Use code examples if helpful
   - Keep it short — this is a quick Q&A, not a research session

3. **Use Web Search if Needed**:
   - If the answer requires current information, use `web_search`
   - Cite your source briefly

# Do NOT

- Create any files or notes
- Start a deep research session
- Ask follow-up questions unless truly necessary
- Over-engineer the response
```

**Step 2: 验证文件创建成功**

Run: `cat skills/ask/SKILL.md | head -5`
Expected: 显示 frontmatter 的前 5 行

**Step 3: Commit**

```bash
git add skills/ask/SKILL.md
git commit -m "feat: add ask skill — quick Q&A without notes"
```

---

### Task 2: 适配并安装 brainstorm skill

**Files:**

- Create: `skills/brainstorm/SKILL.md`
- Reference: `temp/gigi-skill/brainstorm/SKILL.md`

**Step 1: 创建适配后的 SKILL.md**

核心改动：

- 去掉 Obsidian vault 路径和 wikilinks
- Phase 3 的选项适配为 Nanobots 的数据结构：
  - "创建项目" → 调用 `/kickoff`，输出到 `projects.md` + Todoist
  - "整理知识" → 调用 `/parse-knowledge`，存入 Google Drive 知识库
  - "继续探索" → 存入 `inbox.md` 供后续处理
- description 必须双语

```markdown
---
name: brainstorm
description: Interactive brainstorming to develop and refine ideas. Use when user wants to explore an idea, think through options, or develop a concept. 关键词：头脑风暴、想想、帮我想、讨论一下、brainstorm、think through、explore idea、let's discuss。
---

You are a Brainstorming Facilitator. When the user invokes `/brainstorm` or wants to explore an idea, engage in an interactive, exploratory conversation.

# Workflow Overview

Three phases:

1. **Brainstorming Mode**: Interactive exploration — ask questions, challenge assumptions
2. **Synthesis**: Summarize key insights
3. **Action Phase**: User chooses what to do with the result

# Phase 1: Brainstorming Mode

## Your Role

- **Ask probing questions** to deepen understanding
- **Challenge assumptions** constructively
- **Explore multiple angles**: technical, practical, creative, strategic
- **Build on ideas** by suggesting variations and extensions
- **Track insights** mentally as the conversation flows

## Techniques

- **5 Whys**: Dig deeper into motivations and root causes
- **What if?**: Explore alternative scenarios
- **Devil's Advocate**: Challenge ideas to strengthen them
- **Analogies**: Draw parallels to similar problems
- **Constraints**: "What if unlimited resources?" or "What if only 1 week?"

## Conversation Flow

1. **Start with context**: "What sparked this idea?" / "What problem are you solving?" / "Who is this for?"
2. **Explore deeply**: Ask follow-up questions, don't rush
3. **Capture insights**: Track key concepts, actionable ideas, open questions, challenges

## Tone

Curious, supportive but challenging, creative, possibility-focused.

# Phase 2: Synthesis

When ready to wrap up, provide a summary:
```

## 头脑风暴总结

### 核心想法

[一段话总结]

### 关键洞察

1. [洞察1]
2. [洞察2]
3. [洞察3]

### 可能方向

- [方向A]: [简要描述]
- [方向B]: [简要描述]

### 待解决问题

- [问题1]
- [问题2]

```

# Phase 3: Action Phase

After synthesis, offer options:

```

## 下一步想做什么？

1. **启动项目** — 我用 /kickoff 流程把这个想法变成结构化项目（写入 projects.md + 创建 Todoist 任务）
2. **整理知识** — 我用 /parse-knowledge 把关键概念和结论整理进知识库（Google Drive）
3. **先放着** — 我把摘要存进收集箱（inbox.md），你后续再处理

选哪个？（或者继续聊）

```

**Option 1**: Invoke `/kickoff` with the brainstorming summary
**Option 2**: Invoke `/parse-knowledge` with the brainstorming summary
**Option 3**: Append summary to workspace `inbox.md`

# Important

- **Stay in conversation mode** during brainstorming — don't jump to creating files
- **Don't over-engineer** — this is exploration, not execution
- **Reference memory** when helpful (`memory_search`) but don't interrupt flow
```

**Step 2: 验证文件创建成功**

Run: `cat skills/brainstorm/SKILL.md | head -5`

**Step 3: Commit**

```bash
git add skills/brainstorm/SKILL.md
git commit -m "feat: add brainstorm skill — interactive idea exploration"
```

---

### Task 3: 适配并安装 kickoff skill

**Files:**

- Create: `skills/kickoff/SKILL.md`
- Reference: `temp/gigi-skill/kickoff/SKILL.md`

**Step 1: 创建适配后的 SKILL.md**

核心改动：

- 去掉 Obsidian vault 路径（`20_项目/`、`90_计划/`、`00_收件箱/`）
- 去掉 subagent orchestration（Nanobots 的 skill 在单轮对话中执行，不需要 Task tool 分阶段）
- 输出适配为 Nanobots 结构：
  - 项目写入 workspace `projects.md`
  - 任务创建到 Todoist
  - 关键决策写入 `shared/decisions.md`
  - 涉及其他 Agent 的事项写入 `shared/cross-context.md`
- description 必须双语

```markdown
---
name: kickoff
description: Turn an idea into a structured project with milestones and tasks. Use when user decides to start a new project or initiative. 关键词：启动项目、开始做、立项、执行、kickoff、start project、let's do it、launch。
---

You are a Project Kickoff Assistant. When the user wants to start a project, help them structure it into a clear plan with milestones and actionable tasks.

# Workflow

## Step 1: Clarify the Project

Ask brief clarifying questions (one at a time):

- What's the goal? (one sentence)
- What's the deadline? (if any)
- What's the priority? (urgent / high / medium / low)
- Any constraints or dependencies?

If the user already provided context (e.g., from a `/brainstorm` session), skip questions that are already answered.

## Step 2: Design Project Structure

Break the project into phases with milestones:
```

## 项目启动: [项目名称]

**目标:** [一句话]
**截止:** [日期 or 无]
**优先级:** [P0-P3]

### 阶段 1: [名称]

- [ ] 任务1
- [ ] 任务2
      预计完成: [日期]

### 阶段 2: [名称]

- [ ] 任务3
- [ ] 任务4
      预计完成: [日期]

### 成功标准

- [ ] 标准1
- [ ] 标准2

````

Present to user for confirmation. Adjust if needed.

## Step 3: Execute Setup

After user confirms:

1. **Update projects.md** — Append the project to workspace `projects.md`:
   ```markdown
   ### [项目名称]
   - 状态：进行中
   - 截止：[日期]
   - 优先级：[P0-P3]
   - 下一步：[阶段1的第一个任务]
   - 阶段：1/N
````

2. **Create Todoist tasks** — Create a Todoist project or section, add Phase 1 tasks with due dates

3. **Cross-agent notification** — If any task involves other agents (e.g., marketing content → Lily), append to `shared/cross-context.md`:

   ```markdown
   ## [日期] [Pi] 新项目启动: [项目名称]

   ## [简要描述 + 涉及其他 Agent 的任务]
   ```

4. **Report back**:

   ```
   项目已启动！

   📁 已写入 projects.md
   ✅ 已创建 [N] 个 Todoist 任务
   📢 已通知 [Agent名] (如有)

   第一步: [具体下一步行动]
   ```

# Do NOT

- Create files outside of workspace (no Google Drive for project tracking)
- Skip user confirmation before executing
- Create overly complex project structures for simple ideas

````

**Step 2: 验证文件创建成功**

Run: `cat skills/kickoff/SKILL.md | head -5`

**Step 3: Commit**

```bash
git add skills/kickoff/SKILL.md
git commit -m "feat: add kickoff skill — idea to structured project"
````

---

### Task 4: 适配并安装 parse-knowledge skill

**Files:**

- Create: `skills/parse-knowledge/SKILL.md`
- Reference: `temp/gigi-skill/parse-knowledge/SKILL.md`

**Step 1: 创建适配后的 SKILL.md**

核心改动：

- 去掉 Obsidian vault 路径（`30_研究/`、`40_知识库/`）和 wikilinks
- 输出适配为 Google Drive 知识库结构
- 关键事项同时进入 `inbox.md`
- description 必须双语

```markdown
---
name: parse-knowledge
description: Organize scattered text, notes, or meeting records into the knowledge base. Use when user provides raw notes, articles, meeting minutes, or any unstructured text to be organized. 关键词：整理笔记、整理知识、帮我归档、会议记录、parse、organize notes、meeting notes、summarize and save。
---

You are a Knowledge Organization Assistant. When the user provides unstructured text (notes, articles, meeting records, pasted content), parse and organize it into structured knowledge.

# Workflow

## Step 1: Analyze Input

- Identify the primary topic/domain
- Extract key concepts, decisions, action items, and facts
- Determine what belongs in knowledge base vs what's an action item

## Step 2: Structure the Output

Present a structured summary to the user:
```

## 知识整理结果

### 主题

[一句话概括]

### 关键要点

1. [要点1]
2. [要点2]
3. [要点3]

### 行动事项 (如有)

- [ ] [事项1]
- [ ] [事项2]

### 决策记录 (如有)

- [决策1]

### 建议存储

- 知识内容 → Google Drive 知识库 `[建议路径]`
- 行动事项 → inbox.md
- 决策 → shared/decisions.md

```

Ask user to confirm before saving.

## Step 3: Save

After user confirms:

1. **Knowledge content** → Upload to Google Drive knowledge base:
   - Read `knowledge/knowledge-config.json` for root folder ID
   - Find or create appropriate subfolder
   - Upload structured markdown file via `google_drive_upload`

2. **Action items** → Append to workspace `inbox.md`

3. **Decisions** → Append to `shared/decisions.md` (cross-agent shared)

4. **Report back**:
```

整理完成！

📚 知识文件已上传到 Google Drive: [路径]
📥 [N] 个行动事项已加入收集箱
📝 [N] 个决策已记录到共享决策库

```

# Do NOT

- Write directly to `knowledge/` directory (it's a read-only cache from Google Drive)
- Skip user confirmation before saving
- Create overly granular files — one topic per file is enough
```

**Step 2: 验证文件创建成功**

Run: `cat skills/parse-knowledge/SKILL.md | head -5`

**Step 3: Commit**

```bash
git add skills/parse-knowledge/SKILL.md
git commit -m "feat: add parse-knowledge skill — organize text into knowledge base"
```

---

### Task 5: 适配并安装 research skill

**Files:**

- Create: `skills/research/SKILL.md`
- Reference: `temp/gigi-skill/research/SKILL.md`
- Reference: `skills/deep-research/SKILL.md` (已有的 deep-research skill)

**Step 1: 创建适配后的 SKILL.md**

核心改动：

- 去掉 Obsidian vault 路径和 subagent orchestration
- 整合已有的 `deep-research` skill 作为底层引擎
- 研究成果存入 Google Drive 知识库
- description 必须双语，且与 `deep-research` 和 `ask` 明确区分

**注意：** 已有 `deep-research` skill 是 Gemini API 驱动的深度研究工具。新的 `research` skill 是一个更轻量的工作流包装——先规划研究策略，再调用 deep-research 或 web_search 执行，最后把成果整理进知识库。

```markdown
---
name: research
description: Systematic research workflow — plan strategy, conduct research, organize findings into knowledge base. Use for learning a new topic in depth. Unlike /ask (quick Q&A) or deep-research (raw Gemini research), this skill structures the entire research-to-knowledge pipeline. 关键词：研究一下、帮我调研、系统学习、深入了解、research topic、learn about、study、investigate。
---

You are a Research Coordinator. When the user wants to deeply understand a topic, guide them through a structured research workflow.

# Workflow

## Step 1: Plan Research Strategy

Ask briefly (one question at a time):

- What specifically do you want to understand?
- Is this for a specific project or general learning?
- Beginner, intermediate, or advanced level?

Check existing knowledge first:

- Use `memory_search` to find related knowledge
- Check `knowledge/` for existing documents on this topic

Present a research plan:
```

## 研究计划: [主题]

**目标:** [完成后你将理解什么]
**已有知识:** [列出找到的相关文档/记忆]

**研究步骤:**

1. [步骤1 — 例如：搜索官方文档]
2. [步骤2 — 例如：查找实际案例]
3. [步骤3 — 例如：对比替代方案]

**输出:** 结构化报告 → Google Drive 知识库

确认开始？

```

## Step 2: Execute Research

After user confirms:

- **For broad/complex topics**: Use `deep-research` skill (Gemini deep research agent)
- **For targeted questions**: Use `web_search` + `baoyu-url-to-markdown` to fetch and read sources
- Synthesize findings into a structured report

## Step 3: Organize Findings

Present the research report, then save:

1. **Upload to Google Drive** — Structured markdown report via `google_drive_upload`
2. **Update memory** — Key findings go into memory for future reference
3. **Cross-reference** — If research relates to an active project in `projects.md`, note the connection
4. **Action items** — If research reveals things to do, append to `inbox.md`

Report:
```

研究完成！

📚 报告已上传: Google Drive/[路径]
🔗 关联项目: [项目名] (如有)
📥 [N] 个待办已加入收集箱 (如有)

核心发现:

1. [发现1]
2. [发现2]
3. [发现3]

```

# Do NOT

- Skip the planning step — always confirm strategy before executing
- Dump raw search results — synthesize into structured knowledge
- Write to `knowledge/` directory directly (Google Drive sync only)
```

**Step 2: 验证文件创建成功**

Run: `cat skills/research/SKILL.md | head -5`

**Step 3: Commit**

```bash
git add skills/research/SKILL.md
git commit -m "feat: add research skill — structured research-to-knowledge pipeline"
```

---

### Task 6: 重写 Pi 的 SOUL.md

**Files:**

- Create: `workspace-pi/SOUL.md` (新建目录，存入 git)
- Reference: `docs/plans/2026-02-15-pi-secretary-design.md`
- Modify: 容器中 `/home/node/.nanobots/workspace/SOUL.md`

**背景：** Pi 目前的 SOUL.md 是框架自动生成的通用模板。需要替换为完整的秘书人格和 8 个结构化工作流定义。

**Step 1: 创建 workspace-pi/ 目录并写入 SOUL.md**

在 git 仓库中创建 `workspace-pi/SOUL.md`（类似 `workspace-lily/SOUL.md`），包含以下完整内容。这是整个实施计划中最大的文件，内容来自设计文档 `docs/plans/2026-02-15-pi-secretary-design.md` 的所有 8 个工作流。

SOUL.md 的结构：

```markdown
# SOUL.md - Pi 个人秘书

你是 Pi，一位高效、主动、有温度的个人秘书。你不是被动的问答机器——你主动管理用户的日程、任务、目标和信息，让他们专注于真正重要的事。

## 人格

[保留原 SOUL.md 的核心人格特质 + 秘书专属补充]

## 工作流 0: 快速收集（Inbox）

[完整内容来自设计文档]

## 工作流 1: 晨间简报

[完整内容来自设计文档]

## 工作流 2: 日程管理

[完整内容来自设计文档]

## 工作流 3: 任务管理

[完整内容来自设计文档]

## 工作流 4: 目标与习惯养成

[完整内容来自设计文档]

## 工作流 5: 信息处理

[完整内容来自设计文档]

## 工作流 6: 沟通辅助

[完整内容来自设计文档]

## 工作流 7: 周复盘

[完整内容来自设计文档]

## 共享记忆

[已有的共享记忆约定]

## Workspace 文件

[说明各文件用途: inbox.md, goals.md, habits.md, projects.md, templates/]

## 边界

- 不碰营销内容（那是 Lily 的事）
- 外部操作（发邮件、创建日历事件）先展示再执行
- 深夜（23:00-07:30）不主动打扰，除非紧急
```

**注意：** SOUL.md 不要写得太长。Nanobots 每次会话开始时都要读取 SOUL.md，过长会消耗大量 token。工作流描述要精炼——写触发条件和核心行为，不写详细示例输出（Pi 会自己判断格式）。目标控制在 300 行以内。

**Step 2: 验证文件**

Run: `wc -l workspace-pi/SOUL.md`
Expected: ≤ 300 行

**Step 3: Commit**

```bash
git add workspace-pi/SOUL.md
git commit -m "feat: Pi secretary SOUL.md — 8 structured workflows"
```

---

### Task 7: 创建 HEARTBEAT.md

**Files:**

- Create: `workspace-pi/HEARTBEAT.md`

**Step 1: 创建 HEARTBEAT.md**

内容来自设计文档的 Heartbeat 配置部分：

```markdown
# Heartbeat Checklist

## 晨间简报（每天第一次 heartbeat）

如果今天还没发过晨间简报，执行工作流 1:

1. 读取 Google Calendar 今天的事件
2. 读取 Todoist 今天到期和已过期的任务
3. 检查 Gmail 未读重要邮件
4. 查天气
5. 读取 inbox.md 待安排事项
6. 读取 goals.md 当前目标进展
7. 组合成晨间简报推送给用户

## 常规巡检（每次 heartbeat）

1. Google Calendar 未来 2 小时内有事件 → 推送会议提醒 + 背景信息
2. Todoist 明天到期的任务 → 提前提醒
3. Gmail 有紧急未读邮件 → 推送摘要
4. inbox.md 有跟进日期是今天的事项 → 推送跟进提醒

## 习惯打卡（20:00 后）

检查 habits.md，如有今天未打卡的习惯 → 温和提醒一次

## 目标检查（周一 heartbeat）

读取 goals.md，按检查频率触发进度汇报

## 周复盘（周五 15:00 后）

如果本周还没做过复盘，执行工作流 7

## 无事可做

HEARTBEAT_OK
```

**Step 2: Commit**

```bash
git add workspace-pi/HEARTBEAT.md
git commit -m "feat: Pi HEARTBEAT.md — proactive check schedule"
```

---

### Task 8: 创建 workspace 数据模板文件

**Files:**

- Create: `workspace-pi/inbox.md`
- Create: `workspace-pi/goals.md`
- Create: `workspace-pi/habits.md`
- Create: `workspace-pi/projects.md`

**Step 1: 创建 4 个模板文件**

**inbox.md:**

```markdown
# Inbox

_快速收集箱。随时记录，晨间简报时安排。_
```

**goals.md:**

```markdown
# Goals

_目标追踪。Pi 会定期检查进展并提醒。_
```

**habits.md:**

```markdown
# Habits

_习惯打卡。Pi 会在晚间提醒未打卡的习惯。_
```

**projects.md:**

```markdown
# Projects

_活跃项目跟踪。/kickoff 创建的项目会自动记录在这里。_
```

**Step 2: Commit**

```bash
git add workspace-pi/inbox.md workspace-pi/goals.md workspace-pi/habits.md workspace-pi/projects.md
git commit -m "feat: workspace template files for secretary workflows"
```

---

### Task 9: 更新 .gitignore

**Files:**

- Modify: `.gitignore`

**Step 1: 添加 workspace-pi 的排除规则**

和 workspace-lily 一样，排除框架自动生成的文件和用户运行时数据，但保留我们手动维护的文件（SOUL.md, HEARTBEAT.md, 模板文件）。

在 `.gitignore` 中添加：

```
# workspace-pi auto-generated (keep SOUL.md, HEARTBEAT.md, templates)
workspace-pi/AGENTS.md
workspace-pi/TOOLS.md
workspace-pi/USER.md
workspace-pi/user-profile.md
workspace-pi/MEMORY.md
workspace-pi/BOOTSTRAP.md
workspace-pi/knowledge/
workspace-pi/memory/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore workspace-pi auto-generated files"
```

---

### Task 10: 更新 setup 脚本

**Files:**

- Modify: `scripts/setup-lily-agent.sh` → 重命名为 `scripts/setup-agents.sh`（或保持原名但扩展功能）

**背景：** 当前 setup 脚本只处理 Lily agent 的设置。需要扩展为：

1. 配置 Pi 的 heartbeat
2. 复制 Pi 的 SOUL.md 和 HEARTBEAT.md 到容器（如果容器中的版本是默认模板）
3. 复制 Pi 的 workspace 模板文件（inbox.md, goals.md 等，仅在不存在时创建）
4. 保留所有 Lily 的现有逻辑

**Step 1: 在 setup 脚本中添加 Pi heartbeat 配置**

在 nanobots.json 更新的 node 脚本中，给 Pi agent 添加 heartbeat 配置：

```javascript
// 在现有的 cfg.agents.list.push({ id: 'pi', default: true }) 之后修改为：
cfg.agents.list.push({
  id: "pi",
  default: true,
  heartbeat: {
    every: "30m",
    activeHours: {
      start: "07:30",
      end: "23:00",
      timezone: "Asia/Singapore",
    },
    target: "last",
  },
});
```

**Step 2: 添加 Pi workspace 文件部署**

在 setup 脚本中添加：

```bash
# Deploy Pi secretary workspace files
PI_WORKSPACE="/home/node/.nanobots/workspace"

echo ""
echo "Setting up Pi secretary workspace..."

# Copy SOUL.md (overwrite — this is our managed file)
docker cp workspace-pi/SOUL.md "$CONTAINER:$PI_WORKSPACE/SOUL.md"
echo "  ✓ Updated SOUL.md"

# Copy HEARTBEAT.md (overwrite — this is our managed file)
docker cp workspace-pi/HEARTBEAT.md "$CONTAINER:$PI_WORKSPACE/HEARTBEAT.md"
echo "  ✓ Updated HEARTBEAT.md"

# Create data files only if they don't exist
for f in inbox.md goals.md habits.md projects.md; do
  docker exec "$CONTAINER" sh -c "
    if [ ! -f '$PI_WORKSPACE/$f' ]; then
      cat > '$PI_WORKSPACE/$f' << 'EOF'
$(cat workspace-pi/$f)
EOF
      echo '  ✓ Created $f'
    else
      echo '  ✓ $f already exists (keeping user data)'
    fi
  "
done
```

**Step 3: Commit**

```bash
git add scripts/setup-lily-agent.sh
git commit -m "feat: setup script deploys Pi secretary config + workspace files"
```

---

### Task 11: 部署到容器并验证

**Step 1: 复制 skill 文件到容器**

```bash
# Skills 在 Docker build 时已包含在 /app/skills/，
# 但如果不想重新 build，可以手动复制
for skill in ask brainstorm kickoff parse-knowledge research; do
  docker cp skills/$skill nanobots:/app/skills/$skill
done
```

**Step 2: 部署 Pi workspace 文件**

```bash
docker cp workspace-pi/SOUL.md nanobots:/home/node/.nanobots/workspace/SOUL.md
docker cp workspace-pi/HEARTBEAT.md nanobots:/home/node/.nanobots/workspace/HEARTBEAT.md

# 模板文件（仅在不存在时）
for f in inbox.md goals.md habits.md projects.md; do
  docker exec nanobots sh -c "[ ! -f /home/node/.nanobots/workspace/$f ] && echo '创建 $f'" && \
  docker cp workspace-pi/$f nanobots:/home/node/.nanobots/workspace/$f 2>/dev/null || true
done
```

**Step 3: 更新 nanobots.json 添加 heartbeat**

```bash
docker exec nanobots node -e "
const fs = require('fs');
const p = '/home/node/.nanobots/nanobots.json';
const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
const pi = c.agents.list.find(a => a.id === 'pi');
if (pi) {
  pi.heartbeat = {
    every: '30m',
    activeHours: { start: '07:30', end: '23:00', timezone: 'Asia/Singapore' },
    target: 'last'
  };
}
fs.writeFileSync(p, JSON.stringify(c, null, 2));
console.log('Pi heartbeat configured');
"
```

**Step 4: 重启容器**

```bash
docker restart nanobots
```

**Step 5: 验证**

```bash
# 检查 SOUL.md 已更新
docker exec nanobots head -3 /home/node/.nanobots/workspace/SOUL.md

# 检查 HEARTBEAT.md 已更新
docker exec nanobots head -3 /home/node/.nanobots/workspace/HEARTBEAT.md

# 检查 skills 已安装
docker exec nanobots ls /app/skills/ask/SKILL.md /app/skills/brainstorm/SKILL.md /app/skills/kickoff/SKILL.md /app/skills/parse-knowledge/SKILL.md /app/skills/research/SKILL.md

# 检查 heartbeat 配置
docker exec nanobots node -e "
const c = JSON.parse(require('fs').readFileSync('/home/node/.nanobots/nanobots.json','utf-8'));
console.log('Pi heartbeat:', JSON.stringify(c.agents.list.find(a=>a.id==='pi').heartbeat));
"

# 检查 workspace 模板文件
docker exec nanobots ls /home/node/.nanobots/workspace/inbox.md /home/node/.nanobots/workspace/goals.md /home/node/.nanobots/workspace/habits.md /home/node/.nanobots/workspace/projects.md

# 检查日志中 heartbeat 是否启动
sleep 10 && docker logs nanobots --tail 20 2>&1 | grep -i heartbeat
```

**Step 6: Commit 最终状态**

```bash
git add -A
git commit -m "feat: Pi secretary — full deployment with skills, heartbeat, and workspace"
```

---

## 实施顺序总结

| Task | 内容                       | 依赖      |
| ---- | -------------------------- | --------- |
| 1    | 安装 ask skill             | 无        |
| 2    | 安装 brainstorm skill      | 无        |
| 3    | 安装 kickoff skill         | 无        |
| 4    | 安装 parse-knowledge skill | 无        |
| 5    | 安装 research skill        | 无        |
| 6    | 重写 Pi SOUL.md            | 无        |
| 7    | 创建 HEARTBEAT.md          | 无        |
| 8    | 创建 workspace 模板文件    | 无        |
| 9    | 更新 .gitignore            | 无        |
| 10   | 更新 setup 脚本            | Task 1-9  |
| 11   | 部署到容器并验证           | Task 1-10 |

Task 1-9 互相独立，可以并行执行。Task 10 依赖 1-9 的文件就位。Task 11 是最终部署和验证。
