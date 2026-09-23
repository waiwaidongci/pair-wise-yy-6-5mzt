// 入口层:HTTP 路由。只负责请求解析与响应,
// 业务判定交给 domain,持久化交给 store。
import { read, transact } from "./store.js";
import {
  DomainError, findItem, createItem, registerSession, addRecheck,
  correctSession, addNote, computeStats, summarize
} from "./domain.js";
import { page } from "./page.js";

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError(400, "bad_json", "请求体不是有效JSON");
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/") return html(res, page());

  if (req.method === "GET" && path === "/api/items") {
    const db = await read();
    return send(res, 200, db.items.map(summarize));
  }
  if (req.method === "GET" && path === "/api/stats") {
    const db = await read();
    return send(res, 200, computeStats(db.items));
  }
  if (req.method === "POST" && path === "/api/items") {
    const input = await body(req);
    const item = await transact(db => createItem(db, input));
    return send(res, 201, summarize(item));
  }

  const itemDetail = path.match(/^\/api\/items\/([^/]+)$/);
  if (itemDetail && req.method === "GET") {
    const db = await read();
    const item = findItem(db, decodeURIComponent(itemDetail[1]));
    if (!item) return send(res, 404, { error: "item_not_found", message: "未找到墨锭" });
    return send(res, 200, summarize(item));
  }

  const sessions = path.match(/^\/api\/items\/([^/]+)\/sessions$/);
  if (sessions && req.method === "POST") {
    const input = await body(req);
    const result = await transact(db => {
      const item = findItem(db, decodeURIComponent(sessions[1]));
      if (!item) throw new DomainError(404, "item_not_found", "未找到墨锭");
      return { item, ...registerSession(item, input) };
    });
    return send(res, result.reused ? 200 : 201, {
      item: summarize(result.item), session: result.session, reused: result.reused
    });
  }

  const rechecks = path.match(/^\/api\/items\/([^/]+)\/sessions\/([^/]+)\/rechecks$/);
  if (rechecks && req.method === "POST") {
    const input = await body(req);
    const result = await transact(db => {
      const item = findItem(db, decodeURIComponent(rechecks[1]));
      if (!item) throw new DomainError(404, "item_not_found", "未找到墨锭");
      return { item, ...addRecheck(item, decodeURIComponent(rechecks[2]), input) };
    });
    return send(res, result.reused ? 200 : 201, {
      item: summarize(result.item), session: result.session,
      granted: !!result.granted, reused: !!result.reused
    });
  }

  const corrections = path.match(/^\/api\/items\/([^/]+)\/sessions\/([^/]+)\/corrections$/);
  if (corrections && req.method === "POST") {
    const input = await body(req);
    const result = await transact(db => {
      const item = findItem(db, decodeURIComponent(corrections[1]));
      if (!item) throw new DomainError(404, "item_not_found", "未找到墨锭");
      return { item, ...correctSession(item, decodeURIComponent(corrections[2]), input) };
    });
    return send(res, result.reused ? 200 : 201, {
      item: summarize(result.item), session: result.session,
      revoked: !!result.revoked, reused: !!result.reused
    });
  }

  const logs = path.match(/^\/api\/items\/([^/]+)\/logs$/);
  if (logs && req.method === "POST") {
    const input = await body(req);
    const item = await transact(db => {
      const found = findItem(db, decodeURIComponent(logs[1]));
      if (!found) throw new DomainError(404, "item_not_found", "未找到墨锭");
      return addNote(found, input);
    });
    return send(res, 201, summarize(item));
  }

  send(res, 404, { error: "not_found", message: "接口不存在" });
}

export async function route(req, res) {
  try {
    await handle(req, res);
  } catch (error) {
    const status = error instanceof DomainError ? error.status : 500;
    send(res, status, { error: error.code || "internal_error", message: error.message });
  }
}
