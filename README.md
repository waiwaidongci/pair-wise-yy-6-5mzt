# 磨面温升与冷却复磨准入台

由墨锭试磨室扩展而来:试磨登记、磨面温升判定、冷却复测准入与更正留痕。

运行:

```bash
npm start        # http://localhost:3037
npm test         # 端到端冒烟测试(独立端口 + 临时数据文件)
```

数据保存在 `data/ink-stick-testing.json`(可用 `DB_PATH` 环境变量覆盖)。

## 业务规则

- **试磨登记**:登记磨石、克重、时长、磨面温度和试磨人。每锭只留一条未结束(待冷却)试磨,重复或并发提交沿用首次(按 `requestId` 幂等 + 未结束去重)。
- **温升判定**:缺项、时长超过二十分钟或磨面温度达到四十五度 → 转待冷却,不计入已试磨;否则计入已试磨。
- **冷却复测**:须由试磨人之外的另一人,间隔至少二十分钟连续两次复测,两次均不高于三十五度且温差不超过二度,才准入复磨。
- **更正**:更正磨石、克重或磨面温度会使已获得的准入失效(回到待冷却,需重新复测),旧值保留在更正记录中。已合格的试磨不支持更正。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `server.js` | 启动入口 |
| `src/routes.js` | 入口:HTTP 路由,请求解析与响应 |
| `src/domain.js` | 判定:登记、温升、复测准入、更正等业务规则 |
| `src/store.js` | 存储:JSON 持久化,写事务串行化 |
| `src/page.js` | 单页视图(列表、统计、履历均取自同一数据源,刷新后一致) |

## API

- `GET /api/items` / `GET /api/items/:id` / `GET /api/stats`
- `POST /api/items` 建档
- `POST /api/items/:id/sessions` 试磨登记(支持 `requestId` 幂等)
- `POST /api/items/:id/sessions/:sid/rechecks` 冷却复测 `{ temp, by, at? }`
- `POST /api/items/:id/sessions/:sid/corrections` 更正 `{ field: stone|weight|surfaceTemp, value, by? }`
- `POST /api/items/:id/logs` 追加履历备注
