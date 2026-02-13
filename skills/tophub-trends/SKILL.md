---
name: tophub-trends
description: "获取 TopHub 热榜数据，分析热点趋势，提供内容创作选题建议。用户提到热榜、热搜、热点趋势、今天什么火、选题灵感、内容创作、今日热点、热门话题时使用。Keywords: trending, hot topics, TopHub, viral, content ideas, what's trending. 关键词：热榜、热搜、热点趋势、今天什么火、选题灵感、今日热点、热门话题。"
metadata: { "openclaw": { "requires": { "bins": ["python3"] } } }
---

# TopHub 热榜分析 Skill

从 TopHub (tophub.today) 获取实时热榜数据。TopHub 聚合了知乎、微博、B站、抖音、百度等中文平台的热门话题。

## 获取热榜数据

```bash
python3 {baseDir}/scripts/fetch_tophub.py [--max N] [--json]
```

### Parameters

- **`--max N`**: 最多返回 N 条（默认 50）
- **`--json`**: 输出 JSON 格式（默认人类可读格式）

### Examples

```bash
# 获取前 30 条热榜
python3 {baseDir}/scripts/fetch_tophub.py --max 30

# 获取 JSON 格式用于进一步分析
python3 {baseDir}/scripts/fetch_tophub.py --max 30 --json
```

## Behavior Guidelines

1. 用户问"今天有什么热点"/"最近什么火"/"热搜"时，运行脚本获取数据。
2. 默认获取前 30 条（`--max 30`），除非用户要求更多。
3. 获取数据后，自行分析并呈现：
   - **分类汇总**：按类别分组（科技、娱乐、社会、体育等）
   - **高潜力话题**：挑出 5-8 个最具传播潜力的话题，说明原因
   - **选题建议**（如用户是内容创作者）：给出角度、标题建议、创作方向
4. 用简洁的中文呈现结果。如用户说英文，用英文回复。
5. 不要原封不动地列出全部数据——提炼和分析是核心价值。

## Notes

- **无需认证**：TopHub 热榜页面是公开的。
- **数据源**：聚合知乎、微博、B站、抖音、百度、头条等中文平台。
- **适用场景**：内容创作选题、热点追踪、社交媒体运营、市场洞察。
