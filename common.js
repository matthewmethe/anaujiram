// Shared by every page: league data, manager colors, and formatting helpers.

const DATA = window.LEAGUE_DATA;

// Managers past the 8 solid slots reuse a hue as dashed lines + square markers, so identity
// never rests on color alone. Color follows the manager, never rank; the data guarantees no
// two dashed managers in one season share a hue.
const managersById = Object.fromEntries(DATA.managers.map(m => [m.id, m]));

const $ = id => document.getElementById(id);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function managerStyle(managerId) {
  const m = managersById[managerId];
  return { color: cssVar(`--series-${m.slot}`), dashed: m.dashed };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const record = r => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;
const fmtPts = x => x.toFixed(2);

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function swatchHtml(managerId) {
  const { color, dashed } = managerStyle(managerId);
  return `<span class="swatch${dashed ? " dashed" : ""}" style="color:${color}"></span>`;
}

/* Diverging color: red (worse) - gray (even) - blue (better). */

const isDark = () => getComputedStyle(document.documentElement).colorScheme === "dark";

function mix(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

// pct: 0..1 with 0.5 as even (e.g. a win rate).
function divergingColor(pct) {
  return signedColor((pct - 0.5) * 2);
}

// t: -1..1, negative = worse (red), positive = better (blue).
function signedColor(t) {
  const dark = isDark();
  const mid = dark ? "#383835" : "#f0efec";
  const pole = t >= 0 ? (dark ? "#3987e5" : "#1c5cab") : (dark ? "#e66767" : "#c2413f");
  const k = Math.min(1, Math.abs(t));
  const ink = dark ? "#ffffff" : k > 0.5 ? "#ffffff" : "#0b0b0b";
  return { bg: mix(mid, pole, k), ink };
}

// On a phone the page tabs scroll sideways; each tab is a new page, so keep the tab row where it was
// (and make sure the current tab is in view) instead of snapping back to the start.
const nav = document.querySelector(".site-nav");
if (nav && nav.scrollWidth > nav.clientWidth) {
  let saved = null;
  try { saved = sessionStorage.getItem("navScroll"); } catch {}
  if (saved !== null) nav.scrollLeft = Number(saved);
  const current = nav.querySelector("[aria-current]");
  if (current) {
    const n = nav.getBoundingClientRect(), c = current.getBoundingClientRect();
    if (c.left < n.left || c.right > n.right) nav.scrollLeft += c.left - n.left - (n.width - c.width) / 2;
  }
  nav.addEventListener("click", () => { try { sessionStorage.setItem("navScroll", nav.scrollLeft); } catch {} });
}

const sample = document.getElementById("sample-banner");
if (sample) sample.hidden = !DATA.isSample;
