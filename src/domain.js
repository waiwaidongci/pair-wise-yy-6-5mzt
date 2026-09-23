// 判定层:试磨登记、磨面温升判定、冷却复测准入与更正规则。
// 只操作内存中的数据对象,不感知 HTTP 与存储。

export const STAGES = ["待试磨", "待冷却", "已试磨"];

export const LIMITS = {
  maxMinutes: 20,       // 时长超过二十分钟 → 转待冷却
  hotTemp: 45,          // 磨面温度达到四十五度 → 转待冷却
  coolTemp: 35,         // 复测温度均须不高于三十五度
  maxDiff: 2,           // 两次复测温差不超过二度
  recheckGapMinutes: 20 // 两次复测至少间隔二十分钟
};

export const FIELD_LABELS = {
  stone: "磨石",
  weight: "克重",
  minutes: "时长",
  surfaceTemp: "磨面温度",
  tester: "试磨人"
};

const REQUIRED_FIELDS = ["stone", "weight", "minutes", "surfaceTemp", "tester"];
const CORRECTABLE_FIELDS = ["stone", "weight", "surfaceTemp"];

export class DomainError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isMissing(value) {
  return value === undefined || value === null || value === ""
    || (typeof value === "number" && !Number.isFinite(value));
}
function toNumber(value) {
  if (isMissing(value)) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function toText(value) {
  return isMissing(value) ? "" : String(value).trim();
}
function toDate(value, fallback) {
  if (isMissing(value)) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new DomainError(400, "bad_time", "时间格式无效");
  return date;
}
function show(value) {
  return isMissing(value) ? "空" : String(value);
}
function newId(prefix, now) {
  return prefix + "-" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function findItem(db, key) {
  return db.items.find(x => x.id === key || x.code === key);
}
export function findSession(item, sessionId) {
  return (item.sessions || []).find(s => s.id === sessionId);
}
// 未结束试磨 = 仍处于待冷却、尚未准入的登记
export function pendingSession(item) {
  return (item.sessions || []).find(s => s.state === "cooling") || null;
}

function refreshStatus(item) {
  const sessions = item.sessions || [];
  if (!sessions.length) return;
  if (pendingSession(item)) { item.status = "待冷却"; return; }
  const last = sessions[sessions.length - 1];
  item.status = last.state === "done" ? "已试磨" : "待试磨";
}

function pushLog(item, step, note) {
  item.logs ||= [];
  item.logs.push({ at: new Date().toISOString(), step, note });
}

export function createItem(db, input, now = new Date()) {
  const code = toText(input.code);
  if (!code) throw new DomainError(400, "code_required", "墨锭编号必填");
  if (db.items.some(x => x.code === code)) throw new DomainError(409, "code_taken", "墨锭编号已存在");
  const item = {
    id: newId("IS", now),
    code,
    smokeSource: toText(input.smokeSource),
    glueRatio: toText(input.glueRatio),
    ageYears: toNumber(input.ageYears) ?? 0,
    storage: toText(input.storage),
    status: "待试磨",
    sessions: [],
    logs: [{ at: now.toISOString(), step: "建档", note: "创建墨锭" }]
  };
  db.items.unshift(item);
  return item;
}

// 试磨登记:每锭只留一条未结束试磨,重复或并发提交沿用首次。
// 缺项、超二十分钟、达四十五度 → 转待冷却,不计入已试磨。
export function registerSession(item, input, now = new Date()) {
  item.sessions ||= [];
  if (input.requestId) {
    const dup = item.sessions.find(s => s.requestId && s.requestId === input.requestId);
    if (dup) return { session: dup, reused: true };
  }
  const pending = pendingSession(item);
  if (pending) return { session: pending, reused: true };

  const session = {
    id: newId("S", now),
    requestId: input.requestId || null,
    at: toDate(input.at, now).toISOString(),
    stone: toText(input.stone),
    weight: toNumber(input.weight),
    minutes: toNumber(input.minutes),
    surfaceTemp: toNumber(input.surfaceTemp),
    tester: toText(input.tester),
    state: "cooling",
    reasons: [],
    rechecks: [],
    rechecksArchived: [],
    corrections: [],
    admission: null
  };
  const missing = REQUIRED_FIELDS.filter(k => isMissing(session[k]));
  if (missing.length) session.reasons.push("缺项:" + missing.map(k => FIELD_LABELS[k]).join("/"));
  if (!isMissing(session.minutes) && session.minutes > LIMITS.maxMinutes) {
    session.reasons.push("超时长:" + session.minutes + "分钟");
  }
  if (!isMissing(session.surfaceTemp) && session.surfaceTemp >= LIMITS.hotTemp) {
    session.reasons.push("高温:" + session.surfaceTemp + "℃");
  }
  session.state = session.reasons.length ? "cooling" : "done";
  item.sessions.push(session);
  refreshStatus(item);
  pushLog(item, "试磨", session.state === "done"
    ? "登记合格,计入已试磨(试磨人" + session.tester + ")"
    : "登记转待冷却:" + session.reasons.join(";"));
  return { session, reused: false };
}

// 冷却复测:另一人(非试磨人)间隔≥20分钟连续两次复测,
// 两次均≤35℃且温差≤2℃才准入复磨;否则仍为待冷却。
export function addRecheck(item, sessionId, input, now = new Date()) {
  const session = findSession(item, sessionId);
  if (!session) throw new DomainError(404, "session_not_found", "未找到试磨记录");
  if (session.state !== "cooling") throw new DomainError(409, "not_cooling", "该试磨不在待冷却状态");
  if (input.requestId) {
    const dup = session.rechecks.find(r => r.requestId && r.requestId === input.requestId);
    if (dup) return { session, recheck: dup, reused: true, granted: session.state === "admitted" };
  }
  const by = toText(input.by);
  if (!by) throw new DomainError(400, "rechecker_required", "复测人必填");
  if (by === session.tester) throw new DomainError(409, "same_tester", "复测须由试磨人之外的另一人进行");
  if (session.rechecks.length && session.rechecks[0].by !== by) {
    throw new DomainError(409, "rechecker_mismatch", "连续两次复测须为同一人");
  }
  const temp = toNumber(input.temp);
  if (temp === null) throw new DomainError(400, "temp_required", "复测温度必填且须为数字");
  const at = toDate(input.at, now);
  const prev = session.rechecks[session.rechecks.length - 1];
  if (prev) {
    const gapMinutes = (at.getTime() - new Date(prev.at).getTime()) / 60000;
    if (gapMinutes < LIMITS.recheckGapMinutes) {
      throw new DomainError(409, "too_soon", "两次复测须间隔至少" + LIMITS.recheckGapMinutes + "分钟");
    }
  }
  const recheck = { at: at.toISOString(), temp, by, requestId: input.requestId || null };
  session.rechecks.push(recheck);
  let granted = false;
  if (prev && prev.temp <= LIMITS.coolTemp && temp <= LIMITS.coolTemp
      && Math.abs(temp - prev.temp) <= LIMITS.maxDiff) {
    session.state = "admitted";
    session.admission = { granted: true, at: recheck.at, by };
    granted = true;
    pushLog(item, "准入", "复测合格(" + prev.temp + "℃/" + temp + "℃),准予复磨,复测人" + by);
  } else {
    pushLog(item, "复测", by + "复测磨面" + temp + "℃" + (prev ? ",暂未准入" : ",等待第二次复测"));
  }
  refreshStatus(item);
  return { session, recheck, granted, reused: false };
}

// 更正磨石/克重/磨面温度:旧值留在 corrections 中(保留旧记录),
// 已准入的试磨准入失效,回到待冷却并需重新复测。
export function correctSession(item, sessionId, input, now = new Date()) {
  const session = findSession(item, sessionId);
  if (!session) throw new DomainError(404, "session_not_found", "未找到试磨记录");
  if (session.state === "done") throw new DomainError(409, "session_closed", "已合格试磨不支持更正");
  const field = toText(input.field);
  if (!CORRECTABLE_FIELDS.includes(field)) {
    throw new DomainError(400, "bad_field", "仅支持更正:" + CORRECTABLE_FIELDS.map(k => FIELD_LABELS[k]).join("/"));
  }
  if (input.requestId) {
    const dup = session.corrections.find(c => c.requestId && c.requestId === input.requestId);
    if (dup) return { session, correction: dup, reused: true, revoked: false };
  }
  const value = field === "stone" ? toText(input.value) : toNumber(input.value);
  if (isMissing(value)) throw new DomainError(400, "value_required", "更正值必填");
  const correction = {
    at: toDate(input.at, now).toISOString(),
    field,
    from: session[field],
    to: value,
    by: toText(input.by),
    requestId: input.requestId || null
  };
  session.corrections.push(correction);
  session[field] = value;
  let revoked = false;
  if (session.admission && session.admission.granted) {
    session.admission = { ...session.admission, granted: false, revokedAt: correction.at, revokedBy: correction.by };
    session.state = "cooling";
    session.rechecksArchived = (session.rechecksArchived || []).concat(session.rechecks);
    session.rechecks = [];
    revoked = true;
    pushLog(item, "准入失效", "更正" + FIELD_LABELS[field] + ",准入失效,需重新复测");
  }
  pushLog(item, "更正", FIELD_LABELS[field] + "由「" + show(correction.from) + "」更正为「" + show(value) + "」,旧记录已保留");
  refreshStatus(item);
  return { session, correction, revoked, reused: false };
}

export function addNote(item, input) {
  const note = toText(input.note);
  if (!note) throw new DomainError(400, "note_required", "备注内容必填");
  pushLog(item, toText(input.step) || "备注", note);
  return item;
}

export function computeStats(items) {
  const stats = Object.fromEntries(STAGES.map(s => [s, 0]));
  for (const item of items) stats[item.status] = (stats[item.status] ?? 0) + 1;
  return stats;
}

export function summarize(item) {
  const sessions = item.sessions || [];
  const pending = pendingSession(item);
  return {
    ...item,
    sessionCount: sessions.length,
    doneCount: sessions.filter(s => s.state === "done").length,
    logCount: (item.logs || []).length,
    pendingSessionId: pending ? pending.id : null
  };
}
