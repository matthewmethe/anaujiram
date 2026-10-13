// Narratives: each week's storylines, written up after the week closes (data/narratives/*.md).

const NARR = DATA.narratives || [];
const keyOf = n => `${n.season}-${n.week}`;

const teamName = (season, managerId) => {
  const s = DATA.seasons.find(s => s.season === season);
  const t = s && s.teams.find(t => t.manager === managerId);
  return t ? t.name : managersById[managerId].name;
};

const select = $("week-select");
select.innerHTML = NARR.map(n => `<option value="${keyOf(n)}">${n.season} · ${escapeHtml(n.title)}</option>`).join("");
const wanted = new URLSearchParams(location.search).get("w");
if (NARR.some(n => keyOf(n) === wanted)) select.value = wanted;

function render() {
  const k = NARR.findIndex(n => keyOf(n) === select.value);
  const n = NARR[k];
  if (!n) {
    $("narr-sub").textContent = "No narratives yet.";
    return;
  }
  $("narr-title").textContent = `${n.season} ${n.title}`;
  $("narr-sub").textContent = `${n.stories.length} storylines from week ${n.week}.`;
  $("stories").innerHTML = n.stories.map(s => `<li class="story">
      <h3>${s.headline}</h3>
      ${s.managers.length ? `<div class="story-teams">${s.managers.map(m =>
        `<span class="story-team"><span class="dot" style="background:${managerStyle(m).color}"></span>${escapeHtml(teamName(n.season, m))}</span>`).join("")}</div>` : ""}
      <div class="story-body">${s.html}</div>
    </li>`).join("");
  // Newer is first in the list, so "previous week" is the next entry.
  const older = NARR[k + 1], newer = NARR[k - 1];
  $("nav-weeks").innerHTML = [
    older ? `<a href="?w=${keyOf(older)}" data-w="${keyOf(older)}">← ${older.season} ${escapeHtml(older.title)}</a>` : "<span></span>",
    newer ? `<a href="?w=${keyOf(newer)}" data-w="${keyOf(newer)}">${newer.season} ${escapeHtml(newer.title)} →</a>` : "<span></span>",
  ].join("");
}

function go(w) {
  select.value = w;
  history.replaceState(null, "", `?w=${w}`);
  render();
}

select.addEventListener("change", () => go(select.value));
$("nav-weeks").addEventListener("click", e => {
  const a = e.target.closest("a[data-w]");
  if (!a) return;
  e.preventDefault();
  go(a.dataset.w);
  window.scrollTo(0, 0);
});
render();
