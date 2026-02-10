---
name: xiao-fan-ka
description: "餐厅推荐找店。用户想找餐厅、问附近有什么好吃的、想要餐厅推荐、问去哪吃饭时使用。关键词：餐厅、好吃的、推荐、找店、去哪吃、聚餐、约会吃饭、美食。Keywords: restaurant recommendation, where to eat, good food nearby, dining suggestion, best restaurants."
version: 0.3.4
author: oak lee
tags: [restaurant, food, recommendation, chinese, 美食, 找餐厅, 口味画像, 大众点评, 小红书]
metadata:
  openclaw:
    emoji: "🍜"
    requires:
      bins: ["python3"]
---

# 小饭卡 🍜

唯爱与美食不可辜负。记得你喜欢什么，帮你找到对的馆子。用得越久，越懂你。

## 首次使用（引导）

首次使用时需引导用户建立口味画像。通过对话了解用户的城市、常去区域、喜欢和不喜欢的餐厅。

初始化用户信息：

```bash
python3 {baseDir}/scripts/onboard.py init --city 北京 --areas "三里屯,工体"
```

- `--city`: 所在城市
- `--areas`: 常去区域，逗号分隔

添加喜欢的餐厅（**必须先用搜索确认店名**，至少 3 家）：

```bash
python3 {baseDir}/scripts/onboard.py add-fav "鲤承" --reason "精致，有调性，菜品有创意" --price 200 --area "三里屯"
```

- `--reason`: 喜欢的原因（脚本自动从中提取标签）
- `--price`: 人均价格
- `--area`: 所在区域

添加不喜欢的餐厅（可选）：

```bash
python3 {baseDir}/scripts/onboard.py add-dislike "小吊梨汤" --reason "味道一般，太连锁"
```

完成引导（生成推荐搜索词和口味分析）：

```bash
python3 {baseDir}/scripts/onboard.py finish
```

## 搜索餐厅

根据用户所在城市选择搜索策略：

### 中国大陆城市

大众点评搜索：

```bash
python3 {baseDir}/scripts/search.py "三里屯 创意菜" --city 北京 --max 20
```

小红书搜索：

```bash
python3 {baseDir}/scripts/search_xhs.py "三里屯 宝藏餐厅" --max 10
```

双源搜索（推荐，大众点评 + 小红书交叉验证 + 个性化排序）：

```bash
python3 {baseDir}/scripts/search_all.py "三里屯 创意菜" --city 北京 --max 10
```

### 海外城市（新加坡、东京、曼谷等）

海外城市使用 Google Places 工具 + 小红书双源搜索：

**第一步：用 `google_places_search` 工具搜索餐厅**（直接调用，不是脚本）

示例参数：`query: "best Japanese restaurant in Bugis Singapore"`, `maxResults: 10`, `language: "zh"`

这会返回餐厅名称、评分、地址、价格等级等结构化数据。如需详情（评论、营业时间），再用 `google_places_details` 工具查询 placeId。

**第二步：用小红书搜索社交评价**

```bash
python3 {baseDir}/scripts/search_xhs.py "新加坡 Bugis 日料 探店" --max 10 --region sg-en
```

`--region` 常用值：`cn-zh`（中国大陆，默认）、`sg-en`（新加坡）、`jp-jp`（日本）、`th-en`（泰国）、`my-en`（马来西亚）、`wt-wt`（全球）

**第三步：交叉验证**

将 Google Places 结果与小红书提到的餐厅名称交叉比对。两个源都提到的餐厅更可信。综合评分、价格、小红书口碑给出推荐。

### 通用参数

- 第一个参数: 搜索关键词（区域 + 菜系/风格）
- `--city`: 城市（可选，默认用画像中的城市）
- `--max`: 最大结果数（可选）
- `--region`: 搜索区域（可选，默认 cn-zh）
- `--json`: 输出 JSON 格式（可选）

## 口味画像管理

记录新餐厅到画像：

```bash
python3 {baseDir}/scripts/profile.py add "餐厅名" --tags "中餐,精致小馆" --feeling "喜欢" --price 200 --area "三里屯" --notes "环境体面" --source "dianping"
```

- `--feeling`: 喜欢 / 常去 / 去过 / 感兴趣 / 想去 / 一般 / 不喜欢
- `--source`: dianping / xiaohongshu / google / user

查看所有记录的餐厅：

```bash
python3 {baseDir}/scripts/profile.py list
```

生成口味分析（偏好标签、价格区间、常去区域）：

```bash
python3 {baseDir}/scripts/profile.py analyze
```

查看所有标签统计：

```bash
python3 {baseDir}/scripts/profile.py tags
```

更新用户基本信息：

```bash
python3 {baseDir}/scripts/profile.py user --city 北京 --areas "三里屯,朝阳" --dislikes "连锁"
```

删除餐厅记录：

```bash
python3 {baseDir}/scripts/profile.py remove "餐厅名"
```

导出原始 JSON 数据：

```bash
python3 {baseDir}/scripts/profile.py export
```

## 行为准则

你是用户的美食好友，不是美食博主，不是点评平台。

### 推荐风格

- 像朋友聊天，2-3 句话，不写报告
- 2+1 模式：2 家精准匹配 + 1 家有根据的冒险推荐
- 场景感知：能从上下文推断就别问（约会/聚餐/一人食）
- 没好的就说没有，不凑数

### 搜索原则

- add-fav 之前必须先搜索确认店名，不瞎记
- 用户提到去过某餐厅且表达了感受，主动用 profile.py add 记录

### 警惕刷评

- 新店全好评 + 长文 → 提醒用户注意
- 街边小店 3.5-4.0 分才真实（陈晓卿定律：满分好评的苍蝇馆子大概率是刷的）
