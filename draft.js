// Draft page: every pick 2018 on, manager tendencies by round and position, and how they changed.

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const POS_SLOT = { QB: 1, RB: 3, WR: 2, TE: 5, K: 7, DEF: 6 };
const nameOf = id => managersById[id].name;
const posOf = i => DATA.players[i].pos;

const PICKS = DATA.picks.map(([season, round, overall, manager, player]) => ({ season, round, overall, manager, player }));
const SEASONS = [...new Set(PICKS.map(p => p.season))].sort();
const teamsIn = season => new Set(PICKS.filter(p => p.season === season).map(p => p.manager)).size;
const pickLabel = p => `${p.round}.${String(p.overall - (p.round - 1) * teamsIn(p.season)).padStart(2, "0")}`;

// Starter points the drafting manager got from each pick that season.
const startPts = {};
for (const [season, , manager, player, , pts] of DATA.starts) {
  const k = `${season}|${manager}|${player}`;
  startPts[k] = (startPts[k] ?? 0) + pts;
}
for (const p of PICKS) p.pts = startPts[`${p.season}|${p.manager}|${p.player}`] ?? 0;

const posTag = (pos, extra = "") => `<span class="pos-tag pos-${pos}"${extra}>${pos}</span>`;
const avg = xs => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;

$("pos-key").innerHTML = POSITIONS.map(p => posTag(p)).join("");

/* ---------- Manager select ---------- */

const draftedManagers = [...new Set(PICKS.map(p => p.manager))];
$("manager-select").innerHTML = `<option value="">Whole league</option>` +
  draftedManagers.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map(id => `<option value="${id}">${escapeHtml(nameOf(id))}</option>`).join("");
const params = new URLSearchParams(location.search);
$("manager-select").value = managersById[params.get("m")] ? params.get("m") : "";

/* ---------- Tendencies: first round each position is taken ---------- */

// For each manager-season, the round they first drafted each position.
function firstRounds(picks) {
  const by = {};
  for (const p of picks) {
    const k = `${p.manager}|${p.season}`, pos = posOf(p.player);
    const r = (by[k] ??= {});
    r[pos] = Math.min(r[pos] ?? 99, p.round);
  }
  return by;
}

function renderTendencies(m) {
  const all = firstRounds(PICKS);
  const leagueFirst = pos => avg(Object.values(all).map(r => r[pos]).filter(Boolean));
  const mine = m ? Object.entries(all).filter(([k]) => k.startsWith(m + "|")).map(([, r]) => r) : null;
  const seasons = m ? mine.length : SEASONS.length;
  $("tend-title").textContent = m ? `${nameOf(m)}'s draft tendencies` : "League draft tendencies";
  $("tend-note").textContent = m
    ? `Across ${seasons} draft${seasons > 1 ? "s" : ""}: the average round ${nameOf(m)} first takes each position, compared with the league.`
    : `Across ${SEASONS.length} drafts: the average round the league first takes each position.`;

  $("first-tiles").innerHTML = POSITIONS.map(pos => {
    const lg = leagueFirst(pos);
    if (!m) return `<div class="tile static"><span class="tile-label">First ${pos}</span>
      <span class="tile-value">Round ${lg.toFixed(1)}</span><span class="tile-detail">league average</span></div>`;
    const mv = avg(mine.map(r => r[pos]).filter(Boolean));
    if (mv === null) return "";
    const diff = mv - lg;
    const verdict = Math.abs(diff) < 0.5 ? "about league average"
      : diff < 0 ? `${Math.abs(diff).toFixed(1)} rounds earlier than the league` : `${diff.toFixed(1)} rounds later than the league`;
    return `<div class="tile static">
      <span class="tile-label">${posTag(pos)} First ${pos}</span>
      <span class="tile-value">Round ${mv.toFixed(1)}</span>
      <span class="tile-detail">${verdict} (${lg.toFixed(1)})</span></div>`;
  }).join("");
}

/* ---------- Position by round ---------- */

