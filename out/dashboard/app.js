'use strict';
/* Token Radar dashboard: renders window.RADAR (from ../data.js) with no network.
   Views: the ranked board, the live-token comparables, and the model with a sandbox that
   re-prices every row from the same snapshot figures. Deep links: #/row/<slug> opens a
   protocol's detail, #/cat/<category> filters the board, #/live and #/model switch tabs. */
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = (n) => {
  if (n === null || n === undefined) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
};
const fmtPct = (x) => {
  if (x === null || x === undefined) return '<span class="flat">—</span>';
  const v = x; // change_7d is a percent: 5.64 means +5.64%
  const cls = v > 0.5 ? 'up' : v < -0.5 ? 'down' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
};
const fmtAge = (d) => (d === null || d === undefined ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd');
const fmtMult = (x) => x.toFixed(2) + '×';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const WL = new Set(R.watchlist);
const M = R.model;
const F = { q: '', cat: '', chain: '', wl: false, sort: 'implied' };
const SB = { growth: M.growth_weight, maturity: M.maturity_range, chain: M.chain_step, scale: 1 };
const sbActive = () => SB.growth !== M.growth_weight || SB.maturity !== M.maturity_range || SB.chain !== M.chain_step || SB.scale !== 1;

/* The sandbox re-price of one row, from the same snapshot figures the published model uses. */
function sandboxImplied(row) {
  const growthPct = clamp(row.change_7d === null ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
  const growth = 1 + (growthPct / 100) * SB.growth;
  const age = row.age_days === null ? M.unknown_age_days : row.age_days;
  const maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * SB.maturity;
  const chainF = 1 + Math.min(Math.max(row.chains.length - 1, 0), M.chain_max_extra) * SB.chain;
  return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * SB.scale * growth * maturity * chainF));
}

function visibleRows() {
  let rows = R.rows.filter((r) => {
    if (F.wl && !WL.has(r.slug)) return false;
    if (F.cat && r.category !== F.cat) return false;
    if (F.chain && !r.chains.includes(F.chain)) return false;
    if (F.q) {
      const q = F.q.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const by = {
    implied: (a, b) => sandboxImplied(b) - sandboxImplied(a) || (a.slug < b.slug ? -1 : 1),
    tvl: (a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1),
    growth: (a, b) => (b.change_7d ?? -99) - (a.change_7d ?? -99),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
  }[F.sort] || ((a, b) => a.rank - b.rank);
  return rows.sort(by);
}

function chainPills(chains) {
  const shown = chains.slice(0, 3).map((c) => `<span class="pill">${esc(c)}</span>`).join('');
  return shown + (chains.length > 3 ? `<span class="pill">+${chains.length - 3}</span>` : '');
}

function renderBoard() {
  const rows = visibleRows();
  const top = rows.length ? Math.max(...rows.map((r) => sandboxImplied(r))) : 1;
  $('board-body').innerHTML = rows.map((r, i) => {
    const imp = sandboxImplied(r);
    const pct = Math.max(2, Math.round((imp / top) * 100));
    return `<tr data-slug="${esc(r.slug)}" class="${sel === r.slug ? 'sel' : ''}">
      <td class="num">${i + 1}</td>
      <td><span class="nm">${esc(r.name)}</span>${WL.has(r.slug) ? '<span class="badge">WATCHLIST</span>' : ''}<br><span class="sl">${esc(r.slug)} · published rank #${r.rank}</span></td>
      <td>${esc(r.category ?? '—')}</td>
      <td>${chainPills(r.chains)}</td>
      <td class="num">${fmtMoney(r.tvl_usd)}</td>
      <td class="num">${fmtPct(r.change_7d)}</td>
      <td class="num">${fmtAge(r.age_days)}</td>
      <td class="num"><b>${fmtMoney(imp)}</b><br><span style="display:inline-block;height:4px;width:${pct}%;background:var(--amber);border-radius:2px"></span></td>
      <td><button type="button" class="close" data-open="${esc(r.slug)}">Plan</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--muted)">No protocols match these filters.</td></tr>`;
  const combined = rows.reduce((n, r) => n + sandboxImplied(r), 0);
  $('count').textContent = `Showing ${rows.length} of ${R.rows.length} protocols · combined implied value ${fmtMoney(combined)}` +
    (sbActive() ? ' · sandbox active — order reflects your dials, not the published board.' : '');
  document.querySelectorAll('#board-body tr[data-slug]').forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('button')) openDetail(tr.dataset.slug); });
  });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
}

