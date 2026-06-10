/* Chess Pulse frontend: renders data/news.json and a live Lichess leaderboard. */

const state = { items: [], source: "", query: "" };

const fmtDate = (iso) => {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  if (diffH < 48) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

function renderNews() {
  const list = document.getElementById("news-list");
  const q = state.query.toLowerCase();
  const items = state.items.filter(
    (it) =>
      (!state.source || it.source === state.source) &&
      (!q || it.title.toLowerCase().includes(q) || it.summary.toLowerCase().includes(q))
  );
  if (items.length === 0) {
    list.innerHTML = '<p class="empty">No news matches your filter.</p>';
    return;
  }
  list.innerHTML = items
    .map(
      (it) => `
      <article class="news-card">
        <div class="news-meta">
          <span class="source-badge">${esc(it.source)}</span>
          <time datetime="${esc(it.date)}">${fmtDate(it.date)}</time>
        </div>
        <h3><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
        ${it.summary ? `<p>${esc(it.summary)}</p>` : ""}
      </article>`
    )
    .join("");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function buildFilters(sources) {
  const wrap = document.getElementById("source-filters");
  for (const s of sources) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.source = s;
    btn.textContent = s;
    wrap.appendChild(btn);
  }
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    state.source = btn.dataset.source;
    renderNews();
  });
}

async function loadNews() {
  const list = document.getElementById("news-list");
  try {
    const res = await fetch("data/news.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.items = data.items || [];
    const stamp = document.getElementById("updated-stamp");
    stamp.textContent = `Updated ${fmtDate(data.updated)}`;
    stamp.title = new Date(data.updated).toLocaleString();
    buildFilters([...new Set(state.items.map((it) => it.source))]);
    renderNews();
  } catch (err) {
    list.innerHTML = `<p class="empty">Could not load news (${esc(err.message)}). Try refreshing.</p>`;
  }
}

/* --- Live leaderboard (Lichess public API, CORS-enabled) --- */

const lbCache = {};

async function loadLeaderboard(perf) {
  const ol = document.getElementById("leaderboard");
  ol.innerHTML = '<li class="loading">Loading ratings…</li>';
  try {
    if (!lbCache[perf]) {
      const res = await fetch(`https://lichess.org/api/player/top/10/${perf}`, {
        headers: { Accept: "application/vnd.lichess.v3+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      lbCache[perf] = (await res.json()).users || [];
    }
    const users = lbCache[perf];
    ol.innerHTML = users
      .map(
        (u, i) => `
        <li>
          <span class="lb-rank ${i < 3 ? "top" : ""}">${i + 1}</span>
          <span class="lb-name">
            ${u.title ? `<span class="lb-title">${esc(u.title)}</span>` : ""}
            <a href="https://lichess.org/@/${esc(u.username)}" target="_blank" rel="noopener">${esc(u.username)}</a>
          </span>
          <span class="lb-rating">${u.perfs?.[perf]?.rating ?? "—"}</span>
        </li>`
      )
      .join("");
  } catch (err) {
    ol.innerHTML = `<li class="empty">Ratings unavailable (${esc(err.message)})</li>`;
  }
}

document.getElementById("perf-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll("#perf-tabs .tab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  loadLeaderboard(tab.dataset.perf);
});

document.getElementById("search-box").addEventListener("input", (e) => {
  state.query = e.target.value;
  renderNews();
});

loadNews();
loadLeaderboard("classical");
