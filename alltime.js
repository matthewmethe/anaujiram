// All-time page: sortable manager table + finishes-by-season grid.

const seasonsList = DATA.seasons.map(s => s.season);
const latestSeason = Math.max(...seasonsList);
const currentManagers = new Set(
  DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));

const pct = x => x.toFixed(3).replace(/^0/, "");
const years = m => m.firstSeason === m.lastSeason ? String(m.firstSeason)
  : `${m.firstSeason}–${String(m.lastSeason).slice(-2)}`;
const playoffPct = m => (m.playoffW + m.playoffL) ? m.playoffW / (m.playoffW + m.playoffL) : -1;
// Finishes exist only for completed seasons; a manager in their first season has none yet.
const avgFinish = m => m.avgFinish == null ? "–" : m.avgFinish.toFixed(1);

// dir: which direction a first click sorts ("desc" = biggest first).
const COLUMNS = [
  { key: "manager", label: "Manager", sort: m => managersById[m.manager].name, dir: "asc",
    cell: m => `<span class="team">${swatchHtml(m.manager)}${escapeHtml(managersById[m.manager].name)}</span>` },
  { key: "years", label: "Years", sort: m => m.firstSeason, dir: "asc", cell: years },
  { key: "seasons", label: "Seasons", num: true, sort: m => m.seasonCount, dir: "desc", cell: m => m.seasonCount },
  { key: "record", label: "W-L-T", num: true, sort: m => m.w, dir: "desc", cell: m => record(m),
    title: "Regular-season record" },
  { key: "winPct", label: "Win %", num: true, sort: m => m.winPct, dir: "desc", cell: m => pct(m.winPct) },
  { key: "pf", label: "PF", num: true, sort: m => m.pf, dir: "desc", cell: m => fmtPts(m.pf),
    title: "Regular-season points for" },
  { key: "ppg", label: "PPG", num: true, sort: m => m.ppg, dir: "desc", cell: m => fmtPts(m.ppg),
    title: "Points per regular-season game" },
  { key: "pa", label: "PA", num: true, sort: m => m.pa, dir: "desc", cell: m => fmtPts(m.pa),
    title: "Regular-season points against" },
  { key: "playoffs", label: "Playoffs", num: true, sort: m => m.playoffs, dir: "desc", cell: m => m.playoffs,
    title: "Playoff appearances" },
  { key: "playoffRecord", label: "Playoff W-L", num: true, sort: playoffPct, dir: "desc",
    cell: m => m.playoffW + m.playoffL ? `${m.playoffW}-${m.playoffL}` : "–",
    title: "Championship-bracket games, including the 3rd-place game" },
  { key: "titles", label: "Titles", num: true, sort: m => m.titles, dir: "desc",
    cell: m => m.titles ? `<b>${m.titles}</b>` : "–" },
  { key: "runnerUps", label: "2nd", num: true, sort: m => m.runnerUps, dir: "desc", cell: m => m.runnerUps || "–" },
  { key: "thirds", label: "3rd", num: true, sort: m => m.thirds, dir: "desc", cell: m => m.thirds || "–" },
  { key: "avgFinish", label: "Avg finish", num: true, sort: m => m.avgFinish ?? Infinity, dir: "asc",
    cell: m => avgFinish(m), title: "Completed seasons only" },
  { key: "lastPlaces", label: "Last", num: true, sort: m => m.lastPlaces, dir: "desc", cell: m => m.lastPlaces || "–",
    title: "Last-place finishes" },
];

const sortState = { key: "titles", dir: "desc" };

function compare(a, b, col, dir) {
  const va = col.sort(a), vb = col.sort(b);
  const base = typeof va === "string" ? va.localeCompare(vb) : va === vb ? 0 : va - vb;
  // Tiebreak: win % (desc), so equal-title rows still read in a sensible order.
  return (dir === "asc" ? base : -base) || b.winPct - a.winPct;
}

