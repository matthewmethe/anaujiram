// Start/Sit page: lineup efficiency against the best possible lineup from each week's roster.

const latestSeason = Math.max(...DATA.seasons.map(s => s.season));
const currentManagers = new Set(DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));
const nameOf = id => managersById[id].name;
const endWeekOf = Object.fromEntries(DATA.seasons.map(s => [s.season, s.endWeek]));

const WEEKS = DATA.lineups.map(([season, week, manager, type, actual, optimal, opp, swaps, autopilot]) => ({
  season, week, manager, type, actual, optimal, opp, autopilot,
  left: Math.max(0, optimal - actual),
  swaps: swaps.map(([inP, inPts, outP, outPts]) => ({ inP, inPts, outP, outPts })),
}));

const state = { games: "all", activeOnly: false };
const filtered = () => WEEKS.filter(w => state.games === "all" || w.type === 0);
const visible = id => !state.activeOnly || currentManagers.has(id);
const pct1 = x => (x * 100).toFixed(1) + "%";
const won = w => w.actual > w.opp, lost = w => w.actual < w.opp;
const costly = w => lost(w) && w.optimal > w.opp;

function whenLabel(w) {
  if (w.type === 0) return `${w.season} Wk ${w.week}`;
  if (w.type === 2) return `${w.season} Wk ${w.week} (consolation)`;
  return `${w.season} ${w.week === endWeekOf[w.season] ? "Final week" : "Semifinal"}`;
}

/* ---------- Lineup IQ table ---------- */

function managerRows() {
  const by = {};
  for (const w of filtered()) {
    const r = (by[w.manager] ??= { manager: w.manager, n: 0, actual: 0, optimal: 0, autopilot: 0, perfect: 0,
      costly: 0, left: 0, worst: 0, beat: 0, trailed: 0 });
    r.n++; r.actual += w.actual; r.optimal += w.optimal; r.autopilot += w.autopilot; r.left += w.left;
    r.perfect += w.left < 0.005; r.costly += costly(w); r.worst = Math.max(r.worst, w.left);
    r.beat += w.actual > w.autopilot + 0.005; r.trailed += w.actual < w.autopilot - 0.005;
  }
  return Object.values(by).filter(r => visible(r.manager)).map(r => ({
    ...r, eff: r.actual / r.optimal, perGame: r.left / r.n, perfectPct: r.perfect / r.n,
    autoEff: r.autopilot / r.optimal, hidden: (r.optimal - r.autopilot) / r.n, skill: (r.actual - r.autopilot) / r.n,
    score: (r.actual - r.autopilot) / Math.max(r.optimal - r.autopilot, 1),
  }));
}

// A table whose column headers sort it. cols: {key, label, num, sort, dir, cell, title}.
function sortableTable(headId, bodyId, cols, sortKey, tiebreak) {
  const t = { sortKey, sortDir: cols.find(c => c.key === sortKey).dir };
  t.render = () => {
    const col = cols.find(c => c.key === t.sortKey);
    const rows = managerRows().sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      const base = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return (t.sortDir === "asc" ? base : -base) || tiebreak(b) - tiebreak(a);
    });
    $(headId).innerHTML = `<tr>${cols.map(c => {
      const sorted = c.key === t.sortKey;
      const arrow = sorted ? (t.sortDir === "asc" ? " ▲" : " ▼") : "";
      return `<th class="${c.num ? "num" : ""}" aria-sort="${sorted ? (t.sortDir === "asc" ? "ascending" : "descending") : "none"}">
        <button type="button" data-key="${c.key}"${c.title ? ` title="${c.title}"` : ""}>${c.label}${arrow}</button></th>`;
    }).join("")}</tr>`;
    $(bodyId).innerHTML = rows.map(r => `<tr>${cols.map(c =>
      `<td class="${c.num ? "num" : ""}">${c.cell(r)}</td>`).join("")}</tr>`).join("");
  };
  $(headId).addEventListener("click", e => {
    const key = e.target.closest("button")?.dataset.key;
    if (!key) return;
    t.sortDir = t.sortKey === key ? (t.sortDir === "asc" ? "desc" : "asc") : cols.find(c => c.key === key).dir;
    t.sortKey = key;
    t.render();
  });
  return t;
}

