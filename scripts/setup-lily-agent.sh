#!/bin/bash
# Setup Lily marketing agent in nanobots config.
# Run this AFTER registering a Telegram bot for Lily via @BotFather.
#
# Usage: ./scripts/setup-lily-agent.sh <lily-bot-token>
#
# This script updates nanobots.json inside the running container to:
# 1. Add 'pi' (default) and 'lily' agents to agents.list
# 2. Add bindings to route telegram accounts to agents
# 3. Add lily telegram account to channels.telegram.accounts
# 4. Configure memory.qmd.paths (knowledge + shared collections)
# 5. Copy knowledge-config.json from Pi to Lily
# 6. Create shared memory directory with initial files

set -euo pipefail

LILY_BOT_TOKEN="${1:-}"
if [ -z "$LILY_BOT_TOKEN" ]; then
  echo "Usage: $0 <lily-telegram-bot-token>"
  echo ""
  echo "Steps:"
  echo "  1. Open Telegram, message @BotFather"
  echo "  2. Send /newbot"
  echo "  3. Name: Lily Marketing"
  echo "  4. Username: <your_lily_bot> (must end in 'bot')"
  echo "  5. Copy the token and run this script with it"
  exit 1
fi

CONTAINER="nanobots"
CONFIG_PATH="/home/node/.nanobots/nanobots.json"

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "Error: Container '${CONTAINER}' is not running."
  echo "Run: docker compose up -d --build"
  exit 1
fi

echo "Reading current config..."
CURRENT_CONFIG=$(docker exec "$CONTAINER" cat "$CONFIG_PATH")

echo "Updating config with Lily agent..."
UPDATED_CONFIG=$(echo "$CURRENT_CONFIG" | docker exec -e "LILY_TOKEN=$LILY_BOT_TOKEN" -i "$CONTAINER" node -e "
let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  const cfg = JSON.parse(input);

  // Add agents.list if not exists
  if (!cfg.agents) cfg.agents = {};
  if (!cfg.agents.list) cfg.agents.list = [];

  // Remove existing pi/lily entries to avoid duplicates
  cfg.agents.list = cfg.agents.list.filter(a => a.id !== 'pi' && a.id !== 'lily');

  // Add pi (default agent)
  cfg.agents.list.push({
    id: 'pi',
    default: true
  });

  // Add lily agent with skills whitelist
  cfg.agents.list.push({
    id: 'lily',
    skills: [
      'deep-research',
      'baoyu-url-to-markdown',
      'nano-banana-pro',
      'tophub-trends',
      'world-news-trends',
      'copywriting',
      'copy-editing',
      'social-content',
      'baoyu-xhs-images',
      'baoyu-cover-image',
      'baoyu-infographic',
      'baoyu-article-illustrator',
      'marketing-psychology',
      'pricing-strategy',
      'launch-strategy'
    ]
  });

  // Add bindings
  if (!cfg.bindings) cfg.bindings = [];
  // Remove existing pi/lily telegram bindings
  cfg.bindings = cfg.bindings.filter(b =>
    !(b.match && b.match.channel === 'telegram' && (b.agentId === 'pi' || b.agentId === 'lily'))
  );
  cfg.bindings.push({
    agentId: 'pi',
    match: { channel: 'telegram' }
  });
  cfg.bindings.push({
    agentId: 'lily',
    match: { channel: 'telegram', accountId: 'lily' }
  });

  // Add telegram lily account
  if (!cfg.channels) cfg.channels = {};
  if (!cfg.channels.telegram) cfg.channels.telegram = {};
  if (!cfg.channels.telegram.accounts) cfg.channels.telegram.accounts = {};
  cfg.channels.telegram.accounts.lily = {
    name: 'Lily Marketing',
    botToken: process.env.LILY_TOKEN,
    enabled: true,
    dmPolicy: 'pairing'
  };

  // Configure QMD memory paths: add knowledge/ and shared/ collections
  if (!cfg.memory) cfg.memory = {};
  if (!cfg.memory.qmd) cfg.memory.qmd = {};
  if (!cfg.memory.qmd.paths) cfg.memory.qmd.paths = [];
  // Remove existing knowledge/shared entries to avoid duplicates
  cfg.memory.qmd.paths = cfg.memory.qmd.paths.filter(p =>
    p.name !== 'knowledge' && p.name !== 'shared'
  );
  // knowledge: workspace-relative, resolves to each agent's own knowledge/ dir
  cfg.memory.qmd.paths.push({
    name: 'knowledge',
    path: 'knowledge',
    pattern: '**/*.md'
  });
  // shared: absolute path, same directory for all agents
  cfg.memory.qmd.paths.push({
    name: 'shared',
    path: '/home/node/.nanobots/shared',
    pattern: '**/*.md'
  });

  console.log(JSON.stringify(cfg, null, 2));
});
")

