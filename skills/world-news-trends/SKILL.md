---
name: world-news-trends
description: "Fetch and analyze international news trends from BBC, Al Jazeera, CNA, TechCrunch and more via RSS. Use when user asks about world news, international headlines, global trends, what's happening in the world. 关键词：国际新闻、世界新闻、全球热点、国际头条、海外新闻、BBC新闻、科技新闻、亚洲新闻、世界大事、全球新闻。"
metadata: { "openclaw": { "requires": { "bins": ["python3"] } } }
---

# World News Trends Skill

从 BBC、Al Jazeera、CNA (Channel NewsAsia)、TechCrunch、Ars Technica 等国际新闻源聚合 RSS 数据，按时间排序、去重后呈现全球热点趋势。

## 获取新闻数据

```bash
python3 {baseDir}/scripts/fetch_world_news.py [--section SECTION...] [--max N] [--json] [--list]
```

### Parameters

- **`--section / -s`**: 按分区过滤，可多选。可选值：`world` `asia` `tech` `business` `science`
- **`--max N`**: 最多返回 N 条（默认 30）
- **`--json`**: 输出 JSON 格式
- **`--list`**: 列出所有可用的数据源和分区

### Sections

| Section    | Description     | Sources                                                           |
| ---------- | --------------- | ----------------------------------------------------------------- |
| `world`    | World & General | BBC World, BBC Top Stories, Al Jazeera, BBC Middle East/Europe/US |
| `asia`     | Asia & SEA      | BBC Asia, CNA (Channel NewsAsia), CNA Singapore                   |
| `tech`     | Technology      | BBC Tech, TechCrunch, Ars Technica                                |
| `business` | Business        | BBC Business                                                      |
| `science`  | Science         | BBC Science & Environment                                         |

### Examples

```bash
# 获取所有分区的前 30 条（默认）
python3 {baseDir}/scripts/fetch_world_news.py

# 只看亚洲新闻
python3 {baseDir}/scripts/fetch_world_news.py -s asia --max 20

# 科技 + 商业新闻，JSON 格式
python3 {baseDir}/scripts/fetch_world_news.py -s tech business --max 15 --json

# 全球综合新闻前 10 条
python3 {baseDir}/scripts/fetch_world_news.py -s world --max 10
```

## Behavior Guidelines

1. 用户问"国际新闻"/"世界新闻"/"全球热点"时，运行脚本获取数据。
2. 根据用户兴趣选择合适的 section：
   - 泛问"最近有什么大事" → 默认所有分区
   - "科技新闻" → `-s tech`
   - "亚洲/东南亚新闻" → `-s asia`
3. 获取数据后，自行分析并呈现：
   - **按区域/主题分类汇总**
   - **重大事件优先**：突发新闻、地缘政治、重大政策变动
   - **简明摘要**：每条新闻 1-2 句话概括
4. 用户说中文则用中文翻译呈现，说英文则用英文。
5. 不要原封不动列出全部数据——提炼重点是核心价值。

## Notes

- **无需认证**：所有数据源均为公开 RSS feed。
- **并行抓取**：多个 RSS 源同时获取，速度快。
- **自动去重**：跨源重复新闻自动合并。
- **时间排序**：最新新闻排在最前。