const signedClass = (x, eps) => x > eps ? "delta-up" : x < -eps ? "delta-down" : "";
const MANAGER_COL = { key: "manager", label: "Manager", sort: r => nameOf(r.manager), dir: "asc",
  cell: r => `<span class="team">${swatchHtml(r.manager)}${escapeHtml(nameOf(r.manager))}</span>` };
const GAMES_COL = { key: "n", label: "Games", num: true, sort: r => r.n, dir: "desc", cell: r => r.n };

const COLS = [
  MANAGER_COL,
  GAMES_COL,
  { key: "eff", label: "Efficiency", num: true, sort: r => r.eff, dir: "desc", cell: r => `<b>${pct1(r.eff)}</b>`,
    title: "Actual points ÷ best possible points" },
  { key: "perGame", label: "Left / game", num: true, sort: r => r.perGame, dir: "asc", cell: r => r.perGame.toFixed(1),
    title: "Points left on the bench per game" },
  { key: "left", label: "Total left", num: true, sort: r => r.left, dir: "asc", cell: r => Math.round(r.left).toLocaleString() },
  { key: "perfect", label: "Perfect lineups", num: true, sort: r => r.perfectPct, dir: "desc",
    cell: r => `${r.perfect} <span class="muted-inline">(${pct1(r.perfectPct)})</span>`,
    title: "Weeks the best possible lineup was the one started" },
  { key: "costly", label: "Losses it cost", num: true, sort: r => r.costly / r.n, dir: "asc", cell: r => r.costly,
    title: "Losses where the best lineup would have beaten the opponent's actual score" },
  { key: "worst", label: "Worst week", num: true, sort: r => r.worst, dir: "asc", cell: r => r.worst.toFixed(1),
    title: "Most points left on the bench in one week" },
];

const iqTable = sortableTable("iq-head", "iq-body", COLS, "eff", r => r.eff);

/* ---------- Diving deeper: lineup calls against autopilot ---------- */

const DEEP_COLS = [
  MANAGER_COL,
  GAMES_COL,
  { key: "eff", label: "Efficiency", num: true, sort: r => r.eff, dir: "desc", cell: r => pct1(r.eff),
    title: "Actual points ÷ best possible points (same as Lineup IQ)" },
  { key: "autoEff", label: "Autopilot eff.", num: true, sort: r => r.autoEff, dir: "desc", cell: r => pct1(r.autoEff),
    title: "The efficiency autopilot would have had with the same rosters. Lower means a harder bench to manage" },
  { key: "hidden", label: "Hidden pts / game", num: true, sort: r => r.hidden, dir: "desc", cell: r => r.hidden.toFixed(1),
    title: "Best lineup minus autopilot, per game: how much the obvious call missed" },
  { key: "skill", label: "vs autopilot / game", num: true, sort: r => r.skill, dir: "desc",
    cell: r => `<span class="${signedClass(r.skill, 0.05)}">${r.skill > 0 ? "+" : ""}${r.skill.toFixed(1)}</span>`,
    title: "Actual minus autopilot, per game" },
  { key: "score", label: "Decision score", num: true, sort: r => r.score, dir: "desc",
    cell: r => `<b class="${signedClass(r.score, 0.005)}">${r.score > 0 ? "+" : ""}${(r.score * 100).toFixed(0)}%</b>`,
    title: "Share of the hidden points captured: (actual − autopilot) ÷ (best − autopilot)" },
  { key: "beat", label: "Beat / trailed", num: true, sort: r => (r.beat - r.trailed) / r.n, dir: "desc",
    cell: r => `${r.beat}–${r.trailed}`,
    title: "Weeks the actual lineup outscored autopilot – weeks it scored less (identical lineups not counted)" },
];

const deepTable = sortableTable("deep-head", "deep-body", DEEP_COLS, "score", r => r.score);

/* ---------- Efficiency by season ---------- */

