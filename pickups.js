// Pickups page: waiver claims, free-agent adds and trades, and what they produced.

const latestSeason = Math.max(...DATA.seasons.map(s => s.season));
const currentManagers = new Set(DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));
const nameOf = id => managersById[id].name;

const PICKUPS = DATA.pickups.map(([season, week, manager, player, type, kept, starts, points, regularPoints, date, moveId]) =>
  ({ season, week, manager, player, type, kept, starts, points, regularPoints, date, moveId }));
const MOVES = DATA.moves.map(([season, manager, waiver, fa, drops, trades]) => ({ season, manager, waiver, fa, drops, trades }));
const SEASONS = [...new Set(MOVES.map(m => m.season))].sort();

const state = { season: "all", games: "all", activeOnly: false, sortKey: "moves", sortDir: "desc" };
const visible = id => !state.activeOnly || currentManagers.has(id);
const inSeason = s => state.season === "all" || s === +state.season;
const ptsOf = p => state.games === "all" ? p.points : p.regularPoints;
const dateLabel = d => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ---------- Transactions by manager ---------- */

function managerRows() {
  const by = {};
  for (const m of MOVES.filter(m => inSeason(m.season))) {
    const r = (by[m.manager] ??= { manager: m.manager, seasons: 0, waiver: 0, fa: 0, drops: 0, trades: 0, pts: 0 });
    r.seasons++; r.waiver += m.waiver; r.fa += m.fa; r.drops += m.drops; r.trades += m.trades;
  }
  for (const p of PICKUPS) if (p.type < 2 && inSeason(p.season) && by[p.manager]) by[p.manager].pts += ptsOf(p);
  return Object.values(by).filter(r => visible(r.manager)).map(r => ({
    ...r, moves: r.waiver + r.fa, perSeason: (r.waiver + r.fa) / r.seasons,
    perMove: r.waiver + r.fa ? r.pts / (r.waiver + r.fa) : 0,
  }));
}

const COLS = [
  { key: "manager", label: "Manager", sort: r => nameOf(r.manager), dir: "asc",
    cell: r => `<span class="team">${swatchHtml(r.manager)}${escapeHtml(nameOf(r.manager))}</span>` },
  { key: "seasons", label: "Seasons", num: true, sort: r => r.seasons, dir: "desc", cell: r => r.seasons },
  { key: "moves", label: "Moves", num: true, sort: r => r.moves, dir: "desc", cell: r => `<b>${r.moves}</b>`,
    title: "Player adds (Yahoo's Moves column)" },
  { key: "perSeason", label: "Per season", num: true, sort: r => r.perSeason, dir: "desc", cell: r => r.perSeason.toFixed(1) },
  { key: "waiver", label: "Waiver claims", num: true, sort: r => r.waiver, dir: "desc", cell: r => r.waiver },
  { key: "fa", label: "Free agents", num: true, sort: r => r.fa, dir: "desc", cell: r => r.fa },
  { key: "drops", label: "Drops", num: true, sort: r => r.drops, dir: "desc", cell: r => r.drops },
  { key: "trades", label: "Trades", num: true, sort: r => r.trades, dir: "desc", cell: r => r.trades },
  { key: "pts", label: "Pickup pts", num: true, sort: r => r.pts, dir: "desc", cell: r => Math.round(r.pts).toLocaleString(),
    title: "Starter points from players this manager claimed on waivers or added as free agents" },
  { key: "perMove", label: "Pts / move", num: true, sort: r => r.perMove, dir: "desc", cell: r => r.perMove.toFixed(1) },
];

