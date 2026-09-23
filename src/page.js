// 页面模板：列表、统计与履历均由同一份数据渲染，刷新后一致。
import { LIMITS, STAGES } from "./judgment.js";

export function page() {
  const stageOptions = STAGES.map((s) => "<option>" + s + "</option>").join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室 · 磨面温升与冷却复磨准入台</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:24px; } h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; } main { display:grid; grid-template-columns:400px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; margin-top:12px; } button.secondary { background:#69736a; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; } .card { display:grid; gap:8px; align-content:start; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:120px; overflow:auto; } .warn { color:var(--warn); font-weight:700; } .ok { color:var(--accent); font-weight:700; }
    .box { border:1px dashed var(--line); border-radius:6px; padding:8px; display:grid; gap:4px; font-size:13px; }
    .hint { color:var(--muted); font-size:12px; margin-top:8px; line-height:1.6; } #msg { margin-bottom:10px; min-height:18px; }
    section.side { display:grid; gap:14px; align-content:start; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header><div><h1>墨锭试磨室 · 磨面温升与冷却复磨准入台</h1><div class="meta">试磨登记、磨面温升判定、冷却复测与复磨准入</div></div><button id="reload">刷新</button></header>
  <main>
    <section class="side">
      <form id="createForm"><h2>新增墨锭</h2>
        <label>墨锭编号</label><input name="code" required>
        <label>烟料来源</label><input name="smokeSource">
        <label>胶料比例</label><input name="glueRatio">
        <label>存放年限</label><input name="ageYears" type="number">
        <label>存放位置</label><input name="storage">
        <label>初始状态</label><select name="status">${stageOptions}</select>
        <button>保存墨锭</button>
      </form>
      <form id="grindingForm"><h2>试磨登记</h2>
        <label>选择墨锭</label><select name="id" id="grindItem"></select>
        <label>磨石</label><input name="stone" placeholder="如：端溪老坑">
        <label>克重</label><input name="weightGrams" type="number" step="0.1">
        <label>时长（分钟）</label><input name="minutes" type="number" step="1">
        <label>磨面温度（℃）</label><input name="surfaceTemp" type="number" step="0.1">
        <label>试磨人</label><input name="tester">
        <button>提交试磨登记</button>
        <div class="hint">缺项、时长超过 ${LIMITS.maxMinutes} 分钟或磨面温度达到 ${LIMITS.hotTemp}℃ 即转待冷却，不计入已试磨；每锭只留一条未结束试磨，重复或并发提交沿用首次。</div>
      </form>
      <form id="recheckForm"><h2>冷却复测</h2>
        <label>选择墨锭（待冷却）</label><select name="id" id="recheckItem"></select>
        <label>复测人（须为另一人）</label><input name="by">
        <label>复测温度（℃）</label><input name="temp" type="number" step="0.1">
        <label>复测时间（留空为现在）</label><input name="at" type="datetime-local">
        <button>提交复测</button>
        <div class="hint">另一人隔 ${LIMITS.coolIntervalMs / 60000} 分钟连续两次复测，温度均不高于 ${LIMITS.coolTemp}℃ 且差不超过 ${LIMITS.coolDiff}℃ 才准复磨。</div>
      </form>
      <form id="correctForm"><h2>更正登记</h2>
        <label>选择墨锭</label><select id="correctItem"></select>
        <label>试磨记录</label><select id="correctRecord"></select>
        <label>磨石（留空不改）</label><input name="stone">
        <label>克重（留空不改）</label><input name="weightGrams" type="number" step="0.1">
        <label>磨面温度℃（留空不改）</label><input name="surfaceTemp" type="number" step="0.1">
        <label>更正人</label><input name="by">
        <button>提交更正</button>
        <div class="hint">更正磨石、克重或磨面温度会令复磨准入失效，旧值保留在更正记录中。</div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stageOptions}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div id="msg" class="meta"></div>
      <div class="panel"><h2>墨锭列表</h2><div class="grid" id="cards"></div></div>
    </section>
  </main>
  <script>
    var STAGES = ${JSON.stringify(STAGES)};
    var items = [];
    var grindSubmissionId = newSubmissionId();
    function newSubmissionId() { return "SUB-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8); }
    function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function fmtTime(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d.getTime()) ? String(iso) : d.toLocaleString("zh-CN", { hour12: false }); }
    async function api(path, options) {
      var res = await fetch(path, options && options.body ? Object.assign({}, options, { headers: { "Content-Type": "application/json" } }) : options);
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function showMsg(text, isErr) { var el = document.querySelector("#msg"); el.textContent = text || ""; el.className = isErr ? "warn" : "meta"; }
    async function load() { items = await api("/api/items"); render(); }
    function fillSelect(sel, list, val, label) {
      var el = document.querySelector(sel);
      var old = el.value;
      el.innerHTML = list.map(function (i) { return '<option value="' + esc(val(i)) + '">' + esc(label(i)) + "</option>"; }).join("");
      if (list.some(function (i) { return String(val(i)) === old; })) el.value = old;
    }
    function fillRecords() {
      var el = document.querySelector("#correctRecord");
      var item = items.find(function (i) { return (i.id || i.code) === document.querySelector("#correctItem").value; });
      var list = item ? item.grindings || [] : [];
      var old = el.value;
      el.innerHTML = list.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.id + " · " + g.kind + " · " + g.result + " · " + fmtTime(g.at)) + "</option>"; }).join("");
      if (list.some(function (g) { return g.id === old; })) el.value = old;
      else if (list.length) el.value = list[list.length - 1].id;
    }
    function render() {
      var stats = {};
      STAGES.forEach(function (s) { stats[s] = 0; });
      items.forEach(function (i) { if (stats[i.status] !== undefined) stats[i.status] += 1; });
      document.querySelector("#stats").innerHTML = Object.keys(stats).map(function (k) { return '<div class="stat"><span>' + k + "</span><strong>" + stats[k] + "</strong></div>"; }).join("");
      fillSelect("#grindItem", items, function (i) { return i.id || i.code; }, function (i) { return i.code + " · " + i.status; });
      fillSelect("#recheckItem", items.filter(function (i) { return i.cooling && !i.cooling.admission; }), function (i) { return i.id || i.code; }, function (i) { return i.code + " · 待冷却"; });
      fillSelect("#correctItem", items.filter(function (i) { return (i.grindings || []).length; }), function (i) { return i.id || i.code; }, function (i) { return i.code + " · " + i.status; });
      fillRecords();
      var status = document.querySelector("#statusFilter").value;
      var q = document.querySelector("#search").value.trim();
      var visible = items.filter(function (i) { return (!status || i.status === status) && (!q || JSON.stringify(i).indexOf(q) !== -1); });
      document.querySelector("#cards").innerHTML = visible.map(cardHtml).join("") || '<div class="meta">暂无墨锭</div>';
      bindCardEvents();
    }
    function cardHtml(item) {
      var id = item.id || item.code;
      var base = [["烟料来源", item.smokeSource], ["胶料比例", item.glueRatio], ["存放年限", item.ageYears], ["存放位置", item.storage]]
        .map(function (p) { return "<div><b>" + p[0] + "</b> " + esc(p[1] == null ? "" : p[1]) + "</div>"; }).join("");
      var gs = item.grindings || [];
      var last = gs[gs.length - 1];
      var grind = last
        ? '<div class="box"><b>最近' + esc(last.kind) + "</b> " + esc(fmtTime(last.at)) +
          "<div>磨石 " + esc(last.stone || "缺") + " · 克重 " + esc(last.weightGrams == null ? "缺" : last.weightGrams) + " · 时长 " + esc(last.minutes == null ? "缺" : last.minutes) + "分 · 磨面 " + esc(last.surfaceTemp == null ? "缺" : last.surfaceTemp) + "℃ · 试磨人 " + esc(last.tester || "缺") + "</div>" +
          "<div>判定：" + esc(last.result) + (last.reasons && last.reasons.length ? "（" + esc(last.reasons.join("；")) + "）" : "") + "</div>" +
          ((last.corrections || []).length ? '<div class="meta">更正 ' + last.corrections.length + " 次：" + esc(last.corrections.map(function (c) { return c.field + " " + (c.from == null ? "空" : c.from) + "→" + c.to; }).join("；")) + "</div>" : "") +
          "</div>"
        : '<div class="meta">暂无试磨记录</div>';
      var cool = "";
      if (item.cooling) {
        cool = '<div class="box"><b>冷却中</b> 自 ' + esc(fmtTime(item.cooling.since)) + " · 试磨人 " + esc(item.cooling.tester || "缺") +
          (item.cooling.rechecks || []).slice(-3).map(function (r) { return "<div>复测 " + esc(fmtTime(r.at)) + " · " + esc(r.temp) + "℃ · " + esc(r.by) + "</div>"; }).join("") +
          (item.cooling.admission
            ? '<div class="ok">已准入复磨：' + esc(item.cooling.admission.by) + " 两次复测 " + esc(item.cooling.admission.first.temp) + "℃ / " + esc(item.cooling.admission.second.temp) + "℃</div>"
            : '<div class="warn">未准入：需另一人隔20分钟两次复测均≤35℃且差≤2℃</div>') +
          ((item.cooling.revocations || []).length ? '<div class="meta">准入失效 ' + item.cooling.revocations.length + " 次</div>" : "") +
          "</div>";
      }
      var logs = (item.logs || []).slice(-5).map(function (l) { return "<div>" + esc(fmtTime(l.at)) + " " + esc(l.step) + "：" + esc(l.note) + "</div>"; }).join("");
      return '<article class="card"><h3>' + esc(item.code || id) + '</h3><span class="pill">' + esc(item.status) + "</span>" + base + grind + cool +
        '<label>状态</label><select data-status="' + esc(id) + '">' + STAGES.map(function (s) { return "<option " + (s === item.status ? "selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
        '<button class="secondary" data-note="' + esc(id) + '">追加备注</button>' +
        '<div class="logs meta">' + (logs || "暂无记录") + "</div></article>";
    }
    function bindCardEvents() {
      document.querySelectorAll("[data-status]").forEach(function (sel) {
        sel.onchange = async function () {
          try { await api("/api/items/" + encodeURIComponent(sel.dataset.status), { method: "PATCH", body: JSON.stringify({ status: sel.value }) }); await load(); }
          catch (e) { showMsg(e.message, true); }
        };
      });
      document.querySelectorAll("[data-note]").forEach(function (btn) {
        btn.onclick = async function () {
          var note = prompt("记录备注");
          if (!note) return;
          try { await api("/api/items/" + encodeURIComponent(btn.dataset.note) + "/logs", { method: "POST", body: JSON.stringify({ step: "备注", note: note }) }); await load(); }
          catch (e) { showMsg(e.message, true); }
        };
      });
    }
    document.querySelector("#createForm").onsubmit = async function (ev) {
      ev.preventDefault();
      try {
        await api("/api/items", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(ev.target).entries())) });
        ev.target.reset(); showMsg("已保存墨锭"); await load();
      } catch (e) { showMsg(e.message, true); }
    };
    document.querySelector("#grindingForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var data = Object.fromEntries(new FormData(ev.target).entries());
      var id = data.id; delete data.id;
      data.submissionId = grindSubmissionId;
      try {
        var r = await api("/api/items/" + encodeURIComponent(id) + "/grindings", { method: "POST", body: JSON.stringify(data) });
        grindSubmissionId = newSubmissionId();
        ev.target.reset();
        showMsg(r.reused ? r.note || "沿用首次登记" : "已登记 " + r.record.id + " → " + r.record.result);
        await load();
      } catch (e) { showMsg(e.message, true); }
    };
    document.querySelector("#recheckForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var data = Object.fromEntries(new FormData(ev.target).entries());
      var id = data.id; delete data.id;
      if (!data.at) delete data.at;
      try {
        var r = await api("/api/items/" + encodeURIComponent(id) + "/rechecks", { method: "POST", body: JSON.stringify(data) });
        ev.target.reset();
        showMsg(r.admitted ? "两次复测合格，准予复磨" : "复测已记录，未准入");
        await load();
      } catch (e) { showMsg(e.message, true); }
    };
    document.querySelector("#correctForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var itemId = document.querySelector("#correctItem").value;
      var data = { grindingId: document.querySelector("#correctRecord").value };
      new FormData(ev.target).forEach(function (v, k) { if (v !== "") data[k] = v; });
      try {
        var r = await api("/api/items/" + encodeURIComponent(itemId) + "/corrections", { method: "POST", body: JSON.stringify(data) });
        ev.target.reset();
        showMsg("已更正：" + r.changes.join("；") + (r.revoked ? "，复磨准入已失效" : ""));
        await load();
      } catch (e) { showMsg(e.message, true); }
    };
    document.querySelector("#correctItem").onchange = fillRecords;
    document.querySelector("#statusFilter").onchange = render;
    document.querySelector("#search").oninput = render;
    document.querySelector("#reload").onclick = load;
    load();
  </script>
</body>
</html>`;
}
