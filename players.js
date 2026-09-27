// Players page: positional strength grid, player lookup, most-started pairings, signature players,
// biggest single games. Everything is computed from DATA.starts (starters only, from verified lineups).

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const MIN_STARTS = 15;  // below this, a manager's position average is shown muted as a small sample

const latestSeason = Math.max(...DATA.seasons.map(s => s.season));
const currentManagers = new Set(DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));
const nameOf = id => managersById[id].name;
const endWeekOf = Object.fromEntries(DATA.seasons.map(s => [s.season, s.endWeek]));
const playoffStartOf = Object.fromEntries(DATA.seasons.map(s => [s.season, s.playoffStartWeek]));

// Unpack starts once. A flex start counts at the player's real position.
const ALL_STARTS = DATA.starts.map(([season, week, manager, p, slot, pts, type]) => ({
  season, week, manager, player: p, slot, pts, type,
  pos: slot === "W/R/T" ? DATA.players[p].pos : slot,
}));

const state = { games: "all", activeOnly: false, metric: "above", sortKey: "Overall", sortDir: "desc" };

function filteredStarts() {
  return ALL_STARTS.filter(s => state.games === "all" || s.type === 0);
}
const managerVisible = id => !state.activeOnly || currentManagers.has(id);

const fmt1 = x => x.toFixed(1);
const signed = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1);
const playerName = i => DATA.players[i].name;

function whenLabel(s) {
  if (s.type === 0) return `${s.season} Wk ${s.week}`;
  if (s.type === 2) return `${s.season} Wk ${s.week} (consolation)`;
  return `${s.season} ${s.week === endWeekOf[s.season] ? "Final week" : "Semifinal"}`;
}

/* ---------- Positional strength ---------- */

function positionTable(starts) {
  // League average per season and position is the baseline, so eras compare fairly.
  const base = {};
  for (const s of starts) {
    const b = (base[`${s.season}|${s.pos}`] ??= { n: 0, pts: 0 });
    b.n++; b.pts += s.pts;
  }
  const baseAvg = k => base[k].pts / base[k].n;

  const rows = {};
  for (const s of starts) {
    const r = (rows[s.manager] ??= { manager: s.manager, cells: {}, all: { n: 0, pts: 0, diff: 0 } });
    const c = (r.cells[s.pos] ??= { n: 0, pts: 0, diff: 0 });
    const d = s.pts - baseAvg(`${s.season}|${s.pos}`);
    c.n++; c.pts += s.pts; c.diff += d;
    r.all.n++; r.all.pts += s.pts; r.all.diff += d;
  }
  const leagueAvg = {};
  for (const pos of POSITIONS) {
    const ss = starts.filter(s => s.pos === pos);
    leagueAvg[pos] = ss.reduce((a, s) => a + s.pts, 0) / ss.length;
  }
  return { rows: Object.values(rows), leagueAvg };
}

function cellValue(c, pos, leagueAvg) {
  if (!c || !c.n) return null;
  switch (state.metric) {
    case "above": return c.diff / c.n;
    case "avg": return c.pts / c.n;
    case "total": return c.pts;
    case "starts": return c.n;
  }
}

