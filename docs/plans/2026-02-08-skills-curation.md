# Nanobots Skills 精选分析

> 日期: 2026-02-08
> 总计: 49 个 skills → 保留 23 个，移除 26 个

## 评估标准

Nanobots 定位：面向小白用户的零配置 AI 助手，WhatsApp/Telegram 消息通道，Docker 单容器部署。

| 维度       | 说明                              |
| ---------- | --------------------------------- |
| 平台兼容性 | Docker (Linux) 环境能否运行       |
| 用户价值   | 对普通用户的实用性                |
| 配置难度   | 是否需要复杂的 API Key / 外部服务 |
| 维护成本   | 依赖的外部 CLI 工具是否可靠       |

---

## 第一类：核心保留 (14 个)

Docker 环境可用，对个人助手场景有明确价值。

| Skill              | 说明                           |
| ------------------ | ------------------------------ |
| weather            | 零配置，无需 API key，天气查询 |
| github             | `gh` CLI，开发者常用           |
| summarize          | URL/文件摘要，核心功能         |
| nano-pdf           | PDF 编辑工具                   |
| himalaya           | IMAP/SMTP 邮件管理             |
| notion             | Notion 笔记管理，只需 API key  |
| trello             | Trello 项目管理，只需 API key  |
| tmux               | 交互式终端控制                 |
| video-frames       | ffmpeg 提取视频帧              |
| blogwatcher        | RSS/博客监控                   |
| openai-whisper-api | 音频文件转录 (Whisper API)     |
| session-logs       | 搜索历史会话                   |
| skill-creator      | 创建自定义 skill 的脚手架      |
| nano-banana-pro    | Gemini 图片生成/编辑           |

## 第二类：可选保留 (9 个)

有价值但需额外服务配置，用户按需启用。

| Skill            | 配置要求              | 说明             |
| ---------------- | --------------------- | ---------------- |
| 1password        | `op` CLI              | 密码管理         |
| discord          | Bot Token             | Discord 频道集成 |
| slack            | Bot Token             | Slack 频道集成   |
| openai-image-gen | OPENAI_API_KEY        | OpenAI 图片生成  |
| sag              | ELEVENLABS_API_KEY    | 高质量 TTS       |
| sherpa-onnx-tts  | 下载模型文件          | 离线 TTS         |
| goplaces         | GOOGLE_PLACES_API_KEY | 地点搜索         |
| spotify-player   | Spotify 账号          | 音乐控制         |
| gemini           | Gemini CLI            | AI 问答分流      |

## 第三类：移除 (26 个)

### macOS 专属 (7 个)

无法在 Docker Linux 环境运行。

- apple-notes, apple-reminders, bear-notes, imsg, peekaboo, things-mac, model-usage

### 功能重叠 (4 个)

与内置功能或其他 skill 重复。

| Skill          | 重叠说明                         |
| -------------- | -------------------------------- |
| wacli          | 与内置 WhatsApp 通道重复         |
| gog            | 与 google-services 插件重复      |
| local-places   | 与 goplaces 重复，多 Python 依赖 |
| openai-whisper | 本地 Whisper 太重，API 版更实用  |

### 依赖已移除组件 (2 个)

- canvas — 需要已移除的原生客户端
- healthcheck — 依赖 OpenClaw CLI 安全审计

### 配置过于复杂 (3 个)

- bluebubbles — 需独立 iMessage 桥接服务器
- voice-call — 需 Twilio/Telnyx 电话服务
- coding-agent — 需 PTY + 多个 AI CLI

### 开发者向太强 (3 个)

普通用户几乎不会用到。

- clawhub, mcporter, oracle

### 极小众 / 价值不高 (7 个)

- blucli (Bluesound 音响), sonoscli (Sonos 音响), eightctl (Eight Sleep 床垫)
- camsnap (RTSP 摄像头), food-order + ordercli (Foodora 外卖)
- songsee (音频频谱图), gifgrep (GIF 搜索), bird (X/Twitter 爬虫)

注: gifgrep 和 bird 虽非小众产品但在消息助手场景下价值有限。

### 其他不适用 (2 个)

- obsidian — `obsidian-cli` 硬依赖 macOS 桌面 Obsidian 配置，Docker 不可用
- openhue — 需 Hue Bridge 局域网可达，Docker 网络隔离下不实用

---

## 执行结果

已删除 26 个 skill 目录:

```
skills/apple-notes/
skills/apple-reminders/
skills/bear-notes/
skills/bird/
skills/blucli/
skills/bluebubbles/
skills/camsnap/
skills/canvas/
skills/clawhub/
skills/coding-agent/
skills/eightctl/
skills/food-order/
skills/gifgrep/
skills/gog/
skills/healthcheck/
skills/imsg/
skills/local-places/
skills/mcporter/
skills/model-usage/
skills/obsidian/
skills/openai-whisper/
skills/openhue/
skills/oracle/
skills/ordercli/
skills/peekaboo/
skills/songsee/
skills/sonoscli/
skills/things-mac/
skills/voice-call/
skills/wacli/
```
