# Nanobots

Personal AI assistant via WhatsApp and Telegram. Zero-config, single-container deployment.

## Quick Start

```bash
docker compose up -d
```

Open `http://localhost:8080` to configure via the web setup wizard.

## Features

- **Messaging**: WhatsApp (QR code login) + Telegram (Bot Token)
- **AI Models**: Anthropic Claude, OpenAI, Google Gemini
- **Google Services**: Calendar and Gmail tools via OAuth
- **Skills**: Extensible skill system for custom agent behaviors
- **Plugins**: Plugin architecture for adding tools, hooks, and channels
- **Memory**: Persistent conversation memory across sessions
- **Web Setup**: Browser-based configuration wizard at port 8080

## Configuration

### Environment Variables

| Variable                        | Description                | Default       |
| ------------------------------- | -------------------------- | ------------- |
| `NANOBOTS_GATEWAY_TOKEN`        | Gateway auth token         | `changeme`    |
| `NANOBOTS_PORT`                 | HTTP port                  | `8080`        |
| `NANOBOTS_STATE_DIR`            | Data directory             | `~/.nanobots` |
| `NANOBOTS_GOOGLE_CLIENT_ID`     | Google OAuth client ID     | -             |
| `NANOBOTS_GOOGLE_CLIENT_SECRET` | Google OAuth client secret | -             |

Legacy `OPENCLAW_*` environment variables are also supported.

### Docker Compose

```yaml
services:
  nanobots:
    build: .
    container_name: nanobots
    ports:
      - "8080:8080"
    volumes:
      - nanobots-data:/home/node/.nanobots
    environment:
      - NANOBOTS_GATEWAY_TOKEN=your-secret-token
    restart: unless-stopped

volumes:
  nanobots-data:
```

## Development

```bash
pnpm install
pnpm dev          # Start in dev mode
pnpm gateway:dev  # Start gateway only
pnpm test         # Run tests
pnpm build        # Build for production
```

## Architecture

Built on the Pi agent framework with a plugin-based extension system:

- **Gateway**: HTTP server serving Web UI, API endpoints, and plugin routes
- **Channels**: WhatsApp (Baileys) and Telegram (grammY)
- **Plugins**: Extensions register tools, hooks, HTTP routes, and services
- **Web Setup**: Browser-based wizard for initial configuration

## License

MIT
