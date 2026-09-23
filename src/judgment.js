// 判定层：试磨登记判定、冷却复测准入、更正与准入失效。
// 只操作传入的数据对象，不触碰 HTTP 与持久化。

export const STAGES = ["待试磨", "已试磨", "待冷却", "准予复磨", "重点观察"];

export const GRINDING_FIELDS = [
  ["stone", "磨石"],
  ["weightGrams", "克重"],
  ["minutes", "时长"],
  ["surfaceTemp", "磨面温度"],
  ["tester", "试磨人"],
];

export const LIMITS = {
  maxMinutes: 20, // 时长超过二十分钟转待冷却
  hotTemp: 45, // 磨面温度达到四十五度转待冷却
  coolTemp: 35, // 复测温度须不高于三十五度
  coolDiff: 2, // 两次复测温差不超过二度
  coolIntervalMs: 20 * 60 * 1000, // 两次复测间隔二十分钟
};

// 更正这三项会令复磨准入失效
const CORRECTABLE_FIELDS = [
  ["stone", "磨石"],
  ["weightGrams", "克重"],
  ["surfaceTemp", "磨面温度"],
];

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value) {
  return (value ?? "").toString().trim();
}
function time(value) {
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t;
}
function fail(status, error) {
  return { ok: false, status, error };
}

export function addLog(item, step, note, extra = {}, at = new Date()) {
  item.logs ||= [];
  item.logs.push({ at: at.toISOString(), step, note, ...extra });
}

// 判定一条试磨登记：缺项、时长超过二十分钟或磨面温度达到四十五度 → 待冷却
export function judgeGrinding(input) {
  const values = {
    stone: text(input.stone),
    weightGrams: num(input.weightGrams),
    minutes: num(input.minutes),
    surfaceTemp: num(input.surfaceTemp),
    tester: text(input.tester),
  };
  const missing = [];
  if (!values.stone) missing.push("磨石");
  if (values.weightGrams === null) missing.push("克重");
  if (values.minutes === null) missing.push("时长");
  if (values.surfaceTemp === null) missing.push("磨面温度");
  if (!values.tester) missing.push("试磨人");
  const reasons = [];
  if (missing.length) reasons.push("缺项：" + missing.join("、"));
  if (values.minutes !== null && values.minutes > LIMITS.maxMinutes) reasons.push("时长超过二十分钟");
  if (values.surfaceTemp !== null && values.surfaceTemp >= LIMITS.hotTemp) reasons.push("磨面温度达到四十五度");
  return { ...values, missing, reasons, result: reasons.length ? "待冷却" : "已试磨" };
}

function describe(j) {
  const show = (v, unit) => (v === null || v === "" ? "缺" : v + unit);
  return `磨石${j.stone || "缺"}，${show(j.weightGrams, "克")}，${show(j.minutes, "分钟")}，磨面${show(j.surfaceTemp, "℃")}，试磨人${j.tester || "缺"}`;
}

// 登记试磨/复磨。每锭只留一条未结束试磨；重复或并发提交沿用首次。
export function registerGrinding(item, input, now = new Date()) {
  item.grindings ||= [];
  const submissionId = text(input.submissionId) || null;
  if (submissionId) {
    const dup = item.grindings.find((g) => g.submissionId === submissionId);
    if (dup) return { ok: true, reused: true, record: dup, note: "重复提交，沿用首次登记 " + dup.id };
  }
  if (item.cooling && !item.cooling.admission) {
    const first = item.grindings.find((g) => g.id === item.cooling.recordId) || item.grindings[item.grindings.length - 1] || null;
    return { ok: true, reused: true, record: first, note: "试磨未结束（待冷却未准入复磨），沿用首次登记" + (first ? " " + first.id : "") };
  }
  const remill = Boolean(item.cooling && item.cooling.admission);
  const judged = judgeGrinding(input);
  const record = {
    id: "GR-" + now.getTime() + "-" + (item.grindings.length + 1),
    at: now.toISOString(),
    kind: remill ? "复磨" : "试磨",
    submissionId,
    stone: judged.stone,
    weightGrams: judged.weightGrams,
    minutes: judged.minutes,
    surfaceTemp: judged.surfaceTemp,
    tester: judged.tester,
    missing: judged.missing,
    reasons: judged.reasons,
    result: judged.result,
    corrections: [],
  };
  item.grindings.push(record);
  if (remill) item.cooling = null; // 准入被本次复磨消费
  if (judged.result === "待冷却") {
    item.status = "待冷却";
    item.cooling = { since: record.at, recordId: record.id, tester: judged.tester || null, countFrom: record.at, recheckOffset: 0, rechecks: [], admission: null, revocations: [] };
    addLog(item, record.kind, describe(judged) + "，转待冷却：" + judged.reasons.join("；") + "，不计入已试磨", {}, now);
  } else {
    item.status = "已试磨";
    addLog(item, record.kind, describe(judged) + "，计入已试磨", {}, now);
  }
  return { ok: true, created: true, record };
}