function renderPositions() {
  const { rows, leagueAvg } = positionTable(filteredStarts());
  const visible = rows.filter(r => managerVisible(r.manager));
  const cols = [...POSITIONS, "Overall"];
  const get = (r, col) => col === "Overall" ? r.all : r.cells[col];
  const reliable = c => c && c.n >= MIN_STARTS;

  // Color scale per column, from reliable cells only.
  const scale = {};
  for (const col of cols) {
    const vals = visible.filter(r => reliable(get(r, col)))
      .map(r => cellValue(get(r, col), col, leagueAvg));
    if (state.metric === "above") scale[col] = Math.max(...vals.map(Math.abs), 0.1);
    else if (state.metric === "avg") {
      const ref = col === "Overall" ? null : leagueAvg[col];
      scale[col] = { ref, spread: Math.max(...vals.map(v => Math.abs(v - (ref ?? avgOf(vals)))), 0.1), mean: avgOf(vals) };
    } else scale[col] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  const sortCol = state.sortKey;
  visible.sort((a, b) => {
    if (sortCol === "manager") return nameOf(a.manager).localeCompare(nameOf(b.manager)) * (state.sortDir === "asc" ? 1 : -1);
    const va = reliable(get(a, sortCol)) ? cellValue(get(a, sortCol), sortCol, leagueAvg) : -Infinity;
    const vb = reliable(get(b, sortCol)) ? cellValue(get(b, sortCol), sortCol, leagueAvg) : -Infinity;
    return state.sortDir === "asc" ? va - vb : vb - va;
  });

  // Best manager per position (reliable samples only) gets a label.
  const leaders = {};
  if (state.metric === "above" || state.metric === "avg") {
    for (const col of POSITIONS) {
      const best = visible.filter(r => reliable(get(r, col)))
        .sort((a, b) => cellValue(get(b, col), col, leagueAvg) - cellValue(get(a, col), col, leagueAvg))[0];
      if (best) leaders[col] = best.manager;
    }
  }

  const arrow = col => col === sortCol ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
  $("pos-head").innerHTML = `<tr>
    <th><button type="button" data-key="manager">Manager${arrow("manager")}</button></th>
    ${cols.map(c => `<th class="num"><button type="button" data-key="${c}">${c === "Overall" ? "All" : c}${arrow(c)}</button></th>`).join("")}
  </tr>`;

  $("pos-body").innerHTML = visible.map(r => `<tr>
    <th scope="row"><span class="team">${swatchHtml(r.manager)}${escapeHtml(nameOf(r.manager))}</span></th>
    ${cols.map(col => {
      const c = get(r, col);
      if (!c) return `<td class="pos-cell empty">–</td>`;
      const v = cellValue(c, col, leagueAvg);
      const text = state.metric === "above" ? signed(v) : state.metric === "avg" ? fmt1(v)
                 : state.metric === "total" ? Math.round(v).toLocaleString() : v;
      const avg = c.pts / c.n, above = c.diff / c.n;
      const tip = `${nameOf(r.manager)} · ${col === "Overall" ? "all positions" : col}: ${c.n} starts, ` +
        `${c.pts.toFixed(1)} pts, ${avg.toFixed(2)} per start (${signed(above)} vs league)`;
      if (!reliable(c)) return `<td class="pos-cell small-sample" title="${escapeHtml(tip)} · small sample">${text}</td>`;
      let t;
      if (state.metric === "above") t = v / scale[col];
      else if (state.metric === "avg") t = (v - (scale[col].ref ?? scale[col].mean)) / scale[col].spread;
      else t = (v - scale[col].min) / Math.max(scale[col].max - scale[col].min, 1);
      const { bg, ink } = state.metric === "above" || state.metric === "avg" ? signedColor(t) : signedColor(t * 0.9);
      const crown = leaders[col] === r.manager ? ' <span class="crown" title="Best in the league at this position">★</span>' : "";
      return `<td class="pos-cell" style="background:${bg};color:${ink}" title="${escapeHtml(tip)}">${text}${crown}</td>`;
    }).join("")}
  </tr>`).join("");

  const notes = {
    above: "Average points per start compared with the league average at that position in the same season. Blue beats the league, red trails it.",
    avg: "Average points per start at each position. Colors compare to the league average at that position.",
    total: "Total points from starters at each position. Darker blue is more.",
    starts: "Number of starts at each position.",
  };
  $("pos-note").textContent = `${notes[state.metric]} Flex starts count at the player's real position. ★ marks the league leader. ` +
    `Muted cells have fewer than ${MIN_STARTS} starts.`;
}

const avgOf = xs => xs.reduce((a, x) => a + x, 0) / (xs.length || 1);

$("pos-head").addEventListener("click", e => {
  const key = e.target.closest("button")?.dataset.key;
  if (!key) return;
  state.sortDir = state.sortKey === key ? (state.sortDir === "asc" ? "desc" : "asc") : (key === "manager" ? "asc" : "desc");
  state.sortKey = key;
  renderPositions();
});
$("pos-metric").addEventListener("change", e => { state.metric = e.target.value; renderPositions(); });

/* ---------- Manager–player pairs ---------- */

function pairStats(starts) {
  const pairs = {};
  for (const s of starts) {
    const p = (pairs[`${s.manager}|${s.player}`] ??= { manager: s.manager, player: s.player, n: 0, pts: 0, seasons: new Set(), best: null });
    p.n++; p.pts += s.pts; p.seasons.add(s.season);
    if (!p.best || s.pts > p.best.pts) p.best = s;
  }
  const list = Object.values(pairs);
  const topStarter = {};
  for (const p of list) topStarter[p.player] = Math.max(topStarter[p.player] ?? 0, p.n);
  for (const p of list) p.crown = p.n === topStarter[p.player];
  return list;
}

function seasonRange(set) {
  const ys = [...set].sort();
  const runs = [];
  for (const y of ys) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => a === b ? `${a}` : `${a}–${String(b).slice(-2)}`).join(", ");
}

