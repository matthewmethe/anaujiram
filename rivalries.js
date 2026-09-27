// Rivalries page: head-to-head grid (default), highlights, and an on-demand two-manager comparison.

const latestSeason = Math.max(...DATA.seasons.map(s => s.season));
const currentManagers = new Set(DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));
const allTimeById = Object.fromEntries(DATA.allTime.map(m => [m.manager, m]));
const nameOf = id => managersById[id].name;

// Grid order: current managers by all-time win %, then former managers the same way.
const ORDER = DATA.allTime.slice()
  .sort((a, b) => currentManagers.has(b.manager) - currentManagers.has(a.manager) || b.winPct - a.winPct)
  .map(m => m.manager);
const firstFormer = ORDER.findIndex(id => !currentManagers.has(id));

/* ---------- Head-to-head data ---------- */

// Every game between x and y, oriented so `xp` is x's score. Oldest first.
function meetings(x, y) {
  return DATA.games
    .filter(g => (g.a === x && g.b === y) || (g.a === y && g.b === x))
    .map(g => g.a === x ? { ...g, xp: g.ap, yp: g.bp } : { ...g, xp: g.bp, yp: g.ap });
}

function summarize(games) {
  const s = { n: games.length, w: 0, l: 0, t: 0, xPts: 0, yPts: 0, playoffW: 0, playoffL: 0,
              bigX: null, bigY: null, closest: null, streak: null, longestX: 0, longestY: 0 };
  let run = 0, runner = null;
  for (const g of games) {
    const margin = g.xp - g.yp;
    s.xPts += g.xp;
    s.yPts += g.yp;
    const winner = margin > 0 ? "x" : margin < 0 ? "y" : "t";
    s[{ x: "w", y: "l", t: "t" }[winner]]++;
    if (g.playoffs && !g.consolation) winner === "x" ? s.playoffW++ : winner === "y" && s.playoffL++;
    if (margin > 0 && (!s.bigX || margin > s.bigX.xp - s.bigX.yp)) s.bigX = g;
    if (margin < 0 && (!s.bigY || -margin > s.bigY.yp - s.bigY.xp)) s.bigY = g;
    if (!s.closest || Math.abs(margin) < Math.abs(s.closest.xp - s.closest.yp)) s.closest = g;
    run = winner === runner ? run + 1 : 1;
    runner = winner;
    if (winner === "x") s.longestX = Math.max(s.longestX, run);
    if (winner === "y") s.longestY = Math.max(s.longestY, run);
  }
  s.streak = runner && runner !== "t" ? { who: runner, len: run } : null;
  s.pct = s.n ? (s.w + 0.5 * s.t) / s.n : null;
  return s;
}

const pairs = [];
for (let i = 0; i < ORDER.length; i++) {
  for (let j = i + 1; j < ORDER.length; j++) {
    const x = ORDER[i], y = ORDER[j];
    const s = summarize(meetings(x, y));
    if (s.n) pairs.push({ x, y, s });
  }
}

/* ---------- Grid ---------- */

function renderGrid() {
  const shortName = id => nameOf(id).replace(/ ([A-Z])\.$/, " $1.");
  $("grid-head").innerHTML = `<tr><th></th>${ORDER.map((id, i) =>
    `<th class="col${i === firstFormer ? " former-start" : ""}" title="${escapeHtml(nameOf(id))}"><span>${escapeHtml(shortName(id))}</span></th>`).join("")}</tr>`;

  $("grid-body").innerHTML = ORDER.map((x, i) => `<tr class="${i === firstFormer ? "former-start" : ""}">
    <th scope="row"><span class="team">${swatchHtml(x)}${escapeHtml(nameOf(x))}</span></th>
    ${ORDER.map((y, j) => {
      const former = j === firstFormer ? " former-start" : "";
      if (x === y) return `<td class="self${former}"></td>`;
      const s = summarize(meetings(x, y));
      if (!s.n) return `<td class="never${former}" title="Never played"></td>`;
      const { bg, ink } = divergingColor(s.pct);
      const margin = (s.xPts - s.yPts) / s.n;
      const tip = `${nameOf(x)} vs ${nameOf(y)}: ${record(s)} in ${s.n} game${s.n > 1 ? "s" : ""}, avg margin ${margin >= 0 ? "+" : ""}${margin.toFixed(1)}`;
      return `<td class="cell${former}" style="background:${bg};color:${ink}" title="${escapeHtml(tip)}"
        data-x="${x}" data-y="${y}" tabindex="0" role="button">${record(s)}</td>`;
    }).join("")}
  </tr>`).join("");
}

