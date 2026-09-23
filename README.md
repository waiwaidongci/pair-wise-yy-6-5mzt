# 墨锭试磨室 · 磨面温升与冷却复磨准入台

运行：

```bash
npm start
```

访问 `http://localhost:3037`。数据保存在 `data/ink-stick-testing.json`。

## 业务规则

- **试磨登记**：登记磨石、克重、时长、磨面温度、试磨人五项；缺项、时长超过 20 分钟或磨面温度达到 45℃ 即转「待冷却」，不计入已试磨。
- **唯一未结束试磨**：每锭只留一条未结束试磨；重复或并发提交沿用首次（表单带 `submissionId` 去重，写入串行化）。
- **冷却复测**：另一人（非试磨人）隔 20 分钟连续两次复测，温度均不高于 35℃ 且差不超过 2℃ 才「准予复磨」；温度超标或换人会中断连续计次。
- **更正失效**：更正磨石、克重或磨面温度会令复磨准入立即失效，旧值保留在记录的 `corrections` 中，复测重新计次。
- **一致性**：列表、统计与履历均由同一份存储实时计算，刷新后一致。

## 代码结构（入口 / 判定 / 存储分离）

- `server.js` — 启动入口
- `src/entry.js` — 入口层：HTTP 路由与请求响应
- `src/judgment.js` — 判定层：试磨判定、冷却复测准入、更正与准入失效
- `src/store.js` — 存储层：JSON 文件读写与串行事务
- `src/page.js` — 页面模板

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/items` | 墨锭列表（含试磨记录、冷却状态、履历） |
| POST | `/api/items` | 新增墨锭 |
| PATCH | `/api/items/:id` | 更新基础信息/状态 |
| POST | `/api/items/:id/logs` | 追加备注 |
| POST | `/api/items/:id/grindings` | 试磨/复磨登记（`stone`、`weightGrams`、`minutes`、`surfaceTemp`、`tester`、`submissionId`） |
| POST | `/api/items/:id/rechecks` | 冷却复测（`by`、`temp`，可选 `at`） |
| POST | `/api/items/:id/corrections` | 更正磨石/克重/磨面温度（`grindingId`、`by`） |
| GET | `/api/stats` | 状态统计 |
