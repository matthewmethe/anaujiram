// Standings race page: season bump chart + weekly standings table.

const state = { season: null, week: null, hidden: new Set() };
const seasonData = () => DATA.seasons.find(s => s.season === state.season);
const teamByKey = season => Object.fromEntries(season.teams.map(t => [t.key, t]));

/* ---------- Bump chart ---------- */

const chart = echarts.init($("bump-chart"), null, { renderer: "svg" });

// Draws the chart through the week picked in the standings table. `reset` redraws from scratch
// (new season, resize, theme change); otherwise lines animate to the new week.
function renderChart(reset = true) {
  const season = seasonData();
  const shownWeeks = season.weeks.filter(w => w.week <= state.week);
  const teams = teamByKey(season);
  const lastRegular = season.regularSeasonWeeks;
  const narrow = window.innerWidth < 640;
  const crowded = shownWeeks.length > 8;
  const ink = { primary: cssVar("--text-primary"), secondary: cssVar("--text-secondary"),
                muted: cssVar("--text-muted"), grid: cssVar("--grid"), axis: cssVar("--axis"),
                surface: cssVar("--surface"), border: cssVar("--border") };

  // The chart labels teams by team name (the table below keeps manager names); color still follows the manager.
  const series = season.teams.map(team => {
    const { color, dashed } = managerStyle(team.manager);
    const data = shownWeeks.map(w => [w.week, w.standings.find(r => r.team === team.key).rank]);
    return {
      name: chartName(team.name),
      type: "line",
      data,
      symbol: dashed ? "rect" : "circle",
      // On a phone a long season drops the week dots and thins the lines so 17 weeks don't turn to mush.
      symbolSize: narrow ? (crowded ? 0 : 5) : 8,
      lineStyle: { width: narrow && crowded ? 1.5 : 2, type: dashed ? "dashed" : "solid", color },
      itemStyle: { color, borderColor: ink.surface, borderWidth: 2 },
      emphasis: { focus: "series", lineStyle: { width: 3 } },
      blur: { lineStyle: { opacity: 0.12 }, itemStyle: { opacity: 0.12 } },
      endLabel: { show: true, formatter: chartName(team.name), color: ink.secondary,
                  fontSize: narrow ? 10 : 12, distance: narrow ? 3 : 8,
                  width: END_LABEL_MAX[narrow ? 1 : 0], overflow: "truncate" },
    };
  });

  // On a phone the x axis stops at the week shown (at least week 2), so the lines use the full width
  // instead of sharing it with unplayed weeks; it grows as the season goes on.
  const xMax = !narrow ? season.endWeek + 0.5
    : Math.max(state.week, 2);

  // Reference marks live on their own series so hiding a manager never removes them:
  // the playoff cut across the regular season, and a shaded playoffs region after it.
  const cut = season.playoffTeams + 0.5;
  const split = lastRegular + 0.5;
  const showPlayoffs = split < xMax;
  series.push({
    type: "line", data: [[1, cut], [Math.min(split, xMax), cut]], silent: true, z: 1,
    symbol: "none", lineStyle: { color: ink.axis, type: [6, 4], width: 1.5 },
    emphasis: { disabled: true }, blur: { lineStyle: { opacity: 1 } }, tooltip: { show: false },
    markArea: {
      silent: true,
      itemStyle: { color: cssVar("--playoff-wash") },
      label: { show: true, position: "top", distance: 6, color: ink.muted, fontSize: 11, formatter: "Playoffs" },
      data: showPlayoffs ? [[{ xAxis: split }, { xAxis: xMax }]] : [],
    },
    markLine: {
      silent: true, symbol: "none",
      lineStyle: { color: ink.axis, type: "solid", width: 1 },
      label: { show: false },
      data: showPlayoffs ? [{ xAxis: split }] : [],
    },
  });

  chart.setOption({
    animationDuration: 500,
    grid: { left: narrow ? 24 : 44, right: endLabelRoom(season, narrow), top: 30, bottom: 44 },
    legend: { show: false, selected: Object.fromEntries(
      season.teams.map(t => [chartName(t.name), !state.hidden.has(t.manager)])) },
    xAxis: {
      type: "value", min: 1, max: xMax, interval: 1,
      name: "Week", nameLocation: "middle", nameGap: 28,
      nameTextStyle: { color: ink.muted },
      axisLine: { lineStyle: { color: ink.axis } }, axisTick: { show: false },
      // On a phone a long season labels every other week so the numbers don't run together.
      axisLabel: { color: ink.muted, formatter: v => Number.isInteger(v) && (!narrow || xMax <= 10.5 || v % 2) ? String(v) : "" },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value", inverse: true, min: 1, max: season.numTeams, interval: 1,
      axisLabel: { color: ink.muted, formatter: ordinal, margin: narrow ? 3 : 8, fontSize: narrow ? 10 : 12 },
      splitLine: { lineStyle: { color: ink.grid } },
    },
    tooltip: {
      show: !narrow,  // on a phone the week box just covers the chart; tapping a week still picks it
      trigger: "axis",
      axisPointer: { type: "line", snap: true, lineStyle: { color: ink.axis } },
      backgroundColor: ink.surface, borderColor: ink.border,
      textStyle: { color: ink.primary, fontSize: 13 },
      formatter: params => tooltipHtml(season, teams, params),
    },
    series,
  }, reset);
  if (narrow) requestAnimationFrame(() => fitEndLabels(season));
}