let sel = null;
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  sel = slug;
  const comp = R.comparables.find((c) => c.category === (r.category ?? 'Unknown'));
  const steps = (r.farm_steps || []).map((s) => {
    const e = esc(s).replace(/ Cost: /, '<br><span class="ct">Cost: ').replace(/ Time: /, ' · Time: ') + '</span>';
    return `<li>${e}</li>`;
  }).join('');
  $('detail').hidden = false;
  $('detail').innerHTML = `
    <button type="button" class="close" id="detail-close">Close ✕</button>
    <h2>${esc(r.name)} ${WL.has(r.slug) ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
    <p class="dsub">${esc(r.slug)} · ${esc(r.category ?? 'Uncategorised')} · ${esc(r.chains.join(', ') || 'no chain listed')} · published rank #${r.rank} of ${R.rows.length}</p>
    <div class="kv">
      <div><div class="k">Implied value</div><div class="v">${fmtMoney(r.implied_value_usd)}</div><div class="d">published model</div></div>
      <div><div class="k">TVL</div><div class="v">${fmtMoney(r.tvl_usd)}</div><div class="d">snapshot ${esc(R.as_of)}</div></div>
      <div><div class="k">7-day change</div><div class="v">${r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</div><div class="d">growth ×${r.growth_multiplier.toFixed(2)}</div></div>
      <div><div class="k">Age with no token</div><div class="v">${fmtAge(r.age_days)}</div><div class="d">maturity ×${r.maturity_multiplier.toFixed(2)}</div></div>
      <div><div class="k">Category multiple</div><div class="v">${fmtMult(r.category_multiple)}</div><div class="d">${r.comparables_n} live comparable${r.comparables_n === 1 ? '' : 's'}${comp ? ` · median ${fmtMult(comp.median)}` : ''}</div></div>
      <div><div class="k">Chain breadth</div><div class="v">×${r.chain_factor.toFixed(2)}</div><div class="d">${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</div></div>
    </div>
    <p class="lede">Why it ranks here: ${fmtMoney(r.tvl_usd)} of TVL priced at the ${esc(r.category ?? 'market')} comparable multiple of ${fmtMult(r.category_multiple)}, ${r.change_7d === null ? 'no 7-day change recorded' : '7-day change ' + r.change_7d.toFixed(1) + '%'}, and ${r.age_days === null ? 'an unknown listing date' : fmtAge(r.age_days) + ' listed with no token recorded'}.</p>
    <h3>Farm plan — 7 steps</h3>
    <ol class="steps">${steps}</ol>`;
  $('detail-close').addEventListener('click', closeDetail);
  document.querySelectorAll('#board-body tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
  $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
}
function closeDetail() { sel = null; $('detail').hidden = true; $('detail').innerHTML = ''; document.querySelectorAll('#board-body tr').forEach((tr) => tr.classList.remove('sel')); }

function renderLive() {
  $('live-body').innerHTML = R.live.map((p) => `<tr>
    <td><span class="nm">${esc(p.name)}</span><br><span class="sl">${esc(p.slug)}</span></td>
    <td>${esc(p.category ?? '—')}</td><td>${chainPills(p.chains)}</td>
    <td class="num">${fmtMoney(p.tvl_usd)}</td><td class="num">${fmtMoney(p.mcap_usd)}</td>
    <td class="num">${p.mcap_tvl === null ? '—' : fmtMult(p.mcap_tvl)}</td><td class="num">${fmtPct(p.change_7d)}</td>
  </tr>`).join('');
}

function renderComps() {
  $('comp-body').innerHTML = R.comparables.map((c) => `<tr>
    <td>${esc(c.category)}</td><td class="num">${c.n}</td>
    <td class="num">${c.median === null ? '—' : fmtMult(c.median)}</td><td class="num"><b>${fmtMult(c.multiple)}</b></td>
  </tr>`).join('') + `<tr><td><b>Market median (all categories)</b></td><td class="num">—</td><td class="num">—</td><td class="num"><b>${fmtMult(R.overall_median)}</b></td></tr>`;
}

