// Trade Greaser: suggests fair trades with every other team, from a weekly trade value chart.
//
// A trade is "fair" when both sides' values are within the chosen tolerance. When one side sends two
// players, the lesser of the two counts at CONSOLIDATION of its value: two good players are worth less
// than their sum to the team that has to fit them into one roster, so the side getting the best
// player gets a premium. Among fair trades, the ones that improve both starting lineups rank first,
// since a trade that only helps you won't get accepted.

const TV = DATA.tradeValues;
const TRADE_POS = ["QB", "RB", "WR", "TE"];
const CONSOLIDATION = 0.8;
const PER_TEAM = 2;
const MIN_GAIN = 0.005;  // a suggestion must lift your lineup value by at least 0.5%
const posTag = pos => `<span class="pos-tag pos-${pos}">${pos}</span>`;
const nameOf = id => managersById[id].name;

const teams = TV.teams.map(t => ({
  manager: t.manager, name: t.name,
  players: t.players.map(([i, ppg, ir, ...values]) => ({ i, ppg, ir, values, name: DATA.players[i].name, pos: DATA.players[i].pos })),
}));
const keep = new Set();  // players on my team marked untouchable

/* ---------- Controls ---------- */

$("team-select").innerHTML = teams.slice().sort((a, b) => nameOf(a.manager).localeCompare(nameOf(b.manager)))
  .map(t => `<option value="${t.manager}">${escapeHtml(nameOf(t.manager))} · ${escapeHtml(t.name)}</option>`).join("");
const params = new URLSearchParams(location.search);
$("team-select").value = teams.some(t => t.manager === params.get("m")) ? params.get("m")
  : teams.some(t => t.manager === "matt") ? "matt" : teams[0].manager;

$("source-select").innerHTML = TV.sources.map((s, k) => `<option value="${k}">${escapeHtml(s.label)} (week ${s.week})</option>`).join("");
$("want-boxes").innerHTML = TRADE_POS.map(pos => `<label class="control tg-check">
  <input type="checkbox" value="${pos}"${pos === "RB" ? " checked" : ""}> ${posTag(pos)}</label>`).join("");

const moves = TV.movesThrough
  ? new Date(TV.movesThrough + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
$("as-of").textContent = `Rosters are week ${TV.rosterWeek} lineups and benches${moves ? `, plus pickups and trades through ${moves}` : ""}. ` +
  "Anything since then isn't reflected yet.";

/* ---------- Valuing ---------- */

const src = () => Number($("source-select").value);
const val = p => p.values[src()] ?? 0;

// Package value: best player in full, the rest at the consolidation rate.
function pkgValue(ps) {
  const vs = ps.map(val).sort((a, b) => b - a);
  return vs.reduce((sum, v, k) => sum + (k ? v * CONSOLIDATION : v), 0);
}

// Value of the best starting lineup: QB, 2 RB, 2 WR, TE and 2 W/R/T flex (K and DEF aren't on the charts).
function lineupValue(ps) {
  const need = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const bench = [];
  let total = 0;
  for (const p of ps.filter(p => TRADE_POS.includes(p.pos)).sort((a, b) => val(b) - val(a))) {
    if (need[p.pos] > 0) { need[p.pos]--; total += val(p); }
    else if (p.pos !== "QB") bench.push(val(p));
  }
  return total + (bench[0] ?? 0) + (bench[1] ?? 0);
}

function starters(ps) {
  const need = { QB: 1, RB: 2, WR: 2, TE: 1 };
  let flex = 2;
  const on = new Set();
  for (const p of ps.filter(p => TRADE_POS.includes(p.pos)).sort((a, b) => val(b) - val(a))) {
    if (need[p.pos] > 0) { need[p.pos]--; on.add(p); }
    else if (p.pos !== "QB" && flex > 0) { flex--; on.add(p); }
  }
  return on;
}

const combos = (xs, n) => n === 1 ? xs.map(x => [x]) : xs.flatMap((x, k) => xs.slice(k + 1).map(y => [x, y]));

function suggest(me, them, want, [giveN, getN], tol) {
  const mine = me.players.filter(p => TRADE_POS.includes(p.pos) && val(p) > 0 && !keep.has(p.i));
  const theirs = them.players.filter(p => want.includes(p.pos) && val(p) > 0);
  const myBase = lineupValue(me.players), theirBase = lineupValue(them.players);
  const found = [];
  for (const give of combos(mine, giveN)) {
    const gv = pkgValue(give);
    for (const get of combos(theirs, getN)) {
      const rv = pkgValue(get);
      const gap = Math.abs(gv - rv) / Math.max(gv, rv);
      if (gap > tol) continue;
      const myGain = lineupValue(me.players.filter(p => !give.includes(p)).concat(get)) - myBase;
      if (myGain < MIN_GAIN * myBase) continue;  // skip sideways shuffles
      const theirGain = lineupValue(them.players.filter(p => !get.includes(p)).concat(give)) - theirBase;
      found.push({ give, get, gv, rv, gap, myGain, theirGain });
    }
  }
  // Win-wins first, then the most combined lineup improvement.
  found.sort((a, b) => (b.theirGain >= 0) - (a.theirGain >= 0) || (b.myGain + b.theirGain) - (a.myGain + a.theirGain));
  const picked = [];
  for (const t of found) {
    if (picked.some(p => p.get.some(x => t.get.includes(x)))) continue;  // a different target each time
    picked.push(t);
    if (picked.length === PER_TEAM) break;
  }
  return picked;
}

/* ---------- Rendering ---------- */

const fmtV = v => v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
const signed = v => `<span class="${v > 0.05 ? "delta-up" : v < -0.05 ? "delta-down" : "delta-none"}">${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtV(Math.abs(v))}</span>`;
const playerLink = p => `<a href="players.html?player=${encodeURIComponent(p.name)}">${escapeHtml(p.name)}</a>`;

function sideHtml(label, ps, total) {
  return `<div class="tg-side"><h4>${label}</h4><ul>${ps.map(p => `<li>${posTag(p.pos)} ${playerLink(p)}${
    p.ir ? ` <span class="tag bad">IR</span>` : ""}<span class="tg-val">${fmtV(val(p))}</span></li>`).join("")}</ul>
    ${ps.length > 1 ? `<div class="tg-total muted-inline">Package value ${fmtV(total)}</div>` : ""}</div>`;
}

function renderRoster(me) {
  const on = starters(me.players);
  const rows = me.players.slice().sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name));
  $("roster-title").textContent = `${nameOf(me.manager)}'s roster · ${me.name}`;
  $("roster-body").innerHTML = rows.map(p => {
    const tradable = TRADE_POS.includes(p.pos) && val(p) > 0;
    return `<tr${keep.has(p.i) ? ` class="tg-kept"` : ""}>
      <td>${tradable ? `<input type="checkbox" data-keep="${p.i}" aria-label="Keep ${escapeHtml(p.name)}"${keep.has(p.i) ? " checked" : ""}>` : ""}</td>
      <td>${posTag(p.pos)} ${playerLink(p)}${p.ir ? ` <span class="tag bad">IR</span>` : ""}</td>
      <td class="muted-inline">${on.has(p) ? "Starter" : TRADE_POS.includes(p.pos) ? "Depth" : ""}</td>
      <td class="num">${val(p) ? fmtV(val(p)) : "–"}</td>
      <td class="num">${p.ppg ? p.ppg.toFixed(1) : "–"}</td></tr>`;
  }).join("");
}