$("grid-body").addEventListener("click", e => {
  const td = e.target.closest("td.cell");
  if (td) openPair(td.dataset.x, td.dataset.y, true);
});
$("grid-body").addEventListener("keydown", e => {
  const td = e.target.closest("td.cell");
  if (td && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPair(td.dataset.x, td.dataset.y, true); }
});

/* ---------- Highlights ---------- */

const MIN_GAMES = 8;  // enough meetings for "one-sided" and "closest" to mean something

function renderHighlights() {
  const established = pairs.filter(p => p.s.n >= MIN_GAMES);
  const most = pairs.slice().sort((a, b) => b.s.n - a.s.n || Math.abs(a.s.w - a.s.l) - Math.abs(b.s.w - b.s.l))[0];
  const lopsided = established.slice().sort((a, b) => Math.abs(b.s.pct - 0.5) - Math.abs(a.s.pct - 0.5) || b.s.n - a.s.n)[0];
  const closest = established.slice().sort((a, b) =>
    Math.abs(a.s.w - a.s.l) - Math.abs(b.s.w - b.s.l) ||
    Math.abs(a.s.xPts - a.s.yPts) - Math.abs(b.s.xPts - b.s.yPts))[0];
  const streak = pairs.slice().sort((a, b) =>
    Math.max(b.s.longestX, b.s.longestY) - Math.max(a.s.longestX, a.s.longestY) || b.s.n - a.s.n)[0];

  // Present each pair from the leader's side.
  const lead = p => p.s.w >= p.s.l ? { a: p.x, b: p.y, w: p.s.w, l: p.s.l, t: p.s.t }
                                   : { a: p.y, b: p.x, w: p.s.l, l: p.s.w, t: p.s.t };
  const tile = (label, p, value, detail) => {
    const o = lead(p);
    return `<button type="button" class="tile" data-x="${o.a}" data-y="${o.b}">
      <span class="tile-label">${label}</span>
      <span class="tile-value">${value}</span>
      <span class="tile-names">${escapeHtml(nameOf(o.a))} vs ${escapeHtml(nameOf(o.b))}</span>
      <span class="tile-detail">${detail}</span>
    </button>`;
  };
  const rec = p => { const o = lead(p); return `${o.w}-${o.l}${o.t ? `-${o.t}` : ""}`; };
  const s = streak.s, streakLeader = s.longestX >= s.longestY ? streak.x : streak.y;
  const streakLoser = streakLeader === streak.x ? streak.y : streak.x;

  $("highlights").innerHTML = [
    tile("Most meetings", most, `${most.s.n} games`, `Series ${rec(most)}`),
    tile("Most one-sided", lopsided, rec(lopsided), `${Math.round(Math.max(lopsided.s.pct, 1 - lopsided.s.pct) * 100)}% win rate, ${MIN_GAMES}+ games`),
    tile("Closest rivalry", closest, rec(closest),
         `${fmtPts(Math.abs(closest.s.xPts - closest.s.yPts))} total points apart over ${closest.s.n} games`),
    `<button type="button" class="tile" data-x="${streakLeader}" data-y="${streakLoser}">
      <span class="tile-label">Longest win streak</span>
      <span class="tile-value">${Math.max(s.longestX, s.longestY)} straight</span>
      <span class="tile-names">${escapeHtml(nameOf(streakLeader))} over ${escapeHtml(nameOf(streakLoser))}</span>
      <span class="tile-detail">Series ${rec(streak)}</span>
    </button>`,
  ].join("");
}

$("highlights").addEventListener("click", e => {
  const t = e.target.closest(".tile");
  if (t) openPair(t.dataset.x, t.dataset.y, true);
});

/* ---------- Comparison ---------- */

const marginChart = echarts.init($("margin-chart"), null, { renderer: "svg" });

