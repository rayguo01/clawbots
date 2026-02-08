# Nanobots - Development Context

Personal AI assistant via WhatsApp + Telegram. Forked from openclaw, pruned to core agent + messaging.

## Project Structure

- `src/` - Core source code (TypeScript, Pi agent framework)
- `extensions/` - Plugin extensions
  - `web-setup/` - Web-based setup wizard (port 8080)
  - `google-services/` - Google Calendar + Gmail tools
  - `telegram/` - Telegram channel plugin
  - `whatsapp/` - WhatsApp channel plugin (Baileys)
  - `memory-core/` - Persistent memory plugin
- `skills/` - Agent skill definitions
- `scripts/` - Build and dev scripts

## Key Conventions

- Plugin API: `OpenClawPluginApi` from `openclaw/plugin-sdk`
- Tools use `AgentTool` from `@mariozechner/pi-agent-core` with `@sinclair/typebox` schemas
- Config: JSON5 format at `~/.nanobots/nanobots.json` (falls back to `.openclaw/openclaw.json`)
- HTTP routes registered via `api.registerHttpRoute({ path, handler })`
- Default port: 8080

## Commands

```bash
pnpm dev          # Dev mode
pnpm gateway:dev  # Gateway only (skips channels)
pnpm test         # Run tests
pnpm build        # Production build
```