// 冷却复测：另一人隔二十分钟连续两次，温度均不高于三十五度且差不超过二度才准复磨。
export function registerRecheck(item, input, now = new Date()) {
  if (!item.cooling) return fail(409, "当前没有待冷却的试磨");
  if (item.cooling.admission) return fail(409, "已准入复磨，请直接登记复磨");
  const by = text(input.by);
  const temp = num(input.temp);
  if (!by) return fail(422, "缺少复测人");
  if (temp === null) return fail(422, "缺少复测温度");
  if (item.cooling.tester && by === item.cooling.tester) return fail(422, "复测人须为另一人，不能是试磨人 " + item.cooling.tester);
  const at = input.at ? time(input.at) : now;
  if (!at) return fail(422, "复测时间无效");
  if (at.getTime() < new Date(item.cooling.since).getTime()) return fail(422, "复测时间早于转待冷却时间");
  const recheck = { at: at.toISOString(), temp, by };
  item.cooling.rechecks ||= [];
  item.cooling.rechecks.push(recheck);
  // 取更正/转冷却之后登记的复测，温度超标或换人都会中断连续计次
  const countable = item.cooling.rechecks
    .slice(item.cooling.recheckOffset || 0)
    .filter((r) => new Date(r.at).getTime() >= new Date(item.cooling.countFrom).getTime())
    .slice()
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  let run = [];
  for (const r of countable) {
    if (r.temp > LIMITS.coolTemp) {
      run = [];
      continue;
    }
    if (run.length && run[run.length - 1].by !== r.by) run = [];
    run.push(r);
  }
  let admitted = false;
  if (run.length >= 2) {
    const first = run[run.length - 2];
    const second = run[run.length - 1];
    const gapMs = new Date(second.at) - new Date(first.at);
    const diff = Math.abs(second.temp - first.temp);
    if (gapMs >= LIMITS.coolIntervalMs && diff <= LIMITS.coolDiff) {
      admitted = true;
      item.cooling.admission = { at: now.toISOString(), by: second.by, first, second };
      item.status = "准予复磨";
    }
  }
  addLog(
    item,
    "复测",
    by + " 复测磨面 " + temp + "℃" + (temp > LIMITS.coolTemp ? "（高于三十五度，连续计次中断）" : "") + (admitted ? "，两次复测合格，准予复磨" : ""),
    {},
    now
  );
  return { ok: true, recheck, admitted };
}

// 更正磨石、克重或磨面温度：旧值保留在 corrections，已取得的复磨准入立即失效。
export function applyCorrection(item, input, now = new Date()) {
  item.grindings ||= [];
  if (!item.grindings.length) return fail(404, "该墨锭暂无试磨记录");
  let record;
  if (input.grindingId) {
    record = item.grindings.find((g) => g.id === input.grindingId);
    if (!record) return fail(404, "未找到试磨记录 " + input.grindingId);
  } else {
    record = item.grindings[item.grindings.length - 1];
  }
  const by = text(input.by) || "未署名";
  const changes = [];
  for (const [key, label] of CORRECTABLE_FIELDS) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const to = key === "stone" ? text(raw) : num(raw);
    if (to === null || to === "") continue;
    const from = record[key];
    if (from === to) continue;
    record.corrections ||= [];
    record.corrections.push({ at: now.toISOString(), by, field: label, from: from ?? null, to });
    record[key] = to;
    changes.push(label + " " + (from ?? "空") + "→" + to);
  }
  if (!changes.length) return fail(422, "没有需要更正的磨石、克重或磨面温度");
  let revoked = false;
  if (item.cooling && item.cooling.admission) {
    item.cooling.revocations ||= [];
    item.cooling.revocations.push({ at: now.toISOString(), by, reason: "更正" + changes.join("；"), admission: item.cooling.admission });
    item.cooling.admission = null;
    item.status = "待冷却";
    revoked = true;
  }
  if (item.cooling) {
    item.cooling.countFrom = now.toISOString(); // 更正后复测重新计次
    item.cooling.recheckOffset = (item.cooling.rechecks || []).length; // 已登记的复测一律不再计入
  }
  addLog(item, "更正", "更正" + changes.join("；") + "（旧值保留）" + (revoked ? "，复磨准入失效" : ""), {}, now);
  return { ok: true, record, changes, revoked };
}

export function computeStats(items) {
  const stats = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const item of items) {
    if (stats[item.status] !== undefined) stats[item.status] += 1;
  }
  return stats;
}

export function summarize(item) {
  return { ...item, logCount: (item.logs || []).length };
}