function renderCounts() {
  const col = COLS.find(c => c.key === state.sortKey);
  const rows = managerRows().sort((a, b) => {
    const va = col.sort(a), vb = col.sort(b);
    const base = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return (state.sortDir === "asc" ? base : -base) || b.moves - a.moves;
  });
  $("count-head").innerHTML = `<tr>${COLS.map(c => {
    const sorted = c.key === state.sortKey;
    const arrow = sorted ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="${c.num ? "num" : ""}" aria-sort="${sorted ? (state.sortDir === "asc" ? "ascending" : "descending") : "none"}">
      <button type="button" data-key="${c.key}"${c.title ? ` title="${c.title}"` : ""}>${c.label}${arrow}</button></th>`;
  }).join("")}</tr>`;
  $("count-body").innerHTML = rows.map(r => `<tr>${COLS.map(c =>
    `<td class="${c.num ? "num" : ""}">${c.cell(r)}</td>`).join("")}</tr>`).join("");
}

$("count-head").addEventListener("click", e => {
  const key = e.target.closest("button")?.dataset.key;
  if (!key) return;
  const col = COLS.find(c => c.key === key);
  state.sortDir = state.sortKey === key ? (state.sortDir === "asc" ? "desc" : "asc") : col.dir;
  state.sortKey = key;
  renderCounts();
});

/* ---------- Moves by season ---------- */

function renderGrid() {
  const cell = Object.fromEntries(MOVES.map(m => [`${m.manager}|${m.season}`, m]));
  const managers = [...new Set(MOVES.map(m => m.manager))].filter(visible);
  const total = id => MOVES.filter(m => m.manager === id).reduce((a, m) => a + m.waiver + m.fa, 0);
  managers.sort((a, b) => total(b) - total(a));
  const max = Math.max(...MOVES.map(m => m.waiver + m.fa));

  $("grid-head").innerHTML = `<tr><th>Manager</th>${SEASONS.map(s => `<th class="num">${s}</th>`).join("")}<th class="num">All</th></tr>`;
  $("grid-body").innerHTML = managers.map(id => `<tr>
    <th scope="row"><span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span></th>
    ${SEASONS.map(s => {
      const m = cell[`${id}|${s}`];
      if (!m) return `<td class="finish empty"></td>`;
      const n = m.waiver + m.fa;
      const tip = `${nameOf(id)} ${s}: ${n} moves (${m.waiver} waiver claims, ${m.fa} free agents), ${m.drops} drops, ${m.trades} trade${m.trades === 1 ? "" : "s"}`;
      return `<td class="mix-cell" style="--pos:var(--series-1);--share:${(n / max).toFixed(3)}" title="${escapeHtml(tip)}">${n}</td>`;
    }).join("")}
    <td class="num">${total(id)}</td>
  </tr>`).join("");
}

/* ---------- Best pickups ---------- */

const BEST = [
  { type: 0, title: "Best waiver claims", note: "Players claimed off waivers, ranked by the points they scored in the claiming manager's starting lineup for as long as that manager kept them." },
  { type: 1, title: "Best free-agent pickups", note: "Players added straight from free agency after waivers cleared, ranked the same way." },
  { type: 2, title: "Best trade acquisitions", note: "Players received in trades, ranked by starter points for the receiving manager. Click a row to see the whole trade." },
];
const expanded = new Set();  // "moveId|player" rows opened on the trade card

$("best-cards").innerHTML = BEST.map(b => `
  <section class="card">
    <div class="card-head">
      <div>
        <h2>${b.title}</h2>
        <p class="muted">${b.note}</p>
      </div>
      <div class="compare-controls">
        <select id="best-manager-${b.type}" aria-label="Manager"></select>
      </div>
    </div>
    <div class="table-scroll">
      <table class="standings">
        <thead><tr><th class="num">#</th><th>Player</th><th>Manager</th>${b.type === 2 ? "<th>Traded with</th>" : ""}<th>Added</th>
          <th class="num" title="Weeks on that manager's matchup roster">Weeks kept</th><th class="num">Starts</th>
          <th class="num">Starter pts</th><th class="num">Per start</th></tr></thead>
        <tbody id="best-body-${b.type}"></tbody>
      </table>
    </div>
  </section>`).join("");

const managerCell = id => `<span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span>`;
const otherSides = p => DATA.trades[p.moveId].filter(s => s[0] !== p.manager);

// Both sides of a trade: what each manager received and what it scored for them afterwards.
function tradeDetail(p) {
  const sides = DATA.trades[p.moveId].map(([manager, team, items]) => {
    const players = items.filter(it => typeof it[0] === "number");
    const total = players.reduce((a, it) => a + (state.games === "all" ? it[1] : it[2]), 0);
    const lines = items.map(it => {
      if (typeof it[0] === "string") return `<li>${it[0].replace("R", "Round ")} draft pick</li>`;
      const [idx, pts, reg, starts] = it, pl = DATA.players[idx];
      const shown = state.games === "all" ? pts : reg;
      return `<li${it[0] === p.player ? ' class="current"' : ""}><a href="players.html?player=${encodeURIComponent(pl.name)}">${escapeHtml(pl.name)}</a>
        <span class="muted-inline">${pl.pos}</span>
        <span class="trade-pts">${fmtPts(shown)} <span class="muted-inline">in ${starts} start${starts === 1 ? "" : "s"}</span></span></li>`;
    }).join("");
    return { manager, team, total, html: lines, hasPlayers: players.length > 0 };
  });
  const best = Math.max(...sides.map(s => s.total));
  return `<div class="trade-detail">
    <p class="muted-inline">${p.season}, ${dateLabel(p.date)} (week ${p.week}). Points are what each player scored in the receiving manager's starting lineup${state.games === "all" ? "" : " (regular season only)"}.</p>
    <div class="trade-sides">${sides.map(s => `
      <div class="trade-side">
        <div class="trade-head">${managerCell(s.manager)}<span class="muted-inline">${escapeHtml(s.team)} received</span></div>
        <ul>${s.html || `<li class="muted-inline">Nothing listed</li>`}</ul>
        <div class="trade-total">${fmtPts(s.total)} starter pts${sides.length > 1 && s.hasPlayers && s.total === best && best > 0 ? ` <span class="tag">Won the trade</span>` : ""}</div>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderBest(type) {
  const m = $(`best-manager-${type}`).value;
  const isTrade = type === 2, cols = isTrade ? 9 : 8;
  const list = PICKUPS
    .filter(p => p.type === type && inSeason(p.season) && visible(p.manager) && (!m || p.manager === m) && ptsOf(p) > 0)
    .sort((a, b) => ptsOf(b) - ptsOf(a)).slice(0, 15);
  $(`best-body-${type}`).innerHTML = list.map((p, i) => {
    const pl = DATA.players[p.player];
    const key = `${p.moveId}|${p.player}`, open = isTrade && expanded.has(key);
    const row = `<tr${isTrade ? ` class="expandable${open ? " open" : ""}" data-key="${key}"` : ""}>
      <td class="num">${isTrade ? `<button type="button" class="expand-btn" aria-expanded="${open}" aria-label="Show the whole trade">${open ? "▾" : "▸"}</button> ` : ""}${i + 1}</td>
      <td><a href="players.html?player=${encodeURIComponent(pl.name)}">${escapeHtml(pl.name)}</a> <span class="muted-inline">${pl.pos}</span></td>
      <td>${managerCell(p.manager)}</td>
      ${isTrade ? `<td>${otherSides(p).map(s => managerCell(s[0])).join("")}</td>` : ""}
      <td>${p.season} Wk ${p.week} <span class="muted-inline">${dateLabel(p.date)}</span></td>
      <td class="num">${p.kept}</td>
      <td class="num">${p.starts}</td>
      <td class="num"><b>${fmtPts(ptsOf(p))}</b></td>
      <td class="num">${p.starts ? (ptsOf(p) / p.starts).toFixed(1) : "–"}</td>
    </tr>`;
    return row + (open ? `<tr class="detail-row"><td colspan="${cols}">${tradeDetail(p)}</td></tr>` : "");
  }).join("") || `<tr><td colspan="${cols}" class="muted">Nothing matches.</td></tr>`;
}

$("best-body-2").addEventListener("click", e => {
  if (e.target.closest("a")) return;
  const tr = e.target.closest("tr.expandable");
  if (!tr) return;
  const key = tr.dataset.key;
  expanded.has(key) ? expanded.delete(key) : expanded.add(key);
  renderBest(2);
});

/* ---------- Init ---------- */

function renderAll() { renderCounts(); renderGrid(); BEST.forEach(b => renderBest(b.type)); }

$("season-filter").innerHTML = `<option value="all">All seasons</option>` +
  [...SEASONS].reverse().map(s => `<option value="${s}">${s}</option>`).join("");
const managerOptions = `<option value="">All managers</option>` +
  [...new Set(MOVES.map(m => m.manager))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map(id => `<option value="${id}">${escapeHtml(nameOf(id))}</option>`).join("");
for (const b of BEST) {
  $(`best-manager-${b.type}`).innerHTML = managerOptions;
  $(`best-manager-${b.type}`).addEventListener("change", () => renderBest(b.type));
}
$("season-filter").addEventListener("change", e => { state.season = e.target.value; renderAll(); });
$("game-filter").addEventListener("change", e => { state.games = e.target.value; renderAll(); });
$("active-only").addEventListener("change", e => { state.activeOnly = e.target.checked; renderAll(); });
renderAll();