function renderLoyal() {
  const m = $("loyal-manager").value, pos = $("loyal-pos").value;
  const list = pairStats(filteredStarts())
    .filter(p => managerVisible(p.manager) && (!m || p.manager === m) && (!pos || DATA.players[p.player].pos === pos))
    .sort((a, b) => b.n - a.n || b.pts - a.pts)
    .slice(0, 25);
  $("loyal-body").innerHTML = list.map((p, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td><span class="team">${swatchHtml(p.manager)}${escapeHtml(nameOf(p.manager))}</span></td>
    <td><button type="button" class="link" data-player="${p.player}">${escapeHtml(playerName(p.player))}</button>${p.crown ? ' <span class="crown" title="Started him more than any other manager">♛</span>' : ""}</td>
    <td>${DATA.players[p.player].pos}</td>
    <td class="num">${p.n}</td>
    <td class="num">${fmtPts(p.pts)}</td>
    <td class="num">${(p.pts / p.n).toFixed(2)}</td>
    <td>${seasonRange(p.seasons)}</td>
  </tr>`).join("");
}

/* ---------- Signature players ---------- */

function renderSignature() {
  const starts = filteredStarts();
  const pairs = pairStats(starts);
  const managers = DATA.allTime.map(m => m.manager).filter(managerVisible)
    .sort((a, b) => currentManagers.has(b) - currentManagers.has(a) || nameOf(a).localeCompare(nameOf(b)));
  $("signature-body").innerHTML = managers.map(id => {
    const mine = pairs.filter(p => p.manager === id);
    if (!mine.length) return "";
    const most = mine.slice().sort((a, b) => b.n - a.n || b.pts - a.pts)[0];
    const top = mine.slice().sort((a, b) => b.pts - a.pts)[0];
    const best = starts.filter(s => s.manager === id).sort((a, b) => b.pts - a.pts)[0];
    const link = i => `<button type="button" class="link" data-player="${i}">${escapeHtml(playerName(i))}</button>`;
    return `<tr>
      <td><span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span></td>
      <td>${link(most.player)} <span class="muted-inline">${most.n} starts</span></td>
      <td>${link(top.player)} <span class="muted-inline">${fmtPts(top.pts)} pts</span></td>
      <td>${link(best.player)} <span class="muted-inline">${fmtPts(best.pts)} · ${whenLabel(best)}</span></td>
    </tr>`;
  }).join("");
}

/* ---------- Biggest single games ---------- */

function renderBig() {
  const pos = $("big-pos").value;
  const list = filteredStarts()
    .filter(s => managerVisible(s.manager) && (!pos || s.pos === pos))
    .sort((a, b) => b.pts - a.pts).slice(0, 20);
  $("big-body").innerHTML = list.map((s, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td><button type="button" class="link" data-player="${s.player}">${escapeHtml(playerName(s.player))}</button></td>
    <td>${s.pos}</td>
    <td class="num"><b>${fmtPts(s.pts)}</b></td>
    <td><span class="team">${swatchHtml(s.manager)}${escapeHtml(nameOf(s.manager))}</span></td>
    <td>${whenLabel(s)}</td>
  </tr>`).join("");
}

/* ---------- Player lookup ---------- */

const playerIndexByName = Object.fromEntries(DATA.players.map((p, i) => [p.name.toLowerCase(), i]));
$("player-list").innerHTML = DATA.players.map(p => `<option value="${escapeHtml(p.name)}">`).join("");

function renderPlayer() {
  const idx = playerIndexByName[$("player-search").value.trim().toLowerCase()];
  const starts = filteredStarts();
  if (idx === undefined) {
    // Default view: the league's most-started players.
    const counts = {};
    for (const s of starts) {
      const c = (counts[s.player] ??= { player: s.player, n: 0, pts: 0, managers: new Set() });
      c.n++; c.pts += s.pts; c.managers.add(s.manager);
    }
    const top = Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 12);
    $("player-result").innerHTML = `<p class="muted small">Most-started players in league history. Click one, or search above.</p>
      <div class="chip-list">${top.map(c => `<button type="button" class="chip" data-player="${c.player}">
        ${escapeHtml(playerName(c.player))} <span class="muted-inline">${c.n} starts · ${c.managers.size} mgr${c.managers.size > 1 ? "s" : ""}</span></button>`).join("")}</div>`;
    return;
  }
  const mine = starts.filter(s => s.player === idx);
  const pairs = pairStats(mine).sort((a, b) => b.n - a.n || b.pts - a.pts);
  const total = mine.reduce((a, s) => a + s.pts, 0);
  const p = DATA.players[idx];
  $("player-result").innerHTML = mine.length ? `
    <p class="player-summary"><b>${escapeHtml(p.name)}</b> · ${p.pos} · ${mine.length} starts for ${pairs.length} manager${pairs.length > 1 ? "s" : ""} ·
      ${fmtPts(total)} pts (${(total / mine.length).toFixed(2)} per start) · ${seasonRange(new Set(mine.map(s => s.season)))}</p>
    <div class="table-scroll"><table class="standings">
      <thead><tr><th>Manager</th><th class="num">Starts</th><th class="num">Points</th><th class="num">Avg</th>
        <th>Seasons</th><th>Best game</th></tr></thead>
      <tbody>${pairs.map(q => `<tr>
        <td><span class="team">${swatchHtml(q.manager)}${escapeHtml(nameOf(q.manager))}</span>${q.crown ? ' <span class="crown">♛</span>' : ""}</td>
        <td class="num">${q.n}</td><td class="num">${fmtPts(q.pts)}</td><td class="num">${(q.pts / q.n).toFixed(2)}</td>
        <td>${seasonRange(q.seasons)}</td>
        <td>${fmtPts(q.best.pts)} <span class="muted-inline">${whenLabel(q.best)}</span></td>
      </tr>`).join("")}</tbody>
    </table></div>`
    : `<p class="muted">${escapeHtml(p.name)} was never started${state.games === "regular" ? " in the regular season" : ""}.</p>`;
}

