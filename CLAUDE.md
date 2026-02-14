# Nanobots - Development Context

Personal AI assistant via WhatsApp + Telegram. Forked from openclaw, pruned to core agent + messaging.

## Project Structure

- `src/` - Core source code (TypeScript, Pi agent framework)
- `extensions/` - Plugin extensions
  - `web-setup/` - Web-based setup wizard (port 8080)
  - `google-services/` - Google Calendar + Gmail + Drive tools
  - `todoist/` - Todoist task management (OAuth)
  - `notion/` - Notion pages/databases (OAuth)
  - `spotify/` - Spotify playback/search (OAuth)
  - `google-places/` - Google Places search (API Key)
  - `amap/` - 高德地图 (API Key)
  - `knowledge-base/` - Knowledge sync (Google Drive, Notion)
  - `telegram/` - Telegram channel plugin
  - `whatsapp/` - WhatsApp channel plugin (Baileys)
  - `memory-core/` - Persistent memory plugin
- `skills/` - Agent skill definitions
- `scripts/` - Build and dev scripts
- `docs/dev-guide/` - 开发经验和指南

## Key Conventions

- Plugin API: `OpenClawPluginApi` from `openclaw/plugin-sdk`
- Tools use `AgentTool` from `@mariozechner/pi-agent-core` with `@sinclair/typebox` schemas
- Config: JSON5 format at `~/.nanobots/nanobots.json` (falls back to `.openclaw/openclaw.json`)
- HTTP routes registered via `api.registerHttpRoute({ path, handler })`
- Default port: 8080
- WebUI 前端: `extensions/web-setup/public/` (vanilla ES5 JS, no framework)
- OAuth 核心: `extensions/web-setup/src/oauth/` (core.ts, store.ts, providers.ts, routes.ts)
- 部署命令: `pnpm ship` (docker compose up -d --build + docker image prune -f)

## Key Architecture

- 单容器 Docker 部署，Web 设置向导替代配置文件编辑
- Gateway HTTP server + Plugin HTTP Route 机制服务 Web UI
- Extensions 不能 import `../../../src/` 相对路径（Docker 只有 dist/），必须用 `openclaw/plugin-sdk`
- Plugin SDK exports: `src/plugin-sdk/index.ts` 需要导出所有 extensions 依赖的符号
- 所有用户配置数据必须存储在 `resolveStateDir()` 路径下（Docker named volume 持久化）
- Config reload: `config-reload.ts` 未匹配的 path 默认触发 full gateway restart，新增 config 字段务必加对应 rule

## Commands

```bash
pnpm dev          # Dev mode
pnpm gateway:dev  # Gateway only (skips channels)
pnpm test         # Run tests
pnpm build        # Production build
pnpm ship         # Deploy: docker compose up -d --build + prune
```

## 必读开发经验（开始新任务前请查阅）

- `docs/dev-guide/lessons-learned.md` — 开发经验教训（16 个案例），涵盖媒体发送、Skills Snapshot、Gmail、Docker 构建、Config Reload、WebUI OAuth 弹窗、Telegram 重连、Workspace 路径、X Cookie 持久化等问题的根因分析和修复方案
- `docs/dev-guide/skill-integration-guide.md` — Skill 集成完整指南（7 步流程），从分析→改写 SKILL.md→安装→验证→WebUI→部署→测试
- `docs/dev-guide/skill-research.md` — OpenClaw 社区 Skill 调研，7 个 Skill 的实现模式、触发方式、市场适配分析

## 架构文件

- `docs/plans/architecture.md` — openclaw 原项目的架构说明文件
- `docs/plans/2026-02-07-nanobots-design.md` — Nanobots 设计文档
- `docs/plans/2026-02-07-nanobots-phase1-implementation.md` — Phase 1 实施计划（已完成）
- `docs/plans/2026-02-07-nanobots-phase2-4-implementation.md` — Phase 2-4 实施计划