// Phone fonts vary, so after drawing, size the right margin to the widest end label as actually rendered:
// names sit right at the edge without being clipped, and the lines get every spare pixel.
function fitEndLabels(season) {
  const names = new Set(season.teams.map(t => chartName(t.name)));
  const widths = [...$("bump-chart").querySelectorAll("svg text")]
    .filter(el => { const s = el.textContent.replace(/(\.\.\.|…)$/, ""); return [...names].some(n => n.startsWith(s)) && s.length > 2; })
    .map(el => el.getBoundingClientRect().width);  // shortened labels ("Unruly Underda...") count too
  if (!widths.length) return;
  const room = Math.ceil(Math.max(...widths)) + 3 + 3;  // widest label as drawn (already capped) + label distance + a hair
  if (Math.abs(room - chart.getOption().grid[0].right) > 1) chart.setOption({ grid: { right: room } });
}

// End labels are team names; long ones are cut off with "…" past this width ([desktop, phone]) so
// they don't crowd the lines on a phone. Hover a line for the full name.
const END_LABEL_MAX = [170, 90];
// Shorter names for the longest teams, used by the chart, its legend and the standings table on this page.
const SHORT_NAMES = { "Henderson's Friendersons": "Henderson's" };
const chartName = name => SHORT_NAMES[name] ?? name;

// Right margin wide enough for the longest end-of-line name label.
function endLabelRoom(season, narrow) {
  const ctx = (endLabelRoom.canvas ??= document.createElement("canvas")).getContext("2d");
  ctx.font = `${narrow ? 10 : 12}px sans-serif`;  // the chart's own label font
  const widest = Math.max(...season.teams.map(t => ctx.measureText(chartName(t.name)).width));
  return Math.ceil(Math.min(widest, END_LABEL_MAX[narrow ? 1 : 0])) + (narrow ? 6 : 20);
}

// "Semifinals" / "Final" for the playoff weeks, "Week N" otherwise.
function weekName(season, weekNum) {
  if (weekNum < season.playoffStartWeek) return `Week ${weekNum}`;
  if (weekNum === season.endWeek) return `Week ${weekNum}: Final`;
  return season.endWeek - weekNum === 1 ? `Week ${weekNum}: Semifinals` : `Week ${weekNum}: Playoffs`;
}

// "W 151.36–115.36", "L 93.64–130.02", or "–" when the team had no game.
function gameResult(r) {
  if (r.pts == null) return "–";
  return `${r.result} ${fmtPts(r.pts)}–${fmtPts(r.oppPts)}`;
}

function tooltipHtml(season, teams, params) {
  if (!params.length) return "";
  const weekNum = Math.round(Number(params[0].axisValue));
  const week = season.weeks.find(w => w.week === weekNum);
  const muted = text => `<b>${weekName(season, weekNum)}</b><br><span style="color:${cssVar("--text-muted")}">${text}</span>`;
  if (!week) return muted("Not played yet");
  if (weekNum > state.week) return muted("Click to show the chart through this week");
  const playoffs = week.phase === "playoffs";
  const final = weekNum === season.endWeek;
  const cell = "padding-left:12px;font-variant-numeric:tabular-nums";
  const rows = week.standings
    .filter(r => !state.hidden.has(teams[r.team].manager))
    .map(r => {
      const t = teams[r.team];
      const { color } = managerStyle(t.manager);
      const detail = playoffs
        ? `<td style="${cell}">${gameResult(r)}</td>`
        : `<td style="${cell}">${record(r)}</td><td style="${cell};text-align:right">${fmtPts(r.pf)}</td>`;
      return `<tr>
        <td style="text-align:right;padding-right:6px">${final ? ordinal(r.rank) : `${r.rank}.`}</td>
        <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${escapeHtml(chartName(t.name))}</td>
        ${detail}
      </tr>`;
    }).join("");
  const title = final ? `${weekName(season, weekNum)} (final standings)`
              : playoffs ? weekName(season, weekNum) : `After week ${weekNum}`;
  return `<b>${title}</b><table style="margin-top:4px;border-collapse:collapse">${rows}</table>`;
}