function showPlayer(i) {
  $("player-search").value = playerName(i);
  renderPlayer();
  history.replaceState(null, "", `?player=${encodeURIComponent(playerName(i))}`);
  $("player-search").closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-player]");
  if (b) showPlayer(Number(b.dataset.player));
});
$("player-search").addEventListener("input", renderPlayer);

/* ---------- Filters & init ---------- */

function renderAll() {
  renderPositions(); renderPlayer(); renderLoyal(); renderSignature(); renderBig();
}

$("loyal-manager").innerHTML = `<option value="">All managers</option>` +
  DATA.allTime.map(m => m.manager).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map(id => `<option value="${id}">${escapeHtml(nameOf(id))}</option>`).join("");
$("loyal-manager").addEventListener("change", renderLoyal);
$("loyal-pos").addEventListener("change", renderLoyal);
$("big-pos").addEventListener("change", renderBig);
$("game-filter").addEventListener("change", e => { state.games = e.target.value; renderAll(); });
$("active-only").addEventListener("change", e => { state.activeOnly = e.target.checked; renderAll(); });

const seasons = [...new Set(ALL_STARTS.map(s => s.season))];
$("starts-note").textContent = `${ALL_STARTS.length.toLocaleString()} starts from verified lineups, ` +
  `${Math.min(...seasons)}–${Math.max(...seasons)} · starters only`;

const requested = new URLSearchParams(location.search).get("player");
if (requested) $("player-search").value = requested;
renderAll();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderPositions);