echo "Writing updated config..."
echo "$UPDATED_CONFIG" | docker exec -i "$CONTAINER" sh -c "cat > $CONFIG_PATH"

# Copy knowledge-config.json from Pi's workspace to Lily's workspace
PI_KNOWLEDGE_CONFIG="/home/node/.nanobots/workspace/knowledge/knowledge-config.json"
LILY_KNOWLEDGE_DIR="/home/node/.nanobots/workspace-lily/knowledge"

echo ""
echo "Setting up Lily's knowledge base config..."
if docker exec "$CONTAINER" test -f "$PI_KNOWLEDGE_CONFIG"; then
  docker exec "$CONTAINER" mkdir -p "$LILY_KNOWLEDGE_DIR"
  docker exec "$CONTAINER" cp "$PI_KNOWLEDGE_CONFIG" "$LILY_KNOWLEDGE_DIR/knowledge-config.json"
  echo "  ✓ Copied knowledge-config.json from Pi's workspace"
else
  echo "  ⚠ Pi's knowledge base not configured yet."
  echo "    Set up knowledge base via WebUI first, then re-run this script."
  echo "    (Lily can still work, but won't be able to save brand files to Google Drive)"
fi

# Create shared memory directory with initial files
SHARED_DIR="/home/node/.nanobots/shared"

echo ""
echo "Setting up shared memory directory..."
docker exec "$CONTAINER" mkdir -p "$SHARED_DIR"

# Create initial shared files if they don't exist
docker exec "$CONTAINER" sh -c "
if [ ! -f '$SHARED_DIR/USER-PROFILE.md' ]; then
  cat > '$SHARED_DIR/USER-PROFILE.md' << 'TMPL'
# User Profile

_Shared across all agents. Any agent can update this when learning new user info._

## Identity
- **Name:**
- **Location:**
- **Timezone:**

## Business
- **Company:**
- **Role:**
- **Industry:**

## Preferences
- **Language:**
- **Communication style:**
TMPL
  echo '  ✓ Created USER-PROFILE.md'
fi

if [ ! -f '$SHARED_DIR/cross-context.md' ]; then
  cat > '$SHARED_DIR/cross-context.md' << 'TMPL'
# Cross-Agent Context

_Append-only log of events that other agents should know about._
_Format: ## YYYY-MM-DD [AgentName] Event Title_

---
TMPL
  echo '  ✓ Created cross-context.md'
fi

if [ ! -f '$SHARED_DIR/decisions.md' ]; then
  cat > '$SHARED_DIR/decisions.md' << 'TMPL'
# Key Decisions

_Append-only log of important decisions that affect multiple agents._
_Format: ## YYYY-MM-DD [AgentName] Decision Title_

---
TMPL
  echo '  ✓ Created decisions.md'
fi
"

echo ""
echo "Lily agent configured successfully!"
echo ""
echo "Config changes:"
echo "  - agents.list: added 'pi' (default) + 'lily' (marketing)"
echo "  - bindings: pi -> telegram (default), lily -> telegram/lily"
echo "  - channels.telegram.accounts.lily: bot token set"
echo "  - knowledge-config: shared from Pi's workspace"
echo "  - memory.qmd.paths: added knowledge + shared collections"
echo "  - shared/: cross-agent memory directory created"
echo ""
echo "Telegram channel needs restart to pick up new account."
echo "Run: docker restart nanobots"
echo ""
echo "After restart, message your Lily bot on Telegram to test!"
