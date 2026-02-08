# Nanobots

Personal AI assistant via WhatsApp and Telegram. Zero-config, single-container deployment.

## Getting Started

### Option A: Docker (Recommended)

**Prerequisites:** Docker and Docker Compose installed.

**1. Start the container**

```bash
git clone <repo-url> nanobots && cd nanobots
docker compose up -d
```

First launch will build the image (~5 min). Subsequent starts are instant.

**2. Open the setup wizard**

Visit [http://localhost:8080/web](http://localhost:8080/web) in your browser.

**3. Configure a messaging channel**

Choose one or both:

- **Telegram**: Create a bot via [@BotFather](https://t.me/BotFather), paste the Bot Token and your User ID (get it from [@userinfobot](https://t.me/userinfobot))
- **WhatsApp**: Scan the QR code displayed in the wizard with your WhatsApp app

**4. Configure an AI model**

Choose a provider and enter your API key:

| Provider  | Get API Key                                                   |
| --------- | ------------------------------------------------------------- |
| Anthropic | [console.anthropic.com](https://console.anthropic.com/)       |
| OpenAI    | [platform.openai.com](https://platform.openai.com/api-keys)   |
| Google    | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

**5. Start chatting**

Send a message to your bot on Telegram or WhatsApp. The assistant is ready.

### Option B: Local Development

**Prerequisites:** Node.js 22+, pnpm 10+.

```bash
git clone <repo-url> nanobots && cd nanobots
pnpm install
pnpm dev
```

The gateway starts at `http://localhost:8080`. Open `/web` to configure.

For gateway-only mode (skip messaging channels, useful for developing the web UI):

```bash
pnpm gateway:dev
```

### Verifying the Setup

After configuration, you can verify the system status:

- **Web UI**: Visit `http://localhost:8080/web` - the wizard shows a green checkmark when all steps are complete
- **Settings**: Visit `http://localhost:8080/web#settings` to manage OAuth connections and service settings
- **Logs** (Docker): `docker compose logs -f nanobots`

## Features

- **Messaging**: WhatsApp (QR code login) + Telegram (Bot Token)
- **AI Models**: Anthropic Claude, OpenAI, Google Gemini
- **Google Services**: Calendar and Gmail tools via OAuth
- **Skills**: 23 built-in skills (weather, summarize, PDF tools, GitHub, email, etc.)
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

### Optional: Google Calendar & Gmail

To enable Google services (Calendar events, Gmail), you need a Google OAuth app:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:8080/api/oauth/callback` as an authorized redirect URI
4. Set the environment variables:

```bash
NANOBOTS_GOOGLE_CLIENT_ID=your-client-id
NANOBOTS_GOOGLE_CLIENT_SECRET=your-client-secret
```

5. Connect in the web UI: `http://localhost:8080/web#settings`

## Development

```bash
pnpm install
pnpm dev          # Start in dev mode (auto-rebuilds)
pnpm gateway:dev  # Start gateway only (skip channels)
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