function fillPickers() {
  const opts = ORDER.map(id => `<option value="${id}">${escapeHtml(nameOf(id))}${currentManagers.has(id) ? "" : " (former)"}</option>`).join("");
  $("pick-a").innerHTML = `<option value="">Choose manager</option>${opts}`;
  $("pick-b").innerHTML = `<option value="">Choose manager</option>${opts}`;
}

function gameLabel(g) {
  const season = DATA.seasons.find(s => s.season === g.season);
  if (!g.playoffs) return `Week ${g.week}`;
  if (g.consolation) return `Week ${g.week} · Consolation`;
  if (g.week !== season.endWeek) return `Week ${g.week} · Semifinal`;
  // Final week of the title bracket: the two finalists finished 1st and 2nd.
  const finish = Object.fromEntries(season.teams.map(t => [t.manager, t.finalRank]));
  return finish[g.a] <= 2 ? `Week ${g.week} · Championship` : `Week ${g.week} · 3rd-place game`;
}

function openPair(x, y, scroll = false) {
  $("pick-a").value = x;
  $("pick-b").value = y;
  renderCompare();
  if (scroll) $("compare").scrollIntoView({ behavior: "smooth", block: "start" });
}

// A comparison is always a pair, so it uses one fixed, well-separated pair (blue = left side,
// orange = right side) rather than the managers' own colors, which can be near-identical
// (e.g. orange vs red) or even share a hue.
const pairColors = () => [cssVar("--series-1"), cssVar("--series-2")];
const dotHtml = color => `<span class="dot" style="background:${color}"></span>`;

function renderCompare() {
  const x = $("pick-a").value, y = $("pick-b").value;
  const ready = x && y && x !== y;
  $("compare-body").hidden = !ready;
  $("compare-hint").textContent = ready ? `${nameOf(x)} vs ${nameOf(y)}`
    : x && x === y ? "Pick two different managers." : "Pick two managers, or click a square in the grid below.";
  history.replaceState(null, "", ready ? `?a=${x}&b=${y}` : location.pathname);
  if (!ready) return;

  const games = meetings(x, y);
  if (!games.length) {
    $("compare-summary").innerHTML = `<p class="muted">${escapeHtml(nameOf(x))} and ${escapeHtml(nameOf(y))} never played each other.</p>`;
    $("margin-chart").hidden = true;
    document.querySelectorAll("#compare-body .subhead, #compare-body .small, #compare-body .table-scroll")
      .forEach(el => el.hidden = true);
    return;
  }
  $("margin-chart").hidden = false;
  document.querySelectorAll("#compare-body .subhead, #compare-body .small, #compare-body .table-scroll")
    .forEach(el => el.hidden = false);

  const s = summarize(games);
  const [cx, cy] = pairColors();
  const avg = pts => fmtPts(pts / s.n);
  const gameText = (g, forX) => g
    ? `${fmtPts(forX ? g.xp : g.yp)}–${fmtPts(forX ? g.yp : g.xp)} <span class="muted-inline">(${g.season} ${gameLabel(g)})</span>`
    : "–";
  const streakText = s.streak
    ? `${escapeHtml(nameOf(s.streak.who === "x" ? x : y))}, ${s.streak.len} straight` : "–";
  const playoffText = s.playoffW + s.playoffL
    ? `${escapeHtml(nameOf(x))} ${s.playoffW}-${s.playoffL}` : "Never met in the playoffs";

  $("compare-summary").innerHTML = `
    <div class="versus">
      <div class="side"><span class="dot" style="background:${cx}"></span><span class="who">${escapeHtml(nameOf(x))}</span>
        <span class="big">${s.w}</span></div>
      <div class="vs">${s.t ? `${s.t} tie${s.t > 1 ? "s" : ""}` : "–"}</div>
      <div class="side right"><span class="big">${s.l}</span>
        <span class="who">${escapeHtml(nameOf(y))}</span><span class="dot" style="background:${cy}"></span></div>
    </div>
    <dl class="facts">
      <div><dt>Games</dt><dd>${s.n}</dd></div>
      <div><dt>Total points</dt><dd>${fmtPts(s.xPts)} – ${fmtPts(s.yPts)}</dd></div>
      <div><dt>Average score</dt><dd>${avg(s.xPts)} – ${avg(s.yPts)}</dd></div>
      <div><dt>Current streak</dt><dd>${streakText}</dd></div>
      <div><dt>Biggest win, ${escapeHtml(nameOf(x))}</dt><dd>${gameText(s.bigX, true)}</dd></div>
      <div><dt>Biggest win, ${escapeHtml(nameOf(y))}</dt><dd>${gameText(s.bigY, false)}</dd></div>
      <div><dt>Closest game</dt><dd>${gameText(s.closest, true)}</dd></div>
      <div><dt>Playoffs</dt><dd>${playoffText}</dd></div>
    </dl>`;

  $("margin-a").textContent = nameOf(x);
  $("margin-b").textContent = nameOf(y);
  renderMarginChart(games, x, y, cx, cy);

  $("log-head").innerHTML = `<tr><th>Season</th><th>Week</th><th class="num">${escapeHtml(nameOf(x))}</th>
    <th class="num">${escapeHtml(nameOf(y))}</th><th>Winner</th><th class="num">Margin</th></tr>`;
  $("log-body").innerHTML = games.slice().reverse().map(g => {
    const m = g.xp - g.yp;
    const winner = m > 0 ? x : m < 0 ? y : null;
    return `<tr>
      <td>${g.season}</td><td>${gameLabel(g)}</td>
      <td class="num${m > 0 ? " strong" : ""}">${fmtPts(g.xp)}</td>
      <td class="num${m < 0 ? " strong" : ""}">${fmtPts(g.yp)}</td>
      <td>${winner ? `<span class="team">${dotHtml(winner === x ? cx : cy)}${escapeHtml(nameOf(winner))}</span>` : "Tie"}</td>
      <td class="num">${fmtPts(Math.abs(m))}</td>
    </tr>`;
  }).join("");
}

