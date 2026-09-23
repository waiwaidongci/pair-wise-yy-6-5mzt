// 入口层：HTTP 路由、请求解析与响应；判定交给 judgment，持久化交给 store。
import http from "node:http";
import { loadDb, transact } from "./store.js";
import { addLog, applyCorrection, computeStats, registerGrinding, registerRecheck, summarize } from "./judgment.js";
import { page } from "./page.js";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function findItem(db, key) {
  return db.items.find((x) => x.id === key || x.code === key);
}
function ok(status, data) {
  return { status, data };
}
function fail(status, error) {
  return { status, data: { error } };
}
async function mutate(req, res, fn) {
  const input = await readBody(req);
  const result = await transact((db) => fn(db, input));
  send(res, result.status, result.data);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://" + req.headers.host);
      const path = url.pathname;

      if (req.method === "GET" && path === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(page());
      }
      if (req.method === "GET" && path === "/api/items") {
        const db = await loadDb();
        return send(res, 200, db.items.map(summarize));
      }
      if (req.method === "GET" && path === "/api/stats") {
        const db = await loadDb();
        return send(res, 200, computeStats(db.items));
      }
      if (req.method === "POST" && path === "/api/items") {
        return mutate(req, res, (db, input) => {
          const code = (input.code ?? "").toString().trim();
          if (!code) return fail(422, "缺少墨锭编号");
          if (db.items.some((x) => x.code === code || x.id === code)) return fail(409, "编号已存在：" + code);
          const item = { id: "IS-" + Date.now(), ...input, code, status: input.status || "待试磨", logs: [] };
          addLog(item, "建档", "创建墨锭");
          db.items.unshift(item);
          return ok(201, item);
        });
      }

      const grind = path.match(/^\/api\/items\/([^/]+)\/grindings$/);
      if (grind && req.method === "POST") {
        return mutate(req, res, (db, input) => {
          const item = findItem(db, grind[1]);
          if (!item) return fail(404, "item_not_found");
          const r = registerGrinding(item, input);
          if (!r.ok) return fail(r.status, r.error);
          return ok(r.created ? 201 : 200, { item: summarize(item), record: r.record, reused: Boolean(r.reused), note: r.note || null });
        });
      }
      const recheck = path.match(/^\/api\/items\/([^/]+)\/rechecks$/);
      if (recheck && req.method === "POST") {
        return mutate(req, res, (db, input) => {
          const item = findItem(db, recheck[1]);
          if (!item) return fail(404, "item_not_found");
          const r = registerRecheck(item, input);
          if (!r.ok) return fail(r.status, r.error);
          return ok(r.admitted ? 201 : 200, { item: summarize(item), recheck: r.recheck, admitted: r.admitted });
        });
      }
      const correct = path.match(/^\/api\/items\/([^/]+)\/corrections$/);
      if (correct && req.method === "POST") {
        return mutate(req, res, (db, input) => {
          const item = findItem(db, correct[1]);
          if (!item) return fail(404, "item_not_found");
          const r = applyCorrection(item, input);
          if (!r.ok) return fail(r.status, r.error);
          return ok(200, { item: summarize(item), record: r.record, changes: r.changes, revoked: r.revoked });
        });
      }
      const logs = path.match(/^\/api\/items\/([^/]+)\/logs$/);
      if (logs && req.method === "POST") {
        return mutate(req, res, (db, input) => {
          const item = findItem(db, logs[1]);
          if (!item) return fail(404, "item_not_found");
          addLog(item, (input.step ?? "").toString().trim() || "记录", (input.note ?? "").toString());
          return ok(201, summarize(item));
        });
      }
      const patch = path.match(/^\/api\/items\/([^/]+)$/);
      if (patch && req.method === "PATCH") {
        return mutate(req, res, (db, input) => {
          const item = findItem(db, patch[1]);
          if (!item) return fail(404, "item_not_found");
          for (const key of ["code", "smokeSource", "glueRatio", "ageYears", "storage", "status"]) {
            if (key in input) item[key] = input[key];
          }
          addLog(item, "状态", "更新为" + (item.status ?? ""));
          return ok(200, summarize(item));
        });
      }
      send(res, 404, { error: "not_found" });
    } catch (error) {
      send(res, 500, { error: error.message });
    }
  });
}
