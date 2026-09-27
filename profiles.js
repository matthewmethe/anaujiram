// Manager profiles: a tile for everyone who has played, then one manager's whole league history.

const nameOf = id => managersById[id].name;
const seasonsList = DATA.seasons.map(s => s.season);
const latestSeason = Math.max(...seasonsList);
const currentManagers = new Set(DATA.seasons.find(s => s.season === latestSeason).teams.map(t => t.manager));
const ALLTIME = Object.fromEntries(DATA.allTime.map(m => [m.manager, m]));
const IDS = Object.keys(ALLTIME);

const STARTS = DATA.starts.map(([season, week, manager, player, slot, points, type]) =>
  ({ season, week, manager, player, slot, points, type }));
const LINEUPS = DATA.lineups.map(([season, week, manager, type, actual, optimal, opp]) =>
  ({ season, week, manager, type, actual, optimal, opp }));
const PICKS = DATA.picks.map(([season, round, overall, manager, player]) => ({ season, round, overall, manager, player }));
const PICKUPS = DATA.pickups.map(([season, week, manager, player, type, kept, starts, points, regularPoints, date, moveId]) =>
  ({ season, week, manager, player, type, kept, starts, points, regularPoints, date, moveId }));
const MOVES = DATA.moves.map(([season, manager, waiver, fa, drops, trades]) => ({ season, manager, waiver, fa, drops, trades }));

// Every game once per side, in order: { season, week, manager, opp, pts, oppPts, playoffs, consolation }.
const GAMES = DATA.games.flatMap(g => [
  { season: g.season, week: g.week, manager: g.a, opp: g.b, pts: g.ap, oppPts: g.bp, playoffs: g.playoffs, consolation: g.consolation },
  { season: g.season, week: g.week, manager: g.b, opp: g.a, pts: g.bp, oppPts: g.ap, playoffs: g.playoffs, consolation: g.consolation },
]).sort((x, y) => x.season - y.season || x.week - y.week);
const REGULAR = GAMES.filter(g => !g.playoffs);