chart.getZr().on("click", e => {
  if (window.innerWidth < 640) return;  // on a phone a tap is usually just scrolling; pick weeks from the menu
  if (!chart.containPixel("grid", [e.offsetX, e.offsetY])) return;
  const [x] = chart.convertFromPixel("grid", [e.offsetX, e.offsetY]);
  const week = Math.round(x);
  if (seasonData().weeks.some(w => w.week === week)) setWeek(week);
});

/* ---------- Legend ---------- */

function renderLegend() {
  const season = seasonData();
  const managers = season.teams.map(t => ({ ...managersById[t.manager], team: chartName(t.name) }))
    .sort((a, b) => a.dashed - b.dashed || a.slot - b.slot);
  const legend = $("legend");
  legend.innerHTML = "";
  for (const m of managers) {
    const { color, dashed } = managerStyle(m.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(!state.hidden.has(m.id)));
    btn.innerHTML = `<span class="swatch${dashed ? " dashed" : ""}" style="color:${color}"></span>${escapeHtml(m.team)}`;
    btn.addEventListener("click", () => {
      state.hidden.has(m.id) ? state.hidden.delete(m.id) : state.hidden.add(m.id);
      btn.setAttribute("aria-pressed", String(!state.hidden.has(m.id)));
      chart.dispatchAction({ type: "legendToggleSelect", name: m.team });
    });
    btn.addEventListener("mouseenter", () => chart.dispatchAction({ type: "highlight", seriesName: m.team }));
    btn.addEventListener("mouseleave", () => chart.dispatchAction({ type: "downplay", seriesName: m.team }));
    legend.appendChild(btn);
  }
}

/* ---------- Standings table ---------- */

// Each manager's current regular-season streak through `week`, like Yahoo's "W-2" / "L-1" / "T-1".
function streaks(season, week) {
  const results = {};
  for (const g of DATA.games) {
    if (g.season !== season.season || g.playoffs || g.consolation || g.week > week) continue;
    const res = g.ap > g.bp ? ["W", "L"] : g.ap < g.bp ? ["L", "W"] : ["T", "T"];
    (results[g.a] ??= []).push([g.week, res[0]]);
    (results[g.b] ??= []).push([g.week, res[1]]);
  }
  const out = {};
  for (const [manager, rs] of Object.entries(results)) {
    rs.sort((x, y) => y[0] - x[0]);
    let n = 0;
    while (n < rs.length && rs[n][1] === rs[0][1]) n++;
    out[manager] = { kind: rs[0][1], n };
  }
  return out;
}

const streakCell = s => s
  ? `<td class="num"><span class="${s.kind === "W" ? "delta-up" : s.kind === "L" ? "delta-down" : "delta-none"}">${s.kind}-${s.n}</span></td>`
  : `<td class="num delta-none">–</td>`;