function renderMarginChart(games, x, y, cx, cy) {
  const ink = { muted: cssVar("--text-muted"), grid: cssVar("--grid"), axis: cssVar("--axis"),
                surface: cssVar("--surface"), border: cssVar("--border"), primary: cssVar("--text-primary") };
  const labels = games.map(g => `${String(g.season).slice(-2)} W${g.week}`);
  marginChart.setOption({
    animationDuration: 400,
    grid: { left: 48, right: 16, top: 12, bottom: 44 },
    xAxis: { type: "category", data: labels, axisTick: { show: false },
             axisLine: { lineStyle: { color: ink.axis } },
             axisLabel: { color: ink.muted, fontSize: 11, hideOverlap: true } },
    yAxis: { type: "value", axisLabel: { color: ink.muted, formatter: v => (v > 0 ? "+" : "") + v },
             splitLine: { lineStyle: { color: ink.grid } } },
    tooltip: {
      trigger: "item", backgroundColor: ink.surface, borderColor: ink.border,
      textStyle: { color: ink.primary, fontSize: 13 },
      formatter: p => {
        const g = games[p.dataIndex];
        const m = g.xp - g.yp;
        const who = m > 0 ? nameOf(x) : m < 0 ? nameOf(y) : "Tie";
        return `<b>${g.season} ${gameLabel(g)}</b><br>${escapeHtml(nameOf(x))} ${fmtPts(g.xp)} – ${fmtPts(g.yp)} ${escapeHtml(nameOf(y))}<br>${escapeHtml(who)} by ${fmtPts(Math.abs(m))}`;
      },
    },
    series: [{
      type: "bar", barMaxWidth: 18,
      data: games.map(g => {
        const m = +(g.xp - g.yp).toFixed(2);
        return { value: m, itemStyle: { color: m >= 0 ? cx : cy,
          borderRadius: m >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } };
      }),
    }],
  }, true);
}

$("pick-a").addEventListener("change", renderCompare);
$("pick-b").addEventListener("change", renderCompare);
$("swap").addEventListener("click", () => {
  const a = $("pick-a").value;
  $("pick-a").value = $("pick-b").value;
  $("pick-b").value = a;
  renderCompare();
});

/* ---------- Init ---------- */

fillPickers();
renderGrid();
renderHighlights();
const params = new URLSearchParams(location.search);
if (managersById[params.get("a")] && managersById[params.get("b")]) openPair(params.get("a"), params.get("b"));
window.addEventListener("resize", () => marginChart.resize());
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  renderGrid();
  if (!$("compare-body").hidden) renderCompare();
});
