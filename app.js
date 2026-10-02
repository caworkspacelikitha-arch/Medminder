(() => {
const KEY = 'medminder.v1';
const FREQ = { 1: 'Once daily', 2: 'Twice daily', 3: 'Three times daily', 0: 'As needed' };
const TIMES = { 1: ['08:00'], 2: ['08:00', '20:00'], 3: ['08:00', '14:00', '20:00'], 0: [] };
const SOON = 30, LOW = 7;
const ICON = {
  dash: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  plus: 'M12 5v14M5 12h14',
  bell: 'M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4',
  leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
};
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></svg>`;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = n => { const d = today(); d.setDate(d.getDate() + n); return iso(d); };
const fmt = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

// ---------- state ----------
function seed() {
  const m = (name, qty, exp, dose, freq, food) => ({ id: crypto.randomUUID(), name, qty, expiry: addDays(exp), dose, freq, food });
  return {
    meds: [
      m('Metformin', 60, 240, '500 mg', 2, 'After food'),
      m('Amlodipine', 28, 120, '5 mg', 1, 'After food'),
      m('Amoxicillin', 14, 12, '500 mg', 3, 'After food'),
      m('Paracetamol', 40, 18, '500 mg', 0, 'After food'),
      m('Cetirizine', 30, 75, '10 mg', 1, 'Before food'),
      m('Omeprazole', 90, 45, '20 mg', 1, 'Before food'),
      m('Ibuprofen', 24, -20, '200 mg', 0, 'After food'),
      m('Vitamin D3', 5, 200, '1000 IU', 1, 'After food')
    ],
    taken: {}, avoided: 2
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
if (!S || !S.meds) S = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

// ---------- derived data ----------
const perDay = m => (m.freq === 0 ? 0 : +m.freq);
const dLeft = m => { const [y, mo, d] = m.expiry.split('-').map(Number); return Math.round((new Date(y, mo - 1, d) - today()) / 864e5); };
const status = m => { const d = dLeft(m); return d < 0 ? 'expired' : d <= SOON ? 'soon' : 'safe'; };
const LABEL = { safe: 'Safe', soon: 'Expiring soon', expired: 'Expired' };
const supply = m => (perDay(m) ? Math.floor(m.qty / perDay(m)) : null);
const unusedAtExpiry = m => {
  const s = status(m); if (s === 'expired') return m.qty;
  if (perDay(m)) return Math.max(0, m.qty - perDay(m) * dLeft(m));
  return m.qty > 30 ? m.qty - 30 : 0; // as-needed: stock above a typical 30 units
};
const atRisk = m => status(m) !== 'expired' && unusedAtExpiry(m) > 0;
const lowStock = m => status(m) !== 'expired' && perDay(m) > 0 && supply(m) <= LOW;
const stats = () => {
  const M = S.meds, total = M.reduce((a, m) => a + m.qty, 0);
  const waste = M.reduce((a, m) => a + unusedAtExpiry(m), 0);
  const overstock = M.filter(atRisk);
  return {
    tracked: M.length, soon: M.filter(m => status(m) === 'soon'), expired: M.filter(m => status(m) === 'expired'),
    risk: M.filter(m => status(m) === 'expired' || atRisk(m)), overstock, low: M.filter(lowStock),
    waste, total, avoided: overstock.length + S.avoided, score: total ? Math.max(0, Math.round(100 - 100 * waste / total)) : 100
  };
};
function alerts() {
  const out = [], st = stats();
  st.expired.forEach(m => out.push({ lv: 'bad', t: `${m.name} has expired`, d: `Expired ${-dLeft(m)} day(s) ago. Do not take it. See disposal guidance.` }));
  st.soon.forEach(m => out.push({ lv: 'warn', t: `${m.name} expires in ${dLeft(m)} day(s)`, d: `${fmt(m.expiry)}. ${m.qty} units left.` }));
  st.overstock.forEach(m => out.push({ lv: 'warn', t: `Potential overstock: ${m.name}`, d: `About ${unusedAtExpiry(m)} of ${m.qty} units may remain unused at expiry at the logged schedule. Avoid buying more.` }));
  st.low.forEach(m => out.push({ lv: 'info', t: `Repurchase alert: ${m.name}`, d: `About ${supply(m)} day(s) of supply left. Check existing stock before you buy.` }));
  return out;
}

// ---------- views ----------
const VIEWS = {
  dashboard: ['Dashboard', dashboard], inventory: ['Medicine inventory', inventory], add: ['Add medicine', addView],
  alerts: ['Smart alerts', alertsView], impact: ['Environmental impact', impact], disposal: ['Responsible disposal', disposal]
};
const NAV = [['dashboard', 'Dashboard', 'dash'], ['inventory', 'Inventory', 'box'], ['add', 'Add medicine', 'plus'], ['alerts', 'Alerts', 'bell'], ['impact', 'Impact', 'leaf'], ['disposal', 'Disposal', 'trash']];
const pill = m => `<span class="pill ${status(m)}">${LABEL[status(m)]}</span>`;
const alertHTML = a => `<div class="alert ${a.lv}"><div><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div></div>`;
const stat = (n, l, c = '') => `<div class="card stat ${c}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
const donut = st => {
  const safe = S.meds.filter(m => status(m) === 'safe').length, a = st.soon.length, e = st.expired.length, t = Math.max(1, safe + a + e);
  const p1 = safe / t * 100, p2 = p1 + a / t * 100;
  return `<div class="donutwrap"><div class="donut" style="background:conic-gradient(#2a8a5a 0 ${p1}%,#c9821a ${p1}% ${p2}%,#c4483b ${p2}% 100%)"><div>${st.tracked}<small>medicines</small></div></div>
  <div class="legend"><span><i style="background:#2a8a5a"></i>Safe: ${safe}</span><span><i style="background:#c9821a"></i>Expiring soon: ${a}</span><span><i style="background:#c4483b"></i>Expired: ${e}</span></div></div>`;
};

function dashboard() {
  const st = stats(), al = alerts().slice(0, 5);
  return `<div class="grid g4">
    ${stat(st.tracked, 'Medicines tracked')}${stat(st.soon.length, 'Expiring soon (≤ 30 days)', 'warn')}
    ${stat(st.risk.length, 'Potential waste risk', 'bad')}${stat(st.low.length, 'Repurchase alerts', 'good')}</div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>Today's schedule</h2>${schedule()}</div>
    <div class="card"><h2>Waste-risk alerts</h2>${al.length ? al.map(alertHTML).join('') : '<p class="empty">No alerts. Nice work.</p>'}<a href="#alerts">View all alerts</a></div>
    <div class="card"><h2>Stock status</h2>${donut(st)}</div>
    <div class="card"><h2>Environmental impact</h2><span class="tag">Illustrative demo metrics</span>
      <p style="margin:0 0 8px">Waste prevention score: <b>${st.score}/100</b></p><div class="bar"><i style="width:${st.score}%"></i></div>
      <p style="margin:10px 0 0;color:var(--mute)">${st.waste} unit(s) could go unused or expired. Using stock first and skipping duplicate purchases keeps them out of landfill and water systems.</p></div>
  </div>`;
}
function schedule() {
  const key = iso(today()), taken = S.taken[key] || {}, rows = [];
  S.meds.filter(m => status(m) !== 'expired').forEach(m => TIMES[m.freq].forEach(t => rows.push({ m, t, k: m.id + t })));
  rows.sort((a, b) => a.t.localeCompare(b.t));
  if (!rows.length) return '<p class="empty">No scheduled doses today.</p>';
  return rows.map(r => `<div class="sched ${taken[r.k] ? 'done' : ''}"><time>${r.t}</time><div class="t"><b>${esc(r.m.name)}</b> ${esc(r.m.dose)}<small>${esc(r.m.food)}</small></div>
    ${taken[r.k] ? '<span class="pill safe">Taken</span>' : `<button class="sm" data-act="take" data-id="${r.m.id}" data-k="${r.k}">Mark taken</button>`}</div>`).join('');
}

let query = '', filter = 'all';
function inventory() {
  return `<div class="card"><div class="row" style="margin-bottom:12px"><input id="q" type="search" placeholder="Search medicines…" value="${esc(query)}" aria-label="Search medicines">
    <select id="f" aria-label="Filter by status">${[['all', 'All statuses'], ['safe', 'Safe'], ['soon', 'Expiring soon'], ['expired', 'Expired']].map(([v, l]) => `<option value="${v}" ${filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div id="tbl">${table()}</div></div>`;
}
function table() {
  const list = S.meds.filter(m => m.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || status(m) === filter)).sort((a, b) => a.expiry.localeCompare(b.expiry));
  if (!list.length) return '<p class="empty">No medicines match. Try a different search, or add one.</p>';
  return `<div class="tablewrap"><table><thead><tr><th>Medicine</th><th>Quantity left</th><th>Expiry</th><th>Status</th><th>Schedule</th><th></th></tr></thead><tbody>${list.map(m => `<tr>
    <td><b>${esc(m.name)}</b><br><small>${esc(m.dose)}</small></td>
    <td><span class="qty"><button class="sm" data-act="dec" data-id="${m.id}" aria-label="Decrease quantity">−</button><b>${m.qty}</b><button class="sm" data-act="inc" data-id="${m.id}" aria-label="Increase quantity">+</button></span></td>
    <td>${fmt(m.expiry)}<br><small>${dLeft(m) < 0 ? -dLeft(m) + ' days ago' : 'in ' + dLeft(m) + ' days'}</small></td>
    <td>${pill(m)}${status(m) === 'expired' ? '<br><small style="color:var(--coral)">Do not consume. <a href="#disposal">Dispose safely</a></small>' : ''}</td>
    <td><small>${FREQ[m.freq]}, ${esc(m.food.toLowerCase())}</small></td>
    <td><button class="sm danger" data-act="del" data-id="${m.id}" aria-label="Delete ${esc(m.name)}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
}

function addView() {
  return `<div class="card" style="max-width:640px"><form id="addf" novalidate>
    <div class="field"><label for="n">Medicine name</label><input id="n" required maxlength="60" placeholder="e.g. Atorvastatin"></div>
    <div class="row"><div class="field"><label for="q2">Quantity (units)</label><input id="q2" type="number" min="1" required></div>
    <div class="field"><label for="e">Expiry date</label><input id="e" type="date" required></div></div>
    <div class="row"><div class="field"><label for="d">Dosage</label><input id="d" maxlength="30" placeholder="e.g. 10 mg"></div>
    <div class="field"><label for="fr">Frequency</label><select id="fr">${Object.entries(FREQ).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="field"><label for="fo">Before / after food</label><select id="fo"><option>Before food</option><option selected>After food</option></select></div></div>
    <div id="dup"></div><p id="err" style="color:var(--coral);margin:0 0 10px"></p>
    <button class="primary" type="submit">Save medicine</button></form></div>`;
}
function alertsView() {
  const al = alerts();
  return `<div class="card" style="margin-bottom:14px"><h2>Check before you buy</h2><p style="margin:0 0 10px;color:var(--mute)">Type a medicine name to see if you already hold stock.</p>
    <input id="chk" placeholder="Medicine name…" aria-label="Check existing stock"><div id="chkout" style="margin-top:10px"></div></div>
    <div class="card"><h2>All alerts (${al.length})</h2>${al.length ? al.map(alertHTML).join('') : '<p class="empty">Nothing needs attention.</p>'}</div>`;
}
function impact() {
  const st = stats();
  return `<span class="tag">Illustrative data: demo estimates from the sample inventory, not real-world measured results.</span>
  <div class="grid g4">${stat(st.tracked, 'Medicines tracked')}${stat(st.waste, 'Potential waste identified (units)', 'bad')}${stat(st.avoided, 'Potential unnecessary purchases avoided', 'good')}${stat(st.score + '/100', 'Waste prevention score', 'good')}</div>
  <div class="grid g2" style="margin-top:14px"><div class="card"><h2>Expiry breakdown</h2>${donut(st)}</div>
  <div class="card"><h2>Why it matters</h2><ul><li>Unused medicines are often thrown away or flushed, which can reach waterways.</li><li>Tracking stock reduces duplicate purchases and the packaging and manufacturing behind them.</li><li>Each avoided purchase is a small step toward a circular, lower-waste health system.</li></ul></div></div>`;
}
function disposal() {
  const ex = stats().expired;
  return `<div class="disposal"><h3>Do not consume expired medicines</h3><p style="margin:4px 0 0">Expired or unwanted medicines should not be taken. This app gives general guidance only. It does not give medical advice or change any prescription. Ask your doctor or pharmacist about treatment questions.</p></div>
  ${ex.length ? `<div class="card" style="margin-bottom:14px"><h2>Ready for disposal</h2><ul>${ex.map(m => `<li><b>${esc(m.name)}</b>, ${m.qty} units, expired ${fmt(m.expiry)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><h2>General responsible-disposal guidance</h2><ul>
  <li>Use a pharmacy or community take-back programme where one is available.</li><li>Follow the label and local authority rules. Flush only if the label or local rules say so.</li>
  <li>If no take-back exists, ask your local waste authority about household disposal.</li><li>Remove or black out personal details on labels before discarding packaging.</li>
  <li>Keep medicines away from children and pets until disposed of.</li><li>Not sure? Ask a pharmacist.</li></ul></div>`;
}

// ---------- router & events ----------
function render() {
  const key = location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'dashboard', [title, fn] = VIEWS[key], n = alerts().filter(a => a.lv === 'bad').length;
  $('#title').textContent = title; $('#today').textContent = today().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#${k}" class="${k === key ? 'on' : ''}">${icon(i)}${l}${k === 'alerts' && n ? `<span class="badge">${n}</span>` : ''}</a>`).join('');
  $('#view').innerHTML = fn(); document.title = `${title} · MedMinder`;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2200); }
const commit = msg => { save(); const keepFocus = document.activeElement && document.activeElement.id === 'q'; if ($('#tbl') && !msg) { $('#tbl').innerHTML = table(); } else render(); if (msg) toast(msg); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const m = S.meds.find(x => x.id === b.dataset.id), a = b.dataset.act;
  if (a === 'del' && m && confirm(`Delete ${m.name}?`)) { S.meds = S.meds.filter(x => x !== m); render(); save(); toast('Medicine deleted'); }
  if (a === 'inc' && m) { m.qty++; save(); render(); }
  if (a === 'dec' && m && m.qty > 0) { m.qty--; save(); render(); }
  if (a === 'take' && m) { const k = iso(today()); (S.taken[k] = S.taken[k] || {})[b.dataset.k] = 1; if (m.qty > 0) m.qty--; save(); render(); toast('Dose logged'); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { query = e.target.value; $('#tbl').innerHTML = table(); }
  if (e.target.id === 'chk' || e.target.id === 'n') {
    const v = e.target.value.trim().toLowerCase(), hit = v.length > 1 ? S.meds.filter(m => m.name.toLowerCase().includes(v)) : [];
    const html = hit.length ? hit.map(m => `<div class="alert ${status(m) === 'expired' ? 'bad' : 'warn'}"><div><b>You already have ${esc(m.name)}</b><small>${m.qty} units, expires ${fmt(m.expiry)} (${LABEL[status(m)]}).${status(m) === 'expired' ? ' Do not use it.' : ' Use this stock before buying more.'}</small></div></div>`).join('') : (v.length > 1 ? '<p class="empty">Not in your inventory.</p>' : '');
    const out = $(e.target.id === 'chk' ? '#chkout' : '#dup'); if (out) out.innerHTML = html;
  }
});
document.addEventListener('change', e => { if (e.target.id === 'f') { filter = e.target.value; $('#tbl').innerHTML = table(); } });
document.addEventListener('submit', e => {
  if (e.target.id !== 'addf') return; e.preventDefault();
  const name = $('#n').value.trim(), qty = parseInt($('#q2').value, 10), exp = $('#e').value;
  if (!name || !(qty > 0) || !exp) { $('#err').textContent = 'Enter a name, a quantity above 0 and an expiry date.'; return; }
  S.meds.push({ id: crypto.randomUUID(), name, qty, expiry: exp, dose: $('#d').value.trim() || '—', freq: +$('#fr').value, food: $('#fo').value });
  save(); location.hash = '#inventory'; render(); toast(`${name} added`);
});
window.addEventListener('hashchange', render);
render();
})();