function renderTable() {
  const season = seasonData();
  const teams = teamByKey(season);
  const idx = season.weeks.findIndex(w => w.week === state.week);
  const week = season.weeks[idx];
  const prevRank = idx > 0
    ? Object.fromEntries(season.weeks[idx - 1].standings.map(r => [r.team, r.rank])) : {};

  const playoffs = week.phase === "playoffs";
  const final = state.week === season.endWeek;
  $("table-title").textContent = final ? `${season.season} final standings`
    : playoffs ? `${season.season} ${weekName(season, state.week).split(": ")[1].toLowerCase()}`
    : `${season.season} standings`;
  // Rank, team, record and streak first so they fit on a phone without scrolling; manager last.
  const streakHead = `<th class="num" title="${playoffs ? "Streak at the end of the regular season" : "Current regular-season streak"}">Strk</th>`;
  $("standings-head").innerHTML = `<tr>
    <th class="num tight" title="${final ? "Final finish" : "Rank"}">#</th><th class="num tight" title="Spots moved since the previous week">±</th>
    <th>Team</th>
    ${playoffs
      ? `<th class="num" title="Regular-season record">Record</th>${streakHead}<th class="num">This week</th><th class="num">Seed</th>`
      : `<th class="num">W-L-T</th>${streakHead}<th class="num">PF</th><th class="num">PA</th>`}
    <th>Manager</th>
  </tr>`;
  const streak = streaks(season, Math.min(state.week, season.regularSeasonWeeks));
  const streakTd = manager => streakCell(streak[manager]);

  $("standings-body").innerHTML = week.standings.map(r => {
    const t = teams[r.team];
    const { color, dashed } = managerStyle(t.manager);
    const move = prevRank[r.team] ? prevRank[r.team] - r.rank : 0;
    const delta = move > 0 ? `<span class="delta-up">▲${move}</span>`
                : move < 0 ? `<span class="delta-down">▼${-move}</span>`
                : `<span class="delta-none">–</span>`;
    const stats = playoffs
      ? `<td class="num">${record(r)}</td>${streakTd(t.manager)}<td class="num">${gameResult(r)}</td><td class="num">${r.seed}</td>`
      : `<td class="num">${record(r)}</td>${streakTd(t.manager)}<td class="num">${fmtPts(r.pf)}</td><td class="num">${fmtPts(r.pa)}</td>`;
    return `<tr class="${!playoffs && r.rank === season.playoffTeams ? "cutline" : ""}">
      <td class="num tight">${final ? ordinal(r.rank) : r.rank}</td>
      <td class="num tight">${delta}</td>
      <td><span class="team"><span class="swatch${dashed ? " dashed" : ""}" style="color:${color}"></span>${escapeHtml(chartName(t.name))}${final && r.rank === 1 ? ' <span class="champ">Champion</span>' : ""}</span></td>
      ${stats}
      <td>${escapeHtml(managersById[t.manager].name)}</td>
    </tr>`;
  }).join("");
  alignStandingsEdge();
}

// On a phone, if the column after the points-for column peeks in at the right edge, widen the gap between
// the rank and spots-moved columns just enough to push it off-screen, so the table ends cleanly at PF
// (or Strk in the playoff view). Scrolling sideways still shows the rest.
function alignStandingsEdge() {
  const cells = [...document.querySelectorAll("#standings-head th.tight + th.tight, #standings-body td.tight + td.tight")];
  for (const c of cells) c.style.paddingLeft = "";
  if (window.innerWidth >= 640) return;
  const box = $("standings-body").closest(".table-scroll").getBoundingClientRect();
  const heads = [...document.querySelectorAll("#standings-head th")];
  const peeking = heads.find(th => { const r = th.getBoundingClientRect(); return r.left < box.right - 1 && r.right > box.right + 1; });
  if (!peeking) return;
  const push = box.right - peeking.getBoundingClientRect().left;
  if (push > 48) return;  // a big gap would look odd; leave a mostly visible column be
  const base = parseFloat(getComputedStyle(cells[0]).paddingLeft);
  for (const c of cells) c.style.paddingLeft = `${base + push}px`;
}

/* ---------- Controls ---------- */

function setWeek(week, reset = false) {
  state.week = week;
  $("week-select").value = String(week);
  renderChart(reset);
  renderTable();
}

function setSeason(seasonNum) {
  state.season = seasonNum;
  state.hidden.clear();
  const season = seasonData();
  $("week-select").innerHTML = season.weeks
    .map(w => `<option value="${w.week}">${w.phase === "playoffs" ? weekName(season, w.week) : w.week}</option>`).join("");
  renderLegend();
  setWeek(season.weeks[season.weeks.length - 1].week, true);
}

function init() {
  const playable = DATA.seasons.filter(s => s.weeks.length);
  $("season-select").innerHTML = playable.slice().reverse()
    .map(s => `<option value="${s.season}">${s.season}</option>`).join("");
  $("season-select").addEventListener("change", e => setSeason(Number(e.target.value)));
  $("week-select").addEventListener("change", e => setWeek(Number(e.target.value)));

  window.addEventListener("resize", () => { chart.resize(); renderChart(); alignStandingsEdge(); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    renderChart(); renderLegend(); renderTable();
  });

  const params = new URLSearchParams(location.search);
  const requested = Number(params.get("season"));
  const initial = playable.some(s => s.season === requested) ? requested : playable[playable.length - 1].season;
  $("season-select").value = String(initial);
  setSeason(initial);
  const week = Number(params.get("week"));
  if (seasonData().weeks.some(w => w.week === week)) setWeek(week, true);
}

init();