function render() {
  const me = teams.find(t => t.manager === $("team-select").value);
  history.replaceState(null, "", `?m=${me.manager}`);
  const want = [...document.querySelectorAll("#want-boxes input:checked")].map(x => x.value);
  const shape = document.querySelector("input[name=shape]:checked").value.split("-").map(Number);
  const tol = Number($("tol-select").value);
  renderRoster(me);
  const source = TV.sources[src()];
  $("value-note").textContent = `Values from ${source.label}'s week ${source.week} half-PPR chart. ` +
    "Players not on the chart count as 0 and aren't offered. Lineup change is the value of each team's best starting lineup after the trade.";

  if (!want.length) {
    $("suggestions").innerHTML = `<p class="muted">Pick at least one position to go after.</p>`;
    return;
  }
  const others = teams.filter(t => t !== me).sort((a, b) => nameOf(a.manager).localeCompare(nameOf(b.manager)));
  $("suggestions").innerHTML = others.map(them => {
    const ideas = suggest(me, them, want, shape, tol);
    const head = `<div class="tg-team"><span class="team">${swatchHtml(them.manager)}<b>${escapeHtml(nameOf(them.manager))}</b></span>
      <span class="muted-inline">${escapeHtml(them.name)}</span></div>`;
    if (!ideas.length) return `<article class="tg-card">${head}<p class="muted-inline tg-none">No fair trade that improves your lineup.</p></article>`;
    return `<article class="tg-card">${head}${ideas.map(t => `<div class="tg-idea">
      <div class="tg-sides">${sideHtml("You give", t.give, t.gv)}${sideHtml("You get", t.get, t.rv)}</div>
      <div class="tg-foot">
        <span title="Package values ${fmtV(t.gv)} vs ${fmtV(t.rv)}">${t.gap < 0.005 ? "Even value" : `${Math.round(t.gap * 100)}% apart in value`}</span>
        <span>Your lineup ${signed(t.myGain)}</span>
        <span>Their lineup ${signed(t.theirGain)}</span>
        ${t.theirGain >= 0 ? `<span class="tag lead">Helps both</span>` : ""}
      </div></div>`).join("")}</article>`;
  }).join("");
}

$("roster-body").addEventListener("change", e => {
  const i = Number(e.target.dataset.keep);
  if (e.target.checked) keep.add(i); else keep.delete(i);
  render();
});
$("team-select").addEventListener("change", () => { keep.clear(); render(); });
for (const id of ["source-select", "tol-select"]) $(id).addEventListener("change", render);
$("want-boxes").addEventListener("change", render);
for (const r of document.querySelectorAll("input[name=shape]")) r.addEventListener("change", render);
render();