function renderMix(m) {
  const picks = m ? PICKS.filter(p => p.manager === m) : PICKS;
  const rounds = [...new Set(PICKS.map(p => p.round))].sort((a, b) => a - b);
  $("round-note").textContent = m
    ? `Share of ${nameOf(m)}'s picks in each round by position, all drafts combined. Hover for the league's share in that round.`
    : "Share of the league's picks in each round by position, all drafts combined.";
  const share = (ps, r, pos) => {
    const inRound = ps.filter(p => p.round === r);
    return inRound.length ? inRound.filter(p => posOf(p.player) === pos).length / inRound.length : null;
  };
  $("mix-head").innerHTML = `<tr><th>Round</th>${POSITIONS.map(p => `<th class="num">${posTag(p)}</th>`).join("")}<th class="num">Picks</th></tr>`;
  $("mix-body").innerHTML = rounds.map(r => {
    const n = picks.filter(p => p.round === r).length;
    return `<tr><th scope="row">${r}</th>${POSITIONS.map(pos => {
      const s = share(picks, r, pos), lg = share(PICKS, r, pos);
      if (!s) return `<td class="mix-cell empty">–</td>`;
      const tip = `Round ${r} ${pos}: ${Math.round(s * 100)}%` + (m ? ` (league ${Math.round(lg * 100)}%)` : "");
      return `<td class="mix-cell pos-bg-${pos}" style="--share:${s}" title="${tip}">${Math.round(s * 100)}%</td>`;
    }).join("")}<td class="num muted-inline">${n}</td></tr>`;
  }).join("");
}

/* ---------- Draft history (one manager) ---------- */

function renderHistory(m) {
  const section = $("history-body").closest("section");
  section.hidden = !m;
  if (!m) return;
  const picks = PICKS.filter(p => p.manager === m);
  const seasons = [...new Set(picks.map(p => p.season))].sort();
  const rounds = Math.max(...picks.map(p => p.round));
  $("history-title").textContent = `${nameOf(m)}'s draft history`;
  // Rounds down the side, seasons across the top, so it fits without side scrolling.
  const finish = s => DATA.seasons.find(x => x.season === s).teams.find(t => t.manager === m).finalRank;
  $("history-head").innerHTML = `<tr><th></th>${seasons.map(s => {
    const f = finish(s);  // null while the season is in progress
    if (f == null) return `<th class="board-team" title="${s}: in progress">${s} <span class="finish-tag">in progress</span></th>`;
    return `<th class="board-team" title="${s}: finished ${ordinal(f)}">${s} <span class="finish-tag${f === 1 ? " champ-tag" : ""}">${
      f === 1 ? "🏆 " : ""}${ordinal(f)}</span></th>`;
  }).join("")}</tr>`;
  $("history-body").innerHTML = Array.from({ length: rounds }, (_, i) => `<tr><th scope="row">R${i + 1}</th>${
    seasons.map(s => {
      const p = picks.find(q => q.season === s && q.round === i + 1);
      if (!p) return `<td class="pick-cell empty"></td>`;
      const pos = posOf(p.player), name = DATA.players[p.player].name;
      const tip = `${s} pick ${pickLabel(p)}: ${name} (${pos}) · ${p.pts.toFixed(1)} starter pts`;
      return `<td class="pick-cell pos-bg-${pos}" title="${escapeHtml(tip)}">
        <span>${escapeHtml(shortName(name))}</span><small>${pos} · ${p.pts ? Math.round(p.pts) : "–"}</small></td>`;
    }).join("")}</tr>`).join("");
}