function renderSeasons() {
  const weeks = filtered();
  const seasons = [...new Set(weeks.map(w => w.season))].sort();
  const league = {}, cell = {};
  for (const w of weeks) {
    const l = (league[w.season] ??= { a: 0, o: 0 }); l.a += w.actual; l.o += w.optimal;
    const c = (cell[`${w.manager}|${w.season}`] ??= { a: 0, o: 0, n: 0 }); c.a += w.actual; c.o += w.optimal; c.n++;
  }
  const managers = [...new Set(weeks.map(w => w.manager))].filter(visible);
  const overall = id => {
    const cs = seasons.map(s => cell[`${id}|${s}`]).filter(Boolean);
    return cs.reduce((a, c) => a + c.a, 0) / cs.reduce((a, c) => a + c.o, 0);
  };
  managers.sort((a, b) => overall(b) - overall(a));
  const spread = 0.05;  // ±5 points of efficiency = full color

  $("season-head").innerHTML = `<tr><th>Manager</th>${seasons.map(s => `<th class="num">${s}</th>`).join("")}<th class="num">All</th></tr>`;
  $("season-body").innerHTML = managers.map(id => `<tr>
    <th scope="row"><span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span></th>
    ${seasons.map(s => {
      const c = cell[`${id}|${s}`];
      if (!c) return `<td class="finish empty"></td>`;
      const eff = c.a / c.o, base = league[s].a / league[s].o;
      const { bg, ink } = signedColor((eff - base) / spread);
      const tip = `${nameOf(id)} ${s}: ${pct1(eff)} efficiency (league ${pct1(base)}), ${(c.o - c.a).toFixed(1)} pts left over ${c.n} games`;
      return `<td class="finish" style="background:${bg};color:${ink}" title="${escapeHtml(tip)}">${(eff * 100).toFixed(0)}%</td>`;
    }).join("")}
    <td class="num">${pct1(overall(id))}</td>
  </tr>`).join("");
}

/* ---------- Costliest benchings ---------- */

function renderBlunders() {
  const m = $("blunder-manager").value, onlyCost = $("blunder-cost").checked;
  const list = filtered()
    .filter(w => visible(w.manager) && (!m || w.manager === m) && (!onlyCost || costly(w)) && w.left > 0)
    .sort((a, b) => b.left - a.left).slice(0, 20);
  const player = (i, pts) => `<a href="players.html?player=${encodeURIComponent(DATA.players[i].name)}">${escapeHtml(DATA.players[i].name)}</a>
    <span class="muted-inline">${DATA.players[i].pos} ${fmtPts(pts)}</span>`;
  const swapLine = s => `<div class="swap">${player(s.inP, s.inPts)} <span class="muted-inline">for</span> ${
    s.outP === null ? `<span class="muted-inline">an empty slot</span>` : player(s.outP, s.outPts)}</div>`;
  $("blunder-body").innerHTML = list.map((w, i) => {
    const result = costly(w)
      ? `<span class="tag bad" title="Lost ${fmtPts(w.actual)}–${fmtPts(w.opp)}; the best lineup scored ${fmtPts(w.optimal)}">Cost the game</span>
         <div class="muted-inline">Lost ${fmtPts(w.actual)}–${fmtPts(w.opp)}<br>Best lineup: ${fmtPts(w.optimal)}</div>`
      : won(w) ? `<span class="tag">Won anyway</span>` : `<span class="tag">Lost either way</span>`;
    return `<tr>
      <td class="num">${i + 1}</td>
      <td><span class="team">${swatchHtml(w.manager)}${escapeHtml(nameOf(w.manager))}</span></td>
      <td>${whenLabel(w)}</td>
      <td class="num"><b>${w.left.toFixed(2)}</b></td>
      <td>${w.swaps.map(swapLine).join("")}</td>
      <td>${result}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">Nothing matches.</td></tr>`;
}

/* ---------- Init ---------- */

function renderAll() { iqTable.render(); deepTable.render(); renderSeasons(); renderBlunders(); }

$("blunder-manager").innerHTML = `<option value="">All managers</option>` +
  [...new Set(WEEKS.map(w => w.manager))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map(id => `<option value="${id}">${escapeHtml(nameOf(id))}</option>`).join("");
$("blunder-manager").addEventListener("change", renderBlunders);
$("blunder-cost").addEventListener("change", renderBlunders);
$("game-filter").addEventListener("change", e => { state.games = e.target.value; renderAll(); });
$("active-only").addEventListener("change", e => { state.activeOnly = e.target.checked; renderAll(); });
renderAll();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderSeasons);
