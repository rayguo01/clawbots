# OpenClaw 社区 Skill 调研

调研日期: 2026-02-10
来源: nanobots/temp/ 目录下的社区 Skill

## 调研总结

分析了 7 个 Skill，涵盖不同场景和实现模式。大部分面向欧美市场，与东南亚/中国市场适配度低。

## Skill 列表

| Skill                  | 版本   | 类型            | 认证                 | 代码量                | 东南亚/中国适用           |
| ---------------------- | ------ | --------------- | -------------------- | --------------------- | ------------------------- |
| postiz-extended        | 1.3.0  | 社交媒体调度    | Email/Password       | 566 行 Python         | ❌ 不支持微信/LINE/微博等 |
| radarr-sonarr          | 1.0.3  | 影视下载管理    | API Key              | 1335 行 Python        | ❌ 极niche，自部署用户    |
| openpet                | 1.0.0  | 虚拟宠物游戏    | 无                   | 0 行（纯 Prompt）     | ✅ 语言无关               |
| soulmate               | 1.0.0  | AI 恋爱模拟     | 无                   | 561 行 TypeScript     | ⚠️ 中文内容，但伦理风险   |
| openclaw-minecraft     | 0.1.26 | MC Bot 控制     | JWT                  | 0 行（纯 Prompt+API） | ❌ 极niche                |
| amazon-product-search  | 0.1.0  | 商品数据抓取    | API Key (BrowserAct) | 105 行 Python         | ❌ Amazon非东南亚主流     |
| camelcamelcamel-alerts | 1.0.0  | Amazon 降价提醒 | 无 (RSS URL)         | 157 行 Python         | ❌ 仅 Amazon              |
| luma                   | 1.0.0  | 活动搜索        | 无                   | 201 行 Python         | ⚠️ 新加坡有 Luma 活动     |

## Skill 实现模式分类

### 1. 纯 Prompt-driven（无代码）

- **openpet**: SKILL.md 定义游戏规则，AI 按规则读写 JSON 文件
- **openclaw-minecraft**: SKILL.md + CRON_PROMPT.md 定义自主循环，AI 用 curl 调 API
- 优点: 开发成本极低，灵活
- 缺点: AI 数学计算不可靠，无法保证一致性

### 2. 纯代码

- **radarr-sonarr**: 完整 Python CLI，含 NLP 解析器
- **amazon-product-search**: Python 脚本调 BrowserAct API
- **camelcamelcamel-alerts**: Python RSS 抓取 + Bash 通知
- **luma**: Python 爬虫抓 Next.js SSR 数据
- 优点: 可靠、可测试
- 缺点: 开发成本高

### 3. 混合模式（代码 + Prompt）

- **soulmate**: TypeScript 处理状态/计算 + soul-patch.md 注入 AI 人格
- **postiz-extended**: Python 脚本 + SKILL.md 定义自然语言触发
- 优点: 确定性逻辑用代码，创意内容用 Prompt，各取所长

## 触发方式分类

| 方式           | 示例                                          | 影响范围             |
| -------------- | --------------------------------------------- | -------------------- |
| 自然语言关键词 | openpet ("feed pet"), luma ("tech events")    | 仅匹配到的消息       |
| 斜杠命令       | soulmate (/soulmate start)                    | 显式触发             |
| Cron 定时      | minecraft (每30秒), camelcamelcamel (每4小时) | 自动执行             |
| 人格接管       | soulmate (激活后改变整个 Agent 人格)          | 全局影响所有消息     |
| CLI 参数       | radarr-sonarr, luma                           | Agent 构造命令行调用 |

## 对 Nanobots 的参考价值

### 值得借鉴的模式

1. **Cron 自主循环** (minecraft): 观察→判断→规划→执行→记录，可用于定时任务
2. **混合模式** (soulmate): 代码处理逻辑 + Prompt 处理创意
3. **数据持久化** (luma): 抓取后存 memory JSON，后续从缓存回答
4. **package.json triggers** (luma): 显式定义触发关键词列表

### 东南亚/中国市场的 Skill 方向

- 社交媒体: 需要支持 LINE (泰国/日本)、WeChat、微博、小红书，而非 X/LinkedIn
- 电商: Shopee、Lazada、淘宝/京东，而非 Amazon
- 地图: 高德(已有)、Google Maps(东南亚)，而非仅 Google Places
- 活动: Luma 在新加坡有一定用户群，但中国需要活动行/互动吧等
- 支付: GrabPay、Touch'n Go、微信支付、支付宝
- 外卖/打车: Grab、GoJek、美团、滴滴
- 消息: WhatsApp(东南亚主流，已有)、Telegram(已有)、LINE(待集成)、微信(待集成)