function renderStats() {
  const top10 = R.rows.slice(0, 10).reduce((n, r) => n + r.implied_value_usd, 0);
  const wlCovered = R.rows.filter((r) => WL.has(r.slug)).length;
  $('stats').innerHTML = `
    <div class="stat"><div class="k">Protocols ranked</div><div class="v">${R.rows.length}</div><div class="d">pre-token candidates</div></div>
    <div class="stat"><div class="k">Watchlist covered</div><div class="v">${wlCovered}<small> / ${R.watchlist_size}</small></div><div class="d">floor $50M TVL, never a ceiling</div></div>
    <div class="stat"><div class="k">Top 10 implied value</div><div class="v">${fmtMoney(top10)}</div><div class="d">combined, published model</div></div>
    <div class="stat"><div class="k">Market median multiple</div><div class="v">${fmtMult(R.overall_median)}</div><div class="d">median mcap / TVL, live tokens</div></div>`;
  $('meta').innerHTML = `Snapshot <b>DefiLlama · ${esc(R.as_of)}</b><br>${R.rows.length} ranked · ${R.live_size} live comparables<br>Model <b>${esc(R.model_version)}</b> · floor ${fmtMoney(R.floor_usd)}`;
  $('foot-source').textContent = `Source: ${R.source}, snapshot as of ${R.as_of}. ${R.rows.length} protocols ranked from 758 in the snapshot; ${R.live_size} live-token protocols price the comparables.`;
  $('foot-model').textContent = R.model_version;
}

function showTab(tab) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('view-board').hidden = tab !== 'board';
  $('view-live').hidden = tab !== 'live';
  $('view-model').hidden = tab !== 'model';
  if (tab === 'live') renderLive();
  if (tab === 'model') renderComps();
}

/* Controls */
function fillSelects() {
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}
$('q').addEventListener('input', (e) => { F.q = e.target.value; renderBoard(); });
$('cat').addEventListener('change', (e) => { F.cat = e.target.value; renderBoard(); });
$('chain').addEventListener('change', (e) => { F.chain = e.target.value; renderBoard(); });
$('wl').addEventListener('change', (e) => { F.wl = e.target.checked; renderBoard(); });
$('sort').addEventListener('change', (e) => { F.sort = e.target.value; renderBoard(); });
document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const map = { rank: 'implied', name: 'name', category: 'implied', tvl: 'tvl', growth: 'growth', age: 'age', implied: 'implied' };
  F.sort = map[th.dataset.sort] || 'implied';
  $('sort').value = F.sort;
  renderBoard();
}));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  showTab(b.dataset.tab);
  history.replaceState(null, '', b.dataset.tab === 'board' ? location.pathname : '#/' + b.dataset.tab);
}));
[['sb-growth', 'growth', 'sb-growth-v', (v) => v.toFixed(2)],
 ['sb-maturity', 'maturity', 'sb-maturity-v', (v) => v.toFixed(2)],
 ['sb-chain', 'chain', 'sb-chain-v', (v) => v.toFixed(2)],
 ['sb-scale', 'scale', 'sb-scale-v', (v) => v.toFixed(1) + '×']].forEach(([id, key, out, fmt]) => {
  $(id).addEventListener('input', (e) => { SB[key] = parseFloat(e.target.value); $(out).textContent = fmt(SB[key]); renderBoard(); });
});
$('sb-reset').addEventListener('click', () => {
  SB.growth = M.growth_weight; SB.maturity = M.maturity_range; SB.chain = M.chain_step; SB.scale = 1;
  $('sb-growth').value = SB.growth; $('sb-maturity').value = SB.maturity;
  $('sb-chain').value = SB.chain; $('sb-scale').value = SB.scale;
  $('sb-growth-v').textContent = SB.growth.toFixed(2); $('sb-maturity-v').textContent = SB.maturity.toFixed(2);
  $('sb-chain-v').textContent = SB.chain.toFixed(2); $('sb-scale-v').textContent = '1.0×';
  renderBoard();
});

/* Deep links: #/row/<slug>, #/cat/<category>, #/live, #/model */
function applyHash() {
  const h = location.hash || '';
  if (h.startsWith('#/row/')) { openDetail(decodeURIComponent(h.slice(6))); return; }
  if (h.startsWith('#/cat/')) {
    F.cat = decodeURIComponent(h.slice(6));
    $('cat').value = F.cat;
    renderBoard();
    return;
  }
  if (h === '#/live') { showTab('live'); return; }
  if (h === '#/model') { showTab('model'); return; }
}

fillSelects();
renderStats();
renderBoard();
applyHash();
