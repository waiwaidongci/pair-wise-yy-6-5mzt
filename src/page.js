// 视图层:单页界面,数据全部来自 /api,刷新后列表、统计与履历保持一致。
export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>磨面温升与冷却复磨准入台</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; }
    main { display:grid; grid-template-columns:400px 1fr; gap:22px; padding:22px 28px; align-items:start; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; }
    input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; margin-top:12px; }
    button.secondary { background:#69736a; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; }
    .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
    .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; align-content:start; }
    .card h3 { margin:0; }
    .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; justify-self:start; }
    .pill.warn { background:var(--warn); border-color:var(--warn); color:#fff; }
    .pill.ok { background:var(--accent); border-color:var(--accent); color:#fff; }
    .cooling-box { border:1px dashed var(--warn); border-radius:6px; padding:8px; background:#faf3f1; font-size:13px; display:grid; gap:4px; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:110px; overflow:auto; font-size:13px; }
    .hint { font-size:12px; color:var(--muted); margin-top:6px; line-height:1.5; }
    .toast { position:fixed; left:50%; bottom:26px; transform:translateX(-50%); background:#20241f; color:#fff; padding:10px 16px; border-radius:6px; font-size:14px; opacity:0; transition:opacity .2s; pointer-events:none; max-width:80vw; z-index:9; }
    .toast.show { opacity:.95; } .toast.err { background:var(--warn); }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>磨面温升与冷却复磨准入台</h1><div class="meta">试磨登记 · 磨面温升判定 · 冷却复测准入 · 更正留痕</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section>
      <form id="createForm">
        <h2>新增墨锭</h2>
        <label>墨锭编号 *</label><input name="code" required>
        <label>烟料来源</label><input name="smokeSource">
        <label>胶料比例</label><input name="glueRatio">
        <label>存放年限</label><input name="ageYears" type="number" step="any">
        <label>存放位置</label><input name="storage">
        <button>保存墨锭</button>
      </form>
      <form id="sessionForm" style="margin-top:14px">
        <h2>试磨登记</h2>
        <label>选择墨锭</label><select name="item" id="sessionItem"></select>
        <label>磨石</label><input name="stone" placeholder="缺项将转待冷却">
        <label>克重(g)</label><input name="weight" type="number" step="any">
        <label>时长(分钟,超20转待冷却)</label><input name="minutes" type="number" step="any">
        <label>磨面温度(℃,达45转待冷却)</label><input name="surfaceTemp" type="number" step="any">
        <label>试磨人</label><input name="tester">
        <label>登记时间(可选,默认现在)</label><input name="at" type="datetime-local">
        <button>提交登记</button>
        <div class="hint">每锭只留一条未结束(待冷却)试磨;重复或并发提交沿用首次。</div>
      </form>
      <form id="recheckForm" style="margin-top:14px">
        <h2>冷却复测</h2>
        <label>待冷却墨锭</label><select name="item" id="recheckItem"></select>
        <div class="hint" id="recheckHint"></div>
        <label>复测温度(℃,≤35)</label><input name="temp" type="number" step="any" required>
        <label>复测人(须为试磨人之外的另一人)</label><input name="by" required>
        <label>复测时间(可选,默认现在)</label><input name="at" type="datetime-local">
        <button>提交复测</button>
        <div class="hint">另一人连续两次复测,间隔≥20分钟,均≤35℃且温差≤2℃才准入复磨。</div>
      </form>
      <form id="correctForm" style="margin-top:14px">
        <h2>记录更正</h2>
        <label>墨锭(待冷却/已准入)</label><select name="item" id="correctItem"></select>
        <label>更正项</label><select name="field"><option value="stone">磨石</option><option value="weight">克重</option><option value="surfaceTemp">磨面温度</option></select>
        <label>更正为</label><input name="value" required>
        <label>更正人</label><input name="by">
        <button>提交更正</button>
        <div class="hint">更正磨石、克重或磨面温度会使准入失效并保留旧记录,需重新复测。</div>
      </form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar">
        <select id="statusFilter"><option value="">全部状态</option></select>
        <input id="search" placeholder="搜索编号或关键词">
      </div>
      <div class="panel">
        <h2>墨锭列表与履历</h2>
        <div class="grid" id="cards"></div>
      </div>
    </section>
  </main>
  <div class="toast" id="toast"></div>
  <script>
    var STAGES = ['待试磨', '待冷却', '已试磨'];
    var STATE_LABEL = { cooling: '待冷却', done: '已试磨', admitted: '已准入' };
    var BASE_FIELDS = [['smokeSource','烟料来源'],['glueRatio','胶料比例'],['ageYears','存放年限'],['storage','存放位置']];
    var items = [];
    var reqIds = {};
    function newReqId(key) { reqIds[key] = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random(); }
    ['session', 'recheck', 'correct'].forEach(newReqId);

    var createForm = document.querySelector('#createForm');
    var sessionForm = document.querySelector('#sessionForm');
    var recheckForm = document.querySelector('#recheckForm');
    var correctForm = document.querySelector('#correctForm');
    var cardsEl = document.querySelector('#cards');
    var statsEl = document.querySelector('#stats');
    var statusFilter = document.querySelector('#statusFilter');
    var searchEl = document.querySelector('#search');
    var toastEl = document.querySelector('#toast');

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
      });
    }
    function fmt(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      return isNaN(d) ? String(iso) : d.toLocaleString('zh-CN', { hour12: false });
    }
    function num(v, unit) { return (v === null || v === undefined || v === '') ? '—' : String(v) + (unit || ''); }

    var toastTimer = null;
    function toast(msg, isErr) {
      toastEl.textContent = msg;
      toastEl.className = 'toast show' + (isErr ? ' err' : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function(){ toastEl.className = 'toast'; }, 3200);
    }

    async function api(path, options) {
      var res = await fetch(path, options && options.body ? Object.assign({}, options, { headers: { 'Content-Type': 'application/json' } }) : options);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || '请求失败');
      return data;
    }

    function itemKey(item) { return item.id || item.code; }
    function correctableSession(item) {
      var list = (item.sessions || []).filter(function(s){ return s.state === 'cooling' || s.state === 'admitted'; });
      return list[list.length - 1] || null;
    }

    async function load() {
      items = await api('/api/items');
      render();
    }
    function render() {
      renderStats();
      renderFilter();
      renderSelects();
      renderCards();
    }
    function statusCounts() {
      var counts = {};
      STAGES.forEach(function(s){ counts[s] = 0; });
      items.forEach(function(item){ counts[item.status] = (counts[item.status] || 0) + 1; });
      return counts;
    }
    function renderStats() {
      var counts = statusCounts();
      statsEl.innerHTML = Object.keys(counts).map(function(k){
        return '<div class="stat"><span>' + esc(k) + '</span><strong>' + counts[k] + '</strong></div>';
      }).join('');
    }
    function renderFilter() {
      var old = statusFilter.value;
      statusFilter.innerHTML = '<option value="">全部状态</option>' + Object.keys(statusCounts()).map(function(s){
        return '<option' + (s === old ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
    }
    function fillSelect(sel, options) {
      var old = sel.value;
      sel.innerHTML = options.map(function(o){ return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('');
      if (old && options.some(function(o){ return o.value === old; })) sel.value = old;
    }
    function renderSelects() {
      fillSelect(document.querySelector('#sessionItem'), items.map(function(item){
        return { value: itemKey(item), label: item.code + ' · ' + item.status };
      }));
      fillSelect(document.querySelector('#recheckItem'), items.filter(function(item){ return item.pendingSessionId; }).map(function(item){
        var s = item.sessions.find(function(x){ return x.id === item.pendingSessionId; });
        return { value: itemKey(item), label: item.code + ' · 已复测' + s.rechecks.length + '次' };
      }));
      fillSelect(document.querySelector('#correctItem'), items.filter(correctableSession).map(function(item){
        var s = correctableSession(item);
        return { value: itemKey(item), label: item.code + ' · ' + STATE_LABEL[s.state] + (s.admission && s.admission.granted ? ' · 已准入' : '') };
      }));
      updateRecheckHint();
    }
    function updateRecheckHint() {
      var hint = document.querySelector('#recheckHint');
      var id = document.querySelector('#recheckItem').value;
      var item = items.find(function(x){ return itemKey(x) === id; });
      if (!item || !item.pendingSessionId) { hint.textContent = ''; return; }
      var s = item.sessions.find(function(x){ return x.id === item.pendingSessionId; });
      var last = s.rechecks[s.rechecks.length - 1];
      hint.textContent = '待冷却原因:' + (s.reasons.join(';') || '—') + '。已复测' + s.rechecks.length + '次' +
        (last ? ',上次 ' + last.temp + '℃(' + fmt(last.at) + ', ' + last.by + '),两次须间隔≥20分钟' : '');
    }
    function renderCards() {
      var status = statusFilter.value;
      var q = searchEl.value.trim();
      var visible = items.filter(function(item){
        return (!status || item.status === status) && (!q || JSON.stringify(item).indexOf(q) >= 0);
      });
      cardsEl.innerHTML = visible.map(cardHtml).join('') || '<div class="meta">暂无墨锭</div>';
      document.querySelectorAll('[data-note]').forEach(function(btn){
        btn.onclick = async function() {
          var note = prompt('记录备注');
          if (!note) return;
          try {
            await api('/api/items/' + encodeURIComponent(btn.dataset.note) + '/logs', { method: 'POST', body: JSON.stringify({ step: '备注', note: note }) });
            await load();
          } catch (err) { toast(err.message, true); }
        };
      });
    }
    function cardHtml(item) {
      var base = BASE_FIELDS.map(function(pair){
        return '<div><b>' + pair[1] + '</b> ' + esc(item[pair[0]] == null ? '' : item[pair[0]]) + '</div>';
      }).join('');
      var pillCls = item.status === '待冷却' ? 'pill warn' : (item.status === '已试磨' ? 'pill ok' : 'pill');
      var pending = '';
      if (item.pendingSessionId) {
        var s = item.sessions.find(function(x){ return x.id === item.pendingSessionId; });
        var last = s.rechecks[s.rechecks.length - 1];
        pending = '<div class="cooling-box"><b>待冷却:' + esc(s.reasons.join(';') || '复测中') + '</b>' +
          '<div class="meta">已复测' + s.rechecks.length + '次' + (last ? ' · 最近 ' + last.temp + '℃ by ' + esc(last.by) : '') + '</div>' +
          '<div class="meta">准入条件:另一人连续两次复测,间隔≥20分钟,均≤35℃且温差≤2℃</div></div>';
      }
      var sessions = (item.sessions || []).slice(-3).reverse().map(function(s){
        return '<div class="meta">' + fmt(s.at) + ' · ' + esc(s.tester || '—') + ' · ' + esc(s.stone || '—') +
          ' ' + num(s.weight, 'g') + ' ' + num(s.minutes, '分钟') + ' ' + num(s.surfaceTemp, '℃') +
          ' → ' + STATE_LABEL[s.state] +
          (s.reasons && s.reasons.length ? '(' + esc(s.reasons.join(';')) + ')' : '') +
          (s.admission && s.admission.granted ? ' · 已准入(' + esc(s.admission.by) + ')' : '') +
          (s.corrections && s.corrections.length ? ' · 更正' + s.corrections.length + '次' : '') +
          '</div>';
      }).join('');
      var logs = (item.logs || []).slice(-4).map(function(l){
        return '<div>' + esc(l.step) + ' · ' + fmt(l.at) + ':' + esc(l.note) + '</div>';
      }).join('');
      return '<article class="card"><h3>' + esc(item.code) + '</h3><span class="' + pillCls + '">' + esc(item.status) + '</span>' +
        base + pending +
        (sessions ? '<div><b>试磨记录</b>' + sessions + '</div>' : '') +
        '<button class="secondary" data-note="' + esc(itemKey(item)) + '">追加备注</button>' +
        '<div class="logs meta">' + (logs || '暂无履历') + '</div></article>';
    }

    createForm.onsubmit = async function(event) {
      event.preventDefault();
      try {
        await api('/api/items', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
        createForm.reset(); toast('墨锭已建档'); await load();
      } catch (err) { toast(err.message, true); }
    };
    sessionForm.onsubmit = async function(event) {
      event.preventDefault();
      var data = Object.fromEntries(new FormData(sessionForm).entries());
      var id = data.item; delete data.item;
      if (!data.at) delete data.at; else data.at = new Date(data.at).toISOString();
      data.requestId = reqIds.session;
      try {
        var r = await api('/api/items/' + encodeURIComponent(id) + '/sessions', { method: 'POST', body: JSON.stringify(data) });
        newReqId('session'); sessionForm.reset();
        toast(r.reused ? '该锭已有未结束试磨,已沿用首次登记' : (r.session.state === 'done' ? '登记合格,计入已试磨' : '已转待冷却:' + r.session.reasons.join(';')));
        await load();
      } catch (err) { toast(err.message, true); }
    };
    recheckForm.onsubmit = async function(event) {
      event.preventDefault();
      var data = Object.fromEntries(new FormData(recheckForm).entries());
      var item = items.find(function(x){ return itemKey(x) === data.item; });
      if (!item || !item.pendingSessionId) { toast('该墨锭没有待冷却试磨', true); return; }
      var payload = { temp: data.temp, by: data.by, requestId: reqIds.recheck };
      if (data.at) payload.at = new Date(data.at).toISOString();
      try {
        var r = await api('/api/items/' + encodeURIComponent(data.item) + '/sessions/' + item.pendingSessionId + '/rechecks', { method: 'POST', body: JSON.stringify(payload) });
        newReqId('recheck'); recheckForm.reset();
        toast(r.granted ? '复测合格,已准入复磨' : '复测已记录,暂未准入');
        await load();
      } catch (err) { toast(err.message, true); }
    };
    correctForm.onsubmit = async function(event) {
      event.preventDefault();
      var data = Object.fromEntries(new FormData(correctForm).entries());
      var item = items.find(function(x){ return itemKey(x) === data.item; });
      var s = item && correctableSession(item);
      if (!s) { toast('该墨锭没有可更正的试磨记录', true); return; }
      try {
        var r = await api('/api/items/' + encodeURIComponent(data.item) + '/sessions/' + s.id + '/corrections', {
          method: 'POST', body: JSON.stringify({ field: data.field, value: data.value, by: data.by, requestId: reqIds.correct })
        });
        newReqId('correct'); correctForm.reset();
        toast(r.revoked ? '已更正,准入失效,需重新复测' : '已更正,旧记录已保留');
        await load();
      } catch (err) { toast(err.message, true); }
    };

    document.querySelector('#recheckItem').onchange = updateRecheckHint;
    statusFilter.onchange = renderCards;
    searchEl.oninput = renderCards;
    document.querySelector('#reload').onclick = function(){ load().catch(function(err){ toast(err.message, true); }); };
    load().catch(function(err){ toast(err.message, true); });
  </script>
</body>
</html>`;
}
