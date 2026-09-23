// 端到端冒烟测试:独立端口 + 临时数据文件,不影响真实数据。
import http from "node:http";
import { rm } from "node:fs/promises";

process.env.DB_PATH = `/tmp/ink-stick-smoke-${process.pid}.json`;
const { route } = await import("../src/routes.js");

const server = http.createServer((req, res) => { route(req, res); });
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("PASS", name); }
  else { failed++; console.log("FAIL", name, extra ?? ""); }
}
async function api(path, options) {
  const res = await fetch(base + path, options?.body
    ? { ...options, headers: { "Content-Type": "application/json" } }
    : options);
  return { status: res.status, data: await res.json() };
}
const post = (path, obj) => api(path, { method: "POST", body: JSON.stringify(obj) });

const stamp = Date.now().toString(36);
const code = "T-" + stamp;

// 建档
let r = await post("/api/items", { code, smokeSource: "测试烟", glueRatio: "7%", ageYears: 1, storage: "柜A" });
check("建档为待试磨", r.status === 201 && r.data.status === "待试磨", JSON.stringify(r.data));

// 合格登记 → 已试磨
r = await post(`/api/items/${code}/sessions`, { stone: "端砚", weight: 120, minutes: 15, surfaceTemp: 38, tester: "张三", requestId: "req-valid-1" });
check("合格登记计入已试磨", r.status === 201 && r.data.item.status === "已试磨" && r.data.session.state === "done");
const doneSessionId = r.data.session.id;

// 重复提交(同 requestId)→ 沿用首次
r = await post(`/api/items/${code}/sessions`, { stone: "端砚", weight: 120, minutes: 15, surfaceTemp: 38, tester: "张三", requestId: "req-valid-1" });
check("重复提交沿用首次", r.status === 200 && r.data.reused === true && r.data.item.sessionCount === 1);

// 高温登记 → 待冷却,不计入已试磨
r = await post(`/api/items/${code}/sessions`, { stone: "歙砚", weight: 121, minutes: 18, surfaceTemp: 46.5, tester: "张三", requestId: "req-hot-1" });
check("达四十五度转待冷却", r.status === 201 && r.data.item.status === "待冷却" && r.data.session.state === "cooling");
const hotId = r.data.session.id;

// 未结束试磨只留一条:再登记 → 沿用首次
r = await post(`/api/items/${code}/sessions`, { stone: "歙砚", weight: 122, minutes: 10, surfaceTemp: 30, tester: "张三", requestId: "req-other" });
check("每锭只留一条未结束试磨", r.status === 200 && r.data.reused === true && r.data.session.id === hotId && r.data.item.sessionCount === 2);

// 复测规则
r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34, by: "张三" });
check("复测须为另一人", r.status === 409 && r.data.error === "same_tester");

const t0 = "2026-09-23T08:00:00.000Z";
r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34.5, by: "李四", at: t0, requestId: "rc-1" });
check("首次复测记录", r.status === 201 && r.data.granted === false);

r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34.5, by: "李四", at: t0, requestId: "rc-1" });
check("复测重复提交沿用首次", r.status === 200 && r.data.reused === true);

r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34, by: "李四", at: "2026-09-23T08:10:00.000Z" });
check("复测间隔不足二十分钟", r.status === 409 && r.data.error === "too_soon");

r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34, by: "王五", at: "2026-09-23T08:30:00.000Z" });
check("两次复测须同一人", r.status === 409 && r.data.error === "rechecker_mismatch");

r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 33.8, by: "李四", at: "2026-09-23T08:25:00.000Z", requestId: "rc-2" });
check("复测合格准入复磨", r.status === 201 && r.data.granted === true && r.data.item.status === "待试磨");

r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 33, by: "李四", at: "2026-09-23T09:00:00.000Z" });
check("准入后不再复测", r.status === 409 && r.data.error === "not_cooling");

// 更正 → 准入失效,保留旧记录
r = await post(`/api/items/${code}/sessions/${hotId}/corrections`, { field: "surfaceTemp", value: 44.8, by: "赵六", requestId: "cor-1" });
check("更正使准入失效", r.status === 201 && r.data.revoked === true && r.data.item.status === "待冷却");
let sess = r.data.item.sessions.find(s => s.id === hotId);
check("更正保留旧记录", sess.corrections.length === 1 && sess.corrections[0].from === 46.5
  && sess.surfaceTemp === 44.8 && sess.rechecks.length === 0 && sess.rechecksArchived.length === 2,
  JSON.stringify(sess));

r = await post(`/api/items/${code}/sessions/${hotId}/corrections`, { field: "surfaceTemp", value: 44.8, by: "赵六", requestId: "cor-1" });
check("更正重复提交沿用首次", r.status === 200 && r.data.reused === true);

r = await post(`/api/items/${code}/sessions/${hotId}/corrections`, { field: "minutes", value: 10 });
check("仅支持更正磨石/克重/磨面温度", r.status === 400 && r.data.error === "bad_field");

