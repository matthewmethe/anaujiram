// Narratives: each week's matchup previews (written before the week) and recap (after it closes),
// from data/narratives/*.md.

const NARR = DATA.narratives || [];
const keyOf = n => `${n.season}-${n.week}`;
const KINDS = ["preview", "recap"];

const teamName = (season, managerId) => {
  const s = DATA.seasons.find(s => s.season === season);
  const t = s && s.teams.find(t => t.manager === managerId);
  return t ? t.name : managersById[managerId].name;
};

const select = $("week-select");
select.innerHTML = NARR.map(n => `<option value="${keyOf(n)}">${n.season} · Week ${n.week}</option>`).join("");
const params = new URLSearchParams(location.search);
if (NARR.some(n => keyOf(n) === params.get("w"))) select.value = params.get("w");
let kind = KINDS.includes(params.get("v")) ? params.get("v") : null;

const toggle = $("kind-toggle");

// A week opens on its recap once there is one, else on its preview.
const defaultKind = n => n.recap ? "recap" : "preview";

function teamLine(t) {
  const rec = `${t.w}–${t.l}${t.t ? `–${t.t}` : ""}`;
  return `<span class="mu-team"><span class="dot" style="background:${managerStyle(t.manager).color}"></span>`
    + `<strong>${escapeHtml(t.name)}</strong><span class="mu-rec">${rec}${t.streak ? ` · ${t.streak}` : ""}</span></span>`;
}

function matchupHtml(m) {
  const [a, b] = m.teams;
  const who = t => escapeHtml(managersById[t.manager].name);
  const [aw, bw, ties] = m.series;
  const tieText = ties ? `, ${ties} tie${ties > 1 ? "s" : ""}` : "";
  const series = aw + bw + ties === 0 ? "First meeting"
    : aw === bw ? `All-time series tied ${aw}–${bw}${tieText}`
    : `${who(aw > bw ? a : b)} leads the all-time series ${Math.max(aw, bw)}–${Math.min(aw, bw)}${tieText}`;
  let last = "";
  if (m.last) {
    const [season, week, ap, bp] = m.last;
    const won = ap === bp ? "tied" : `${who(ap > bp ? a : b)} won`;
    last = ` · Last met ${season} week ${week}: ${won} ${fmtPts(Math.max(ap, bp))}–${fmtPts(Math.min(ap, bp))}`;
  }
  let final = "";
  if (m.result) {
    const [ap, bp] = m.result;
    const pts = (p, q) => p > q ? `<strong>${fmtPts(p)}</strong>` : fmtPts(p);
    final = `<div class="mu-final">Final: ${escapeHtml(a.name)} ${pts(ap, bp)} – ${pts(bp, ap)} ${escapeHtml(b.name)}</div>`;
  }
  return `<div class="mu">
      <div class="mu-teams">${teamLine(a)}<span class="mu-vs">vs</span>${teamLine(b)}</div>
      <div class="mu-meta">${series}${last}</div>
      ${final}
    </div>`;
}

function storyHtml(n, s) {
  const tags = s.matchup ? matchupHtml(s.matchup)
    : s.managers.length ? `<div class="story-teams">${s.managers.map(m =>
      `<span class="story-team"><span class="dot" style="background:${managerStyle(m).color}"></span>${escapeHtml(teamName(n.season, m))}</span>`).join("")}</div>`
    : "";
  return `<li class="story">
      <h3>${s.headline}</h3>
      ${tags}
      <div class="story-body">${s.html}</div>
    </li>`;
}

function render() {
  const k = NARR.findIndex(n => keyOf(n) === select.value);
  const n = NARR[k];
  if (!n) {
    $("narr-sub").textContent = "No narratives yet.";
    toggle.hidden = true;
    return;
  }
  if (!kind || !n[kind]) kind = defaultKind(n);
  const doc = n[kind];
  toggle.querySelectorAll("button").forEach(b => {
    b.disabled = !n[b.dataset.k];
    b.setAttribute("aria-pressed", b.dataset.k === kind);
    b.title = n[b.dataset.k] ? "" : `No ${b.dataset.k} for week ${n.week} yet`;
  });
  $("narr-title").textContent = `${n.season} ${doc.title}`;
  $("narr-sub").textContent = kind === "preview"
    ? `${doc.stories.length} matchups to watch in week ${n.week}.`
    : `${doc.stories.length} storylines from week ${n.week}.`;
  $("stories").innerHTML = doc.stories.map(s => storyHtml(n, s)).join("");
  // Newer is first in the list, so "previous week" is the next entry.
  const older = NARR[k + 1], newer = NARR[k - 1];
  $("nav-weeks").innerHTML = [
    older ? `<a href="?w=${keyOf(older)}" data-w="${keyOf(older)}">← ${older.season} Week ${older.week}</a>` : "<span></span>",
    newer ? `<a href="?w=${keyOf(newer)}" data-w="${keyOf(newer)}">${newer.season} Week ${newer.week} →</a>` : "<span></span>",
  ].join("");
}

function go(w, k) {
  select.value = w;
  kind = k;
  render();
  history.replaceState(null, "", `?w=${w}&v=${kind}`);
}

select.addEventListener("change", () => go(select.value, null));
toggle.addEventListener("click", e => {
  const b = e.target.closest("button[data-k]");
  if (b && !b.disabled) go(select.value, b.dataset.k);
});
$("nav-weeks").addEventListener("click", e => {
  const a = e.target.closest("a[data-w]");
  if (!a) return;
  e.preventDefault();
  go(a.dataset.w, null);
  window.scrollTo(0, 0);
});
render();