function renderTable() {
  const col = COLUMNS.find(c => c.key === sortState.key);
  const activeOnly = $("active-only").checked;
  const rows = DATA.allTime
    .filter(m => !activeOnly || currentManagers.has(m.manager))
    .sort((a, b) => compare(a, b, col, sortState.dir));

  $("alltime-head").innerHTML = `<tr>${COLUMNS.map(c => {
    const sorted = c.key === sortState.key;
    const aria = sorted ? (sortState.dir === "asc" ? "ascending" : "descending") : "none";
    const arrow = sorted ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="${c.num ? "num" : ""}" aria-sort="${aria}">
      <button type="button" data-key="${c.key}"${c.title ? ` title="${c.title}"` : ""}>${c.label}${arrow}</button></th>`;
  }).join("")}</tr>`;

  $("alltime-body").innerHTML = rows.map(m => `<tr>${COLUMNS.map(c =>
    `<td class="${c.num ? "num" : ""}">${c.cell(m)}</td>`).join("")}</tr>`).join("");
}

$("alltime-head").addEventListener("click", e => {
  const key = e.target.closest("button")?.dataset.key;
  if (!key) return;
  const col = COLUMNS.find(c => c.key === key);
  sortState.dir = sortState.key === key ? (sortState.dir === "asc" ? "desc" : "asc") : col.dir;
  sortState.key = key;
  renderTable();
});
$("active-only").addEventListener("change", renderTable);

/* ---------- Finishes grid ---------- */

// Sequential blue ramp, darkest = best finish (validated default palette, steps 700 -> 100).
const RAMP = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5",
              "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];
const DARK_INK_FROM = 7;  // ramp index where cell text switches from white to dark

function finishCell(s) {
  if (s.finish == null) {  // season in progress: current standings rank, no finish color yet
    const tip = `${s.team} · in progress · currently ${ordinal(s.seed)} of ${s.num_teams} · ${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`;
    return `<td class="finish in-progress" title="${escapeHtml(tip)}">${ordinal(s.seed)}<small>now</small></td>`;
  }
  const t = (s.finish - 1) / (s.num_teams - 1);
  const i = Math.round(t * (RAMP.length - 1));
  const ink = i >= DARK_INK_FROM ? "#0b0b0b" : "#ffffff";
  const tip = `${s.team} · ${ordinal(s.finish)} of ${s.num_teams} · ${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""} · seed ${s.seed}`;
  return `<td class="finish" style="background:${RAMP[i]};color:${ink}" title="${escapeHtml(tip)}">
    ${ordinal(s.finish)}${s.finish === 1 ? ' <span aria-label="champion">★</span>' : ""}</td>`;
}

function renderGrid() {
  $("finish-head").innerHTML = `<tr><th>Manager</th>${seasonsList.map(y => `<th class="num">${y}</th>`).join("")}
    <th class="num">Avg</th></tr>`;
  const rows = DATA.allTime.slice().sort((a, b) =>
    (a.avgFinish ?? Infinity) - (b.avgFinish ?? Infinity) || b.seasonCount - a.seasonCount);
  $("finish-body").innerHTML = rows.map(m => {
    const bySeason = Object.fromEntries(m.seasons.map(s => [s.season, s]));
    return `<tr>
      <th scope="row"><span class="team">${swatchHtml(m.manager)}${escapeHtml(managersById[m.manager].name)}</span></th>
      ${seasonsList.map(y => bySeason[y] ? finishCell(bySeason[y]) : `<td class="finish empty"></td>`).join("")}
      <td class="num">${avgFinish(m)}</td>
    </tr>`;
  }).join("");
}

const inProgress = DATA.seasons.filter(s => s.teams.some(t => t.finalRank == null)).map(s => s.season);
$("alltime-note").textContent =
  `${seasonsList.length} seasons (${seasonsList[0]}–${latestSeason}). Records and points are regular season only; ` +
  `playoff W-L counts championship-bracket games.` +
  (inProgress.length ? ` ${inProgress.join(", ")} is in progress: its games count now, its finish once it ends.` : "") +
  ` Click a column to sort.`;
renderTable();
renderGrid();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderTable(); renderGrid(); });