function shortName(name) {
  const parts = name.split(" ");
  if (parts.length === 1) return name;  // team defenses
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/* ---------- First pick at a position, by year ---------- */

function renderTrend() {
  const pos = $("trend-pos").value;
  const all = firstRounds(PICKS);
  const m = $("manager-select").value;
  const managers = draftedManagers.filter(id => SEASONS.some(s => all[`${id}|${s}`]))
    .sort((a, b) => (b === m) - (a === m) || nameOf(a).localeCompare(nameOf(b)));
  const leagueAvg = {};
  for (const s of SEASONS) leagueAvg[s] = avg(Object.entries(all).filter(([k]) => k.endsWith("|" + s)).map(([, r]) => r[pos]).filter(Boolean));

  $("trend-head").innerHTML = `<tr><th>Manager</th>${SEASONS.map(s => `<th class="num">${s}</th>`).join("")}<th class="num">Avg</th></tr>`;
  $("trend-body").innerHTML = managers.map(id => {
    const vals = [];
    const cells = SEASONS.map(s => {
      const r = all[`${id}|${s}`];
      if (!r) return `<td class="finish empty"></td>`;
      const v = r[pos];
      if (!v) return `<td class="finish muted-inline" title="No ${pos} drafted">–</td>`;
      vals.push(v);
      const { bg, ink } = signedColor((leagueAvg[s] - v) / 4);
      return `<td class="finish" style="background:${bg};color:${ink}" title="${nameOf(id)} ${s}: first ${pos} in round ${v} (league avg ${leagueAvg[s].toFixed(1)})">R${v}</td>`;
    }).join("");
    return `<tr class="${id === m ? "highlight-row" : ""}"><th scope="row"><span class="team">${swatchHtml(id)}${escapeHtml(nameOf(id))}</span></th>${cells}
      <td class="num">${vals.length ? avg(vals).toFixed(1) : "–"}</td></tr>`;
  }).join("") + `<tr class="league-row"><th scope="row">League average</th>${SEASONS.map(s =>
    `<td class="num muted-inline">${leagueAvg[s] ? leagueAvg[s].toFixed(1) : "–"}</td>`).join("")}<td></td></tr>`;
}

/* ---------- Draft board (one season) ---------- */

$("board-season").innerHTML = SEASONS.slice().reverse().map(s => `<option>${s}</option>`).join("");

function renderBoard() {
  const s = Number($("board-season").value);
  const picks = PICKS.filter(p => p.season === s);
  const order = picks.filter(p => p.round === 1).map(p => p.manager);
  const teamName = Object.fromEntries(DATA.seasons.find(x => x.season === s).teams.map(t => [t.manager, t.name]));
  const rounds = Math.max(...picks.map(p => p.round));
  const m = $("manager-select").value;
  $("board-head").innerHTML = `<tr><th></th>${order.map(id => `<th class="board-team${id === m ? " mine" : ""}">
    <span class="team">${swatchHtml(id)}<span class="clip">${escapeHtml(nameOf(id))}</span></span>
    <span class="muted-inline" title="${escapeHtml(teamName[id])}">${escapeHtml(teamName[id])}</span></th>`).join("")}</tr>`;
  $("board-body").innerHTML = Array.from({ length: rounds }, (_, i) => {
    const r = i + 1;
    return `<tr><th scope="row">R${r}</th>${order.map(id => {
      const p = picks.find(q => q.round === r && q.manager === id);
      if (!p) return `<td class="pick-cell empty"></td>`;
      const pos = posOf(p.player), name = DATA.players[p.player].name;
      return `<td class="pick-cell pos-bg-${pos}${id === m ? " mine" : ""}" title="${escapeHtml(`Pick ${pickLabel(p)}: ${name} (${pos})`)}">
        <span>${escapeHtml(shortName(name))}</span><small>${pos} · ${p.pts ? Math.round(p.pts) : "–"}</small></td>`;
    }).join("")}</tr>`;
  }).join("");
}

/* ---------- Steals and busts ---------- */

// A season in progress (no final ranks yet) is left out: a few weeks of points can't judge a pick.
const unfinished = new Set(DATA.seasons.filter(s => s.teams.some(t => t.finalRank == null)).map(s => s.season));
if (unfinished.size) $("value-note").textContent = ` ${[...unfinished].join(", ")} joins once the season ends.`;

function renderValue(m) {
  const pool = PICKS.filter(p => (!m || p.manager === m) && !unfinished.has(p.season));
  const row = p => `<tr>
    <td><a href="players.html?player=${encodeURIComponent(DATA.players[p.player].name)}">${escapeHtml(DATA.players[p.player].name)}</a> ${posTag(posOf(p.player))}</td>
    <td><span class="team">${swatchHtml(p.manager)}${escapeHtml(nameOf(p.manager))}</span></td>
    <td>${p.season} · ${pickLabel(p)}</td>
    <td class="num"><b>${p.pts.toFixed(1)}</b></td></tr>`;
  const isStarterPos = p => !["K", "DEF"].includes(posOf(p.player));
  $("steals-body").innerHTML = pool.filter(p => p.round >= 6).sort((a, b) => b.pts - a.pts).slice(0, 10).map(row).join("");
  $("busts-body").innerHTML = pool.filter(p => p.round <= 3 && isStarterPos(p))
    .sort((a, b) => a.pts - b.pts || a.overall - b.overall).slice(0, 10).map(row).join("");
}

/* ---------- Init ---------- */

function renderAll() {
  const m = $("manager-select").value;
  history.replaceState(null, "", m ? `?m=${m}` : location.pathname);
  renderTendencies(m); renderMix(m); renderHistory(m); renderTrend(); renderBoard(); renderValue(m);
}
$("manager-select").addEventListener("change", renderAll);
$("trend-pos").addEventListener("change", renderTrend);
$("board-season").addEventListener("change", renderBoard);
renderAll();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderTrend);