const teamName = (id, season) => DATA.seasons.find(s => s.season === season).teams.find(t => t.manager === id)?.name;
const dateLabel = d => new Date(d + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const playerLink = idx => {
  const p = DATA.players[idx];
  return `<a href="players.html?player=${encodeURIComponent(p.name)}">${escapeHtml(p.name)}</a> <span class="muted-inline">${p.pos}</span>`;
};
const managerCell = id => `<span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span>`;
const signed = (x, digits = 1) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(digits);
const weekLabel = g => {
  if (!g.playoffs) return `${g.season} Wk ${g.week}`;
  return `${g.season} Wk ${g.week} <span class="muted-inline">${g.consolation ? "consolation" : "playoffs"}</span>`;
};

/* ---------- Photos and logos ---------- */

// Files go in img/managers/<id>.<ext> and img/logos/<id>.<ext>; any common extension works.
// A missing photo falls back to the team logo, then to initials on the manager's color.
const EXTS = ["png", "jpg", "jpeg", "webp"];
const initials = id => nameOf(id).replace(/\./g, "").split(" ").map(w => w[0]).join("");

// Tries each extension of each folder in data-bases ("a|b") before giving up.
function imgFallback(img) {
  const bases = img.dataset.bases.split("|");
  let b = +img.dataset.b, e = +img.dataset.e + 1;
  if (e === EXTS.length) { b++; e = 0; }
  if (b < bases.length) {
    img.dataset.b = b; img.dataset.e = e;
    if (b > 0) img.closest("[data-img]")?.classList.add("using-logo");
    img.src = `${bases[b]}.${EXTS[e]}`;
  } else {
    img.closest("[data-img]")?.classList.add("no-img");
    img.remove();
  }
}

const imgTag = (bases, alt) =>
  `<img src="${bases[0]}.${EXTS[0]}" data-bases="${bases.join("|")}" data-b="0" data-e="0" alt="${alt}" onerror="imgFallback(this)">`;
const avatarHtml = (id, size) => `<span class="avatar avatar-${size}" data-img style="--c:var(--series-${managersById[id].slot})">
  <span class="initials">${initials(id)}</span>${imgTag([`img/managers/${id}`, `img/logos/${id}`], "")}
</span>`;
const logoHtml = id => `<span class="team-logo" data-img>${imgTag([`img/logos/${id}`], `${escapeHtml(nameOf(id))} team logo`)}</span>`;

/* ---------- League-wide numbers (every manager, so each can be ranked) ---------- */

// All-play: every regular-season week, each team against every other team's score that week.
const allPlay = {};  // `${season}|${manager}` -> { w, l, t }
{
  const byWeek = {};
  for (const g of REGULAR) (byWeek[`${g.season}|${g.week}`] ??= []).push(g);
  for (const games of Object.values(byWeek)) {
    for (const g of games) {
      const r = (allPlay[`${g.season}|${g.manager}`] ??= { w: 0, l: 0, t: 0 });
      for (const o of games) {
        if (o === g) continue;
        if (g.pts > o.pts) r.w++; else if (g.pts < o.pts) r.l++; else r.t++;
      }
    }
  }
}
const apPct = r => (r.w + r.t / 2) / (r.w + r.l + r.t);

// Power rank: each season's teams ordered by all-play win percentage.
const powerRank = {};
for (const s of DATA.seasons) {
  const ids = s.teams.map(t => t.manager).filter(id => allPlay[`${s.season}|${id}`]);
  ids.sort((a, b) => apPct(allPlay[`${s.season}|${b}`]) - apPct(allPlay[`${s.season}|${a}`]));
  ids.forEach((id, i) => powerRank[`${s.season}|${id}`] = i + 1);
}

function seasonLuck(id, s) {
  const ap = allPlay[`${s.season}|${id}`];
  const games = s.wins + s.losses + s.ties;
  return s.wins + s.ties / 2 - apPct(ap) * games;
}

const CAREER = Object.fromEntries(IDS.map(id => {
  const ap = { w: 0, l: 0, t: 0 };
  let luck = 0;
  for (const s of ALLTIME[id].seasons) {
    const r = allPlay[`${s.season}|${id}`];
    ap.w += r.w; ap.l += r.l; ap.t += r.t;
    luck += seasonLuck(id, s);
  }
  return [id, { ap, pct: apPct(ap), luck }];
}));
const LEAGUE_POWER = IDS.slice().sort((a, b) => CAREER[b].pct - CAREER[a].pct);

// Oddities: each returns { value (for ranking), show, detail } or null when it doesn't apply.
const weeklyTop = {}, weeklyBottom = {};
{
  const byWeek = {};
  for (const g of REGULAR) (byWeek[`${g.season}|${g.week}`] ??= []).push(g);
  for (const games of Object.values(byWeek)) {
    const hi = Math.max(...games.map(g => g.pts)), lo = Math.min(...games.map(g => g.pts));
    for (const g of games) {
      if (g.pts === hi) weeklyTop[g.manager] = (weeklyTop[g.manager] || 0) + 1;
      if (g.pts === lo) weeklyBottom[g.manager] = (weeklyBottom[g.manager] || 0) + 1;
    }
  }
}

function longestStreak(games, win) {
  let best = null, run = [];
  for (const g of games) {
    if (win ? g.pts > g.oppPts : g.pts < g.oppPts) {
      run.push(g);
      if (!best || run.length > best.length) best = run.slice();
    } else run = [];
  }
  return best;
}

const ODDITIES = [
  { key: "heartbreak", label: "Highest score in a loss", dir: "desc", calc: id => {
    const g = GAMES.filter(g => g.manager === id && g.pts < g.oppPts).sort((a, b) => b.pts - a.pts)[0];
    return g && { value: g.pts, show: fmtPts(g.pts), detail: `Lost ${fmtPts(g.pts)}–${fmtPts(g.oppPts)} to ${escapeHtml(nameOf(g.opp))}, ${weekLabel(g)}` };
  } },
  { key: "stolen", label: "Lowest score in a win", dir: "asc", calc: id => {
    const g = GAMES.filter(g => g.manager === id && g.pts > g.oppPts).sort((a, b) => a.pts - b.pts)[0];
    return g && { value: g.pts, show: fmtPts(g.pts), detail: `Beat ${escapeHtml(nameOf(g.opp))} ${fmtPts(g.pts)}–${fmtPts(g.oppPts)}, ${weekLabel(g)}` };
  } },
  { key: "luck", label: "Schedule luck", dir: "desc", calc: id => {
    const l = CAREER[id].luck;
    return { value: l, show: `${signed(l)} wins`, detail: l >= 0 ? "More wins than their weekly scores deserved" : "Fewer wins than their weekly scores deserved" };
  } },
  { key: "nailbiters", label: "Losses by under 5 points", dir: "desc", calc: id => {
    const close = GAMES.filter(g => g.manager === id && Math.abs(g.pts - g.oppPts) < 5);
    const l = close.filter(g => g.pts < g.oppPts).length, w = close.filter(g => g.pts > g.oppPts).length;
    return { value: l, show: l, detail: `${w}-${l} in games decided by under 5` };
  } },
  { key: "bench", label: "Points left on the bench", dir: "desc", calc: id => {
    const mine = LINEUPS.filter(r => r.manager === id && r.optimal != null);
    const total = mine.reduce((a, r) => a + r.optimal - r.actual, 0);
    return mine.length && { value: total, show: Math.round(total).toLocaleString(),
      detail: `${(total / new Set(mine.map(r => r.season)).size).toFixed(0)} per season versus the best possible lineup` };
  } },
  { key: "lineupLosses", label: "Losses the bench would have won", dir: "desc", calc: id => {
    const n = LINEUPS.filter(r => r.manager === id && r.actual < r.opp && r.optimal > r.opp).length;
    return { value: n, show: n, detail: "The best possible lineup outscored the opponent" };
  } },
  { key: "zeros", label: "Starters who scored zero or less", dir: "desc", calc: id => {
    const z = STARTS.filter(s => s.manager === id && s.points <= 0);
    const worst = z.sort((a, b) => a.points - b.points)[0];
    return { value: z.length, show: z.length,
      detail: worst ? `Worst: ${escapeHtml(DATA.players[worst.player].name)}, ${fmtPts(worst.points)} in ${worst.season} Wk ${worst.week}` : "Never" };
  } },
  { key: "top", label: "Weeks as the league's top scorer", dir: "desc", calc: id => {
    const n = weeklyTop[id] || 0;
    return { value: n, show: n, detail: "Regular season" };
  } },
  { key: "bottom", label: "Weeks as the league's lowest scorer", dir: "desc", calc: id => {
    const n = weeklyBottom[id] || 0;
    return { value: n, show: n, detail: "Regular season" };
  } },
  { key: "winStreak", label: "Longest winning streak", dir: "desc", calc: id => {
    const s = longestStreak(GAMES.filter(g => g.manager === id), true);
    return { value: s ? s.length : 0, show: s ? s.length : 0,
      detail: s ? `${s[0].season} Wk ${s[0].week} to ${s.at(-1).season} Wk ${s.at(-1).week}` : "Never won" };
  } },
  { key: "loseStreak", label: "Longest losing streak", dir: "desc", calc: id => {
    const s = longestStreak(GAMES.filter(g => g.manager === id), false);
    return { value: s ? s.length : 0, show: s ? s.length : 0,
      detail: s ? `${s[0].season} Wk ${s[0].week} to ${s.at(-1).season} Wk ${s.at(-1).week}` : "Never lost" };
  } },
  { key: "nemesis", label: "Nemesis", calc: id => {
    const h = headToHead(id).filter(r => r.n >= 3).sort((a, b) => a.pct - b.pct || b.n - a.n)[0];
    return h && { show: escapeHtml(nameOf(h.opp)), detail: `${h.w}-${h.l}${h.t ? `-${h.t}` : ""} against them` };
  } },
  { key: "victim", label: "Favorite opponent", calc: id => {
    const h = headToHead(id).filter(r => r.n >= 3).sort((a, b) => b.pct - a.pct || b.n - a.n)[0];
    return h && { show: escapeHtml(nameOf(h.opp)), detail: `${h.w}-${h.l}${h.t ? `-${h.t}` : ""} against them` };
  } },
  { key: "loyal", label: "Most-started player", calc: id => {
    const count = {};
    for (const s of STARTS) if (s.manager === id) count[s.player] = (count[s.player] || 0) + 1;
    const [idx, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
    return idx && { show: escapeHtml(DATA.players[idx].name), detail: `${n} starts` };
  } },
  { key: "redraft", label: "Drafted the most times", calc: id => {
    const count = {};
    for (const p of PICKS) if (p.manager === id) (count[p.player] ??= []).push(p);
    const [idx, picks] = Object.entries(count).sort((a, b) => b[1].length - a[1].length)[0] || [];
    return picks && picks.length > 1 && { show: escapeHtml(DATA.players[idx].name),
      detail: `${picks.length} times: ${picks.map(p => `${p.season} Rd ${p.round}`).join(", ")}` };
  } },
  { key: "busiest", label: "Busiest season", dir: "desc", calc: id => {
    const m = MOVES.filter(m => m.manager === id).sort((a, b) => (b.waiver + b.fa) - (a.waiver + a.fa))[0];
    return m && { value: m.waiver + m.fa, show: `${m.waiver + m.fa} moves`, detail: `${m.season}: ${m.waiver} waiver claims, ${m.fa} free agents, ${m.trades} trade${m.trades === 1 ? "" : "s"}` };
  } },
];

function headToHead(id) {
  const by = {};
  for (const g of GAMES) {
    if (g.manager !== id) continue;
    const r = (by[g.opp] ??= { opp: g.opp, w: 0, l: 0, t: 0, n: 0 });
    r.n++;
    if (g.pts > g.oppPts) r.w++; else if (g.pts < g.oppPts) r.l++; else r.t++;
  }
  return Object.values(by).map(r => ({ ...r, pct: (r.w + r.t / 2) / r.n }));
}

// Rank each manager on each rankable oddity once.
const ODD_VALUES = Object.fromEntries(ODDITIES.map(o => [o.key, Object.fromEntries(IDS.map(id => [id, o.calc(id)]))]));

function oddRank(o, id) {
  const vals = Object.values(ODD_VALUES[o.key]).filter(v => v && v.value != null).map(v => v.value);
  const mine = ODD_VALUES[o.key][id].value;
  const better = vals.filter(v => o.dir === "desc" ? v > mine : v < mine).length;
  return { rank: better + 1, of: vals.length };
}

/* ---------- Tiles ---------- */

function renderTiles(selected) {
  const order = IDS.slice().sort((a, b) =>
    (currentManagers.has(b) - currentManagers.has(a)) || nameOf(a).localeCompare(nameOf(b)));
  $("manager-tiles").innerHTML = order.map(id => {
    const m = ALLTIME[id];
    const years = m.firstSeason === m.lastSeason ? m.firstSeason : `${m.firstSeason}–${m.lastSeason}`;
    return `<button type="button" class="manager-tile" data-id="${id}" aria-pressed="${id === selected}">
      ${avatarHtml(id, "md")}
      <span class="manager-tile-name">${escapeHtml(nameOf(id))}</span>
      <span class="manager-tile-meta">${years}${currentManagers.has(id) ? "" : " · former"}</span>
      <span class="manager-tile-meta">${m.titles ? `${"🏆".repeat(m.titles)}` : m.bestFinish ? `Best: ${ordinal(m.bestFinish)}` : "First season"}</span>
    </button>`;
  }).join("");
}

$("manager-tiles").addEventListener("click", e => {
  const t = e.target.closest(".manager-tile");
  if (!t) return;
  select(t.dataset.id);
  $("profile").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Profile ---------- */

function renderHero(id) {
  const m = ALLTIME[id];
  const years = m.firstSeason === m.lastSeason ? m.firstSeason : `${m.firstSeason}–${m.lastSeason}`;
  const powerPos = LEAGUE_POWER.indexOf(id) + 1;
  const teams = m.seasons.slice().sort((a, b) => b.season - a.season);
  $("hero").innerHTML = `
    <div class="hero-top">
      ${avatarHtml(id, "lg")}
      <div class="hero-name">
        <h2>${escapeHtml(nameOf(id))}</h2>
        <p class="muted">${escapeHtml(teams[0].team)} · ${years}${currentManagers.has(id) ? "" : " · former manager"}</p>
        ${m.titles ? `<p class="hero-titles">${teams.filter(s => s.finish === 1).map(s => `<span class="tag">🏆 ${s.season} champion</span>`).join(" ")}</p>` : ""}
      </div>
      ${logoHtml(id)}
    </div>
    <dl class="facts">
      <div><dt>Seasons</dt><dd>${m.seasonCount}</dd></div>
      <div><dt>Record</dt><dd>${record(m)} <span class="muted-inline">${m.winPct.toFixed(3).replace(/^0/, "")}</span></dd></div>
      <div><dt>Points per game</dt><dd>${fmtPts(m.ppg)}</dd></div>
      <div><dt>Playoffs</dt><dd>${m.finishedSeasons ? `${m.playoffs} of ${m.finishedSeasons}` : "–"} <span class="muted-inline">${m.playoffW}-${m.playoffL} in playoff games</span></dd></div>
      <div><dt>Titles</dt><dd>${m.titles} <span class="muted-inline">${m.runnerUps} second, ${m.thirds} third</span></dd></div>
      <div><dt>Average finish</dt><dd>${m.avgFinish == null ? `– <span class="muted-inline">no finished season yet</span>`
        : `${m.avgFinish.toFixed(1)} <span class="muted-inline">best ${ordinal(m.bestFinish)}</span>`}</dd></div>
      <div><dt>All-time power rank</dt><dd>${ordinal(powerPos)} of ${IDS.length}</dd></div>
      <div><dt>Team names</dt><dd class="team-names">${[...new Set(teams.map(s => s.team))].map(name => {
        const yrs = teams.filter(s => s.team === name).map(s => s.season).sort();
        return `${escapeHtml(name)} <span class="muted-inline">${yrs.length > 1 ? `${yrs[0]}–${String(yrs.at(-1)).slice(-2)}` : yrs[0]}</span>`;
      }).join("<br>")}</dd></div>
    </dl>`;
}

const chart = echarts.init($("finish-chart"), null, { renderer: "svg" });

function renderChart(id) {
  const m = ALLTIME[id];
  const bySeason = Object.fromEntries(m.seasons.map(s => [s.season, s]));
  const ink = { muted: cssVar("--text-muted"), secondary: cssVar("--text-secondary"), grid: cssVar("--grid"),
                axis: cssVar("--axis"), surface: cssVar("--surface"), border: cssVar("--border"), primary: cssVar("--text-primary") };
  const { color } = managerStyle(id);
  const maxTeams = Math.max(...DATA.seasons.map(s => s.numTeams));

  // Least-squares line through the final finishes (a season in progress has none yet).
  const pts = m.seasons.filter(s => s.finish != null).map(s => [s.season, s.finish]);
  let trend = seasonsList.map(() => null);
  if (pts.length > 1) {
    const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
    const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
    const [first, last] = [pts[0][0], pts.at(-1)[0]];
    trend = seasonsList.map(y => y >= first && y <= last ? +(icpt + slope * y).toFixed(2) : null);
    const dir = slope < -0.15 ? "improving" : slope > 0.15 ? "sliding" : "holding steady";
    $("finish-legend").dataset.trend = `Trend: ${dir} (${Math.abs(slope).toFixed(2)} places per season ${slope < 0 ? "better" : slope > 0 ? "worse" : ""})`.trim();
  } else $("finish-legend").dataset.trend = "";

  const finishData = seasonsList.map(y => bySeason[y] ? {
    value: bySeason[y].finish,
    label: bySeason[y].finish === 1 ? { show: true, formatter: "🏆", position: "top", fontSize: 14 } : undefined,
  } : null);
  const powerData = seasonsList.map(y => bySeason[y] ? powerRank[`${y}|${id}`] : null);

  chart.setOption({
    animationDuration: 400,
    grid: { left: 44, right: 16, top: 24, bottom: 32 },
    xAxis: { type: "category", data: seasonsList.map(String), axisTick: { show: false },
             axisLine: { lineStyle: { color: ink.axis } }, axisLabel: { color: ink.muted } },
    yAxis: { type: "value", inverse: true, min: 1, max: maxTeams, interval: 1,
             axisLabel: { color: ink.muted, formatter: v => ordinal(v) }, splitLine: { lineStyle: { color: ink.grid } } },
    tooltip: {
      trigger: "axis", backgroundColor: ink.surface, borderColor: ink.border, textStyle: { color: ink.primary, fontSize: 13 },
      formatter: ps => {
        const y = +ps[0].axisValue, s = bySeason[y];
        if (!s) return `<b>${y}</b><br>Did not play`;
        const rec = `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`;
        if (s.finish == null) return `<b>${y} · ${escapeHtml(s.team)}</b><br>In progress: currently ${ordinal(s.seed)} of ${s.num_teams}` +
          `<br>Power rank ${ordinal(powerRank[`${y}|${id}`])}<br>${rec}`;
        return `<b>${y} · ${escapeHtml(s.team)}</b><br>Finished ${ordinal(s.finish)} of ${s.num_teams}` +
          `<br>Power rank ${ordinal(powerRank[`${y}|${id}`])}<br>${rec}, seed ${s.seed}`;
      },
    },
    series: [
      { name: "Final finish", type: "line", data: finishData, connectNulls: false, symbol: "circle", symbolSize: 10,
        lineStyle: { width: 2, color, type: managersById[id].dashed ? "dashed" : "solid" },
        itemStyle: { color, borderColor: ink.surface, borderWidth: 2 }, z: 3 },
      { name: "Power rank", type: "line", data: powerData, connectNulls: false, symbol: "rect", symbolSize: 8,
        lineStyle: { width: 2, color: ink.secondary, type: "dashed" },
        itemStyle: { color: ink.secondary, borderColor: ink.surface, borderWidth: 2 }, z: 2 },
      { name: "Trend", type: "line", data: trend, connectNulls: true, symbol: "none", silent: true,
        lineStyle: { width: 1.5, color, type: "dotted", opacity: 0.8 }, z: 1 },
    ],
  }, true);

  $("finish-legend").innerHTML = `
    <span class="team"><span class="swatch${managersById[id].dashed ? " dashed" : ""}" style="color:${color}"></span>Final finish</span>
    <span class="team"><span class="swatch dashed" style="color:${ink.secondary}"></span>Power rank</span>
    <span class="team"><span class="swatch dotted" style="color:${color}"></span>${escapeHtml($("finish-legend").dataset.trend || "Trend")}</span>`;
}

function renderPower(id) {
  const m = ALLTIME[id];
  $("power-body").innerHTML = m.seasons.slice().sort((a, b) => b.season - a.season).map(s => {
    const ap = allPlay[`${s.season}|${id}`], luck = seasonLuck(id, s);
    return `<tr>
      <td>${s.season}</td>
      <td>${escapeHtml(s.team)}</td>
      <td class="num">${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}</td>
      <td class="num">${ap.w}-${ap.l}${ap.t ? `-${ap.t}` : ""}</td>
      <td class="num">${ordinal(powerRank[`${s.season}|${id}`])}</td>
      <td class="num${s.finish === 1 ? " strong" : ""}">${s.finish == null ? `<span class="muted-inline">${ordinal(s.seed)} now</span>`
        : `${s.finish === 1 ? "🏆 " : ""}${ordinal(s.finish)}`}</td>
      <td class="num ${luck > 0.5 ? "delta-up" : luck < -0.5 ? "delta-down" : "delta-none"}">${signed(luck)}</td>
    </tr>`;
  }).join("");
  $("league-power-body").innerHTML = LEAGUE_POWER.map((o, i) => {
    const c = CAREER[o];
    return `<tr${o === id ? ' class="highlight"' : ""}>
      <td class="num">${i + 1}</td>
      <td>${managerCell(o)}</td>
      <td class="num">${c.ap.w}-${c.ap.l}${c.ap.t ? `-${c.ap.t}` : ""}</td>
      <td class="num">${c.pct.toFixed(3).replace(/^0/, "")}</td>
      <td class="num ${c.luck > 0.5 ? "delta-up" : c.luck < -0.5 ? "delta-down" : "delta-none"}">${signed(c.luck)}</td>
    </tr>`;
  }).join("");
}

function renderPlays(id) {
  const plays = STARTS.filter(s => s.manager === id).sort((a, b) => b.points - a.points).slice(0, 10);
  $("plays-body").innerHTML = plays.map((s, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td>${playerLink(s.player)}</td>
    <td>${weekLabel({ ...s, playoffs: s.type > 0, consolation: s.type === 2 })}</td>
    <td class="num"><b>${fmtPts(s.points)}</b></td>
  </tr>`).join("") || `<tr><td colspan="4" class="muted">No lineup data.</td></tr>`;

  const weeks = GAMES.filter(g => g.manager === id).sort((a, b) => b.pts - a.pts).slice(0, 10);
  $("weeks-body").innerHTML = weeks.map((g, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td>${weekLabel(g)}</td>
    <td>${managerCell(g.opp)}</td>
    <td class="num"><b>${fmtPts(g.pts)}</b>–${fmtPts(g.oppPts)} <span class="${g.pts > g.oppPts ? "delta-up" : "delta-down"}">${g.pts > g.oppPts ? "W" : g.pts < g.oppPts ? "L" : "T"}</span></td>
  </tr>`).join("");
}

function renderPickups(id) {
  const list = PICKUPS.filter(p => p.manager === id && p.type < 2 && p.points > 0).sort((a, b) => b.points - a.points).slice(0, 10);
  $("pickups-body").innerHTML = list.map((p, i) => `<tr>
    <td class="num">${i + 1}</td>
    <td>${playerLink(p.player)}</td>
    <td>${p.type === 0 ? "Waiver claim" : "Free agent"}</td>
    <td>${p.season} Wk ${p.week} <span class="muted-inline">${dateLabel(p.date)}</span></td>
    <td class="num">${p.starts}</td>
    <td class="num"><b>${fmtPts(p.points)}</b></td>
  </tr>`).join("") || `<tr><td colspan="6" class="muted">No pickups that scored.</td></tr>`;
}

const TRADE_LIMIT = 10;
let showAllTrades = false;
$("trades-more").addEventListener("click", () => {
  showAllTrades = !showAllTrades;
  renderTrades(new URLSearchParams(location.search).get("m"));
});

function renderTrades(id) {
  const itemsHtml = items => items.map(it => typeof it[0] === "string"
    ? `<div>${it[0].replace("R", "Round ")} pick</div>`
    : `<div>${playerLink(it[0])} <span class="trade-pts">${fmtPts(it[1])}</span></div>`).join("") || `<div class="muted-inline">Nothing</div>`;
  const total = items => items.reduce((a, it) => a + (typeof it[0] === "number" ? it[1] : 0), 0);
  const dates = Object.fromEntries(PICKUPS.filter(p => p.moveId).map(p => [p.moveId, p]));
  const trades = Object.entries(DATA.trades)
    .filter(([, sides]) => sides.some(s => s[0] === id))
    .map(([moveId, sides]) => {
      const mine = sides.find(s => s[0] === id), others = sides.filter(s => s[0] !== id);
      const sent = others.flatMap(s => s[2]);
      return { moveId, mine, others, sent, net: total(mine[2]) - total(sent), when: dates[moveId] };
    })
    .sort((a, b) => b.net - a.net);
  const shown = showAllTrades ? trades : trades.slice(0, TRADE_LIMIT);
  $("trades-more").hidden = trades.length <= TRADE_LIMIT;
  $("trades-more").textContent = showAllTrades ? "Show top 10 only" : `Show all ${trades.length} trades`;
  $("trades-body").innerHTML = shown.map(t => `<tr>
    <td>${t.when ? `${dateLabel(t.when.date)} <span class="muted-inline">Wk ${t.when.week}</span>` : t.moveId.slice(0, 4)}</td>
    <td>${t.others.map(s => managerCell(s[0])).join("")}</td>
    <td class="trade-items">${itemsHtml(t.mine[2])}</td>
    <td class="trade-items">${itemsHtml(t.sent)}</td>
    <td class="num ${t.net > 0 ? "delta-up" : t.net < 0 ? "delta-down" : "delta-none"}"><b>${signed(t.net, 2)}</b></td>
  </tr>`).join("") || `<tr><td colspan="5" class="muted">No trades.</td></tr>`;
}

function renderOddities(id) {
  $("oddities").innerHTML = ODDITIES.map(o => {
    const v = ODD_VALUES[o.key][id];
    if (!v) return "";
    let badge = "";
    if (o.dir) {
      const { rank, of } = oddRank(o, id);
      badge = `<span class="tag${rank === 1 ? " lead" : ""}">${rank === 1 ? "League leader" : `${ordinal(rank)} of ${of} managers`}</span>`;
    }
    return `<div class="tile static">
      <span class="tile-label">${o.label}</span>
      <span class="tile-value">${v.show}</span>
      <span class="tile-detail">${v.detail}</span>
      ${badge ? `<span class="tile-rank">${badge}</span>` : ""}
    </div>`;
  }).join("");
}

function select(id) {
  renderTiles(id);
  $("profile").hidden = false;
  history.replaceState(null, "", `?m=${id}`);
  showAllTrades = false;
  renderHero(id);
  renderChart(id);
  chart.resize();
  renderPower(id);
  renderPlays(id);
  renderPickups(id);
  renderTrades(id);
  renderOddities(id);
}

/* ---------- Init ---------- */

const initial = new URLSearchParams(location.search).get("m");
if (ALLTIME[initial]) select(initial);
else renderTiles(null);
window.addEventListener("resize", () => chart.resize());
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const id = new URLSearchParams(location.search).get("m");
  if (ALLTIME[id]) renderChart(id);
});