// 更正后重新复测准入
await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 34, by: "李四", at: "2026-09-23T10:00:00.000Z" });
r = await post(`/api/items/${code}/sessions/${hotId}/rechecks`, { temp: 35, by: "李四", at: "2026-09-23T10:20:00.000Z" });
check("更正后重新复测准入", r.status === 201 && r.data.granted === true && r.data.item.status === "待试磨");

// 已合格试磨不支持更正
r = await post(`/api/items/${code}/sessions/${doneSessionId}/corrections`, { field: "stone", value: "x" });
check("已合格试磨不支持更正", r.status === 409 && r.data.error === "session_closed");

// 缺项 → 待冷却
const codeB = code + "-B";
await post("/api/items", { code: codeB });
r = await post(`/api/items/${codeB}/sessions`, { stone: "端砚", minutes: 10, tester: "张三" });
check("缺项转待冷却", r.data.session?.state === "cooling"
  && r.data.session.reasons.some(x => x.startsWith("缺项")) && r.data.item.status === "待冷却");
const missId = r.data.session.id;

// 温差超过二度不准入;之后滑动窗口合格准入
await post(`/api/items/${codeB}/sessions/${missId}/rechecks`, { temp: 34.5, by: "李四", at: "2026-09-23T08:00:00.000Z" });
r = await post(`/api/items/${codeB}/sessions/${missId}/rechecks`, { temp: 36.6, by: "李四", at: "2026-09-23T08:25:00.000Z" });
check("温差超二度或超三十五度不准入", r.status === 201 && r.data.granted === false && r.data.item.status === "待冷却");
await post(`/api/items/${codeB}/sessions/${missId}/rechecks`, { temp: 33.9, by: "李四", at: "2026-09-23T08:50:00.000Z" });
r = await post(`/api/items/${codeB}/sessions/${missId}/rechecks`, { temp: 33.5, by: "李四", at: "2026-09-23T09:15:00.000Z" });
check("连续两次合格才准入", r.status === 201 && r.data.granted === true);

// 超时长 → 待冷却
const codeC = code + "-C";
await post("/api/items", { code: codeC });
r = await post(`/api/items/${codeC}/sessions`, { stone: "端砚", weight: 100, minutes: 25, surfaceTemp: 38, tester: "张三" });
check("超二十分钟转待冷却", r.data.session?.state === "cooling" && r.data.session.reasons.some(x => x.startsWith("超时长")));

// 边界:二十分钟、44.9℃ → 合格
const codeD = code + "-D";
await post("/api/items", { code: codeD });
r = await post(`/api/items/${codeD}/sessions`, { stone: "端砚", weight: 100, minutes: 20, surfaceTemp: 44.9, tester: "张三" });
check("边界值二十分钟44.9度合格", r.data.session?.state === "done");

// 并发提交(同 requestId)→ 沿用首次
const codeE = code + "-E";
await post("/api/items", { code: codeE });
const same = { stone: "端砚", weight: 100, minutes: 10, surfaceTemp: 38, tester: "张三", requestId: "cc-same" };
let [a, b] = await Promise.all([
  post(`/api/items/${codeE}/sessions`, same),
  post(`/api/items/${codeE}/sessions`, same)
]);
check("并发同请求并发沿用首次", a.data.session.id === b.data.session.id && (a.data.reused || b.data.reused));

// 并发提交(不同 requestId,均转待冷却)→ 只留一条
const codeF = code + "-F";
await post("/api/items", { code: codeF });
[a, b] = await Promise.all([
  post(`/api/items/${codeF}/sessions`, { stone: "端砚", weight: 100, minutes: 30, surfaceTemp: 38, tester: "张三", requestId: "cc-1" }),
  post(`/api/items/${codeF}/sessions`, { stone: "歙砚", weight: 100, minutes: 40, surfaceTemp: 39, tester: "李四", requestId: "cc-2" })
]);
check("并发提交沿用首次", a.data.session.id === b.data.session.id && (a.data.reused || b.data.reused) && !(a.data.reused && b.data.reused));
const listF = (await api("/api/items")).data.find(x => x.code === codeF);
check("并发只留一条未结束试磨", listF.sessionCount === 1 && listF.status === "待冷却");

// 列表、统计与履历刷新后一致
const stats = (await api("/api/stats")).data;
const list = (await api("/api/items")).data;
const counts = {};
for (const it of list) counts[it.status] = (counts[it.status] || 0) + 1;
check("列表与统计一致",
  Object.entries(stats).every(([k, v]) => (counts[k] || 0) === v)
  && Object.keys(counts).every(k => stats[k] === counts[k]),
  JSON.stringify({ stats, counts }));
const item1 = list.find(x => x.code === code);
check("履历刷新后一致", item1.sessions.length === 2 && item1.logs.length >= 6 && item1.status === "待试磨");

server.close();
await rm(process.env.DB_PATH, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
