/* Sleeper league history — browser app. Talks to the public Sleeper API directly. */
(function () {
  "use strict";

  const API = "https://api.sleeper.app/v1";
  const AVATAR_CDN = "https://sleepercdn.com/avatars/thumbs/";
  const CACHE_PREFIX = "sleeper-history:v1:";
  const MAX_SEASONS = 30; // safety valve for the previous_league_id chain
  const CONCURRENCY = 6;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // ---------- API ----------

  async function getJson(path) {
    const res = await fetch(API + path, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Sleeper API error ${res.status} for ${path}`);
    return res.json();
  }

  /** Run tasks with limited concurrency, preserving order of results. */
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  // ---------- Cache (completed seasons only) ----------

  function cacheGet(leagueId) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + leagueId);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function cacheSet(leagueId, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(value));
    } catch (_) {
      /* quota or private mode: ignore */
    }
  }

  // ---------- Loading ----------

  async function loadLeagueChain(leagueId, onProgress) {
    const leagues = [];
    let id = leagueId;
    const seen = new Set();
    while (id && !seen.has(id) && leagues.length < MAX_SEASONS) {
      seen.add(id);
      onProgress(`Looking up league ${leagues.length + 1}…`);
      const league = await getJson(`/league/${id}`);
      if (!league) {
        if (leagues.length === 0) throw new Error(`No league found with ID "${id}".`);
        break; // a dead previous_league_id; stop the chain gracefully
      }
      leagues.push(league);
      id = league.previous_league_id;
    }
    return leagues; // newest first
  }

  async function loadSeason(league, nflState, onProgress) {
    const cached = cacheGet(league.league_id);
    if (cached && cached.complete) return cached;

    const weeks = Standings.regularSeasonWeeks(league, nflState);
    const [rosters, users, ...weekly] = await Promise.all([
      getJson(`/league/${league.league_id}/rosters`),
      getJson(`/league/${league.league_id}/users`),
      ...weeks.map((w) => getJson(`/league/${league.league_id}/matchups/${w}`)),
    ]);
    onProgress(`Loaded ${league.season}`);

    const matchupsByWeek = {};
    weeks.forEach((w, i) => (matchupsByWeek[w] = weekly[i] || []));

    let champion = null;
    const seasonIsOver = league.status === "complete";
    if (seasonIsOver) {
      try {
        const bracket = await getJson(`/league/${league.league_id}/winners_bracket`);
        const final = (bracket || []).find((m) => m.p === 1);
        if (final && final.w != null) champion = final.w;
      } catch (_) {
        /* bracket is a nice-to-have */
      }
    }

    const { teams, weeksPlayed } = Standings.computeSeason({ rosters: rosters || [], users: users || [], matchupsByWeek });
    const season = {
      leagueId: league.league_id,
      season: String(league.season),
      name: league.name,
      status: league.status,
      medianEnabled: Number(league.settings && league.settings.league_average_match) === 1,
      playoffWeekStart: Number(league.settings && league.settings.playoff_week_start) || null,
      weeksPlayed,
      champion,
      teams,
      complete: seasonIsOver,
    };
    if (season.complete) cacheSet(league.league_id, season);
    return season;
  }

  async function loadHistory(leagueId, onProgress) {
    const [nflState, leagues] = await Promise.all([
      getJson("/state/nfl").catch(() => null),
      loadLeagueChain(leagueId, onProgress),
    ]);
    const seasons = await mapLimit(leagues, CONCURRENCY, (lg) => loadSeason(lg, nflState, onProgress));
    return { current: leagues[0], seasons };
  }

  // ---------- Rendering ----------

  const state = { medianOn: {} }; // per-season toggle state, keyed by season leagueId

  function avatarNode(team) {
    const src = team.teamAvatarUrl || (team.avatar ? AVATAR_CDN + team.avatar : null);
    if (src) return el("img", { class: "avatar", src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    return el("span", { class: "avatar avatar--blank", "aria-hidden": "true", text: (team.teamName || "?").slice(0, 1).toUpperCase() });
  }

  function fmtPts(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderSeasonTable(season, medianOn) {
    const ranked = Standings.rank(season.teams, medianOn ? "combined" : "h2h");
    const head = el("tr", null, [
      el("th", { class: "col-rank", scope: "col", text: "#" }),
      el("th", { class: "col-team", scope: "col", text: "Team" }),
      el("th", { class: "col-num", scope: "col", text: "Record" }),
      medianOn ? el("th", { class: "col-num", scope: "col", text: "vs Median" }) : null,
      medianOn ? el("th", { class: "col-num col-strong", scope: "col", text: "Overall" }) : null,
      el("th", { class: "col-num", scope: "col", text: "PF" }),
      el("th", { class: "col-num", scope: "col", text: "PA" }),
    ]);

    const rows = ranked.map((t) => {
      const isChamp = season.champion != null && t.rosterId === season.champion;
      return el("tr", { class: isChamp ? "is-champion" : null }, [
        el("td", { class: "col-rank", "data-label": "Rank", text: String(t.rank) }),
        el("td", { class: "col-team" }, [
          el("div", { class: "team" }, [
            avatarNode(t),
            el("div", { class: "team__names" }, [
              el("div", { class: "team__name" }, [t.teamName, isChamp ? el("span", { class: "badge", title: "League champion", text: "🏆" }) : null]),
              el("div", { class: "team__owner", text: t.ownerName }),
            ]),
          ]),
        ]),
        el("td", { class: "col-num", "data-label": "Record", text: Standings.formatRecord(t.h2h) }),
        medianOn ? el("td", { class: "col-num", "data-label": "vs Median", text: Standings.formatRecord(t.median) }) : null,
        medianOn ? el("td", { class: "col-num col-strong", "data-label": "Overall", text: Standings.formatRecord(t.combined) }) : null,
        el("td", { class: "col-num", "data-label": "PF", text: fmtPts(t.pointsFor) }),
        el("td", { class: "col-num", "data-label": "PA", text: fmtPts(t.pointsAgainst) }),
      ]);
    });

    return el("div", { class: "table-wrap" }, [
      el("table", { class: "standings" + (medianOn ? " standings--median" : "") }, [el("thead", null, head), el("tbody", null, rows)]),
    ]);
  }

  function renderSeason(season) {
    const id = `season-${season.season}`;
    const medianOn = state.medianOn[season.leagueId] ?? season.medianEnabled;

    const section = el("section", { class: "season", id });
    const played = season.weeksPlayed.length;
    const subtitleParts = [];
    if (played === 0) subtitleParts.push("No games played yet");
    else subtitleParts.push(`Regular season · ${played} week${played === 1 ? "" : "s"}`);
    if (season.status === "in_season") subtitleParts.push("In progress");
    subtitleParts.push(season.medianEnabled ? "League median was on in Sleeper" : "League median was off in Sleeper");

    const toggleId = `median-${season.leagueId}`;
    const toggle = el("label", { class: "toggle", for: toggleId }, [
      el("input", {
        type: "checkbox",
        id: toggleId,
        checked: medianOn,
        onchange: (e) => {
          state.medianOn[season.leagueId] = e.target.checked;
          const fresh = renderSeason(season);
          section.replaceWith(fresh);
        },
      }),
      el("span", { class: "toggle__track", "aria-hidden": "true" }),
      el("span", { class: "toggle__label", text: "Games vs. median" }),
    ]);

    section.append(
      el("header", { class: "season__header" }, [
        el("div", null, [
          el("h2", { class: "season__title", text: season.season }),
          el("p", { class: "season__subtitle", text: subtitleParts.join(" · ") }),
        ]),
        toggle,
      ]),
      played === 0 ? el("p", { class: "empty", text: "Standings will appear once the first week is scored." }) : renderSeasonTable(season, medianOn)
    );
    return section;
  }

  function renderLeague(history) {
    const root = $("#results");
    root.replaceChildren();

    const league = history.current;
    const seasons = history.seasons.slice().sort((a, b) => Number(b.season) - Number(a.season));

    const leagueAvatar = league.avatar ? el("img", { class: "league__avatar", src: AVATAR_CDN + league.avatar, alt: "" }) : null;
    const firstYear = seasons[seasons.length - 1].season;
    const lastYear = seasons[0].season;
    root.append(
      el("div", { class: "league" }, [
        leagueAvatar,
        el("div", null, [
          el("h1", { class: "league__name", text: league.name }),
          el("p", { class: "league__meta", text: `${seasons.length} season${seasons.length === 1 ? "" : "s"} · ${firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`} · ${league.total_rosters} teams` }),
        ]),
      ])
    );

    if (seasons.length > 1) {
      root.append(
        el("nav", { class: "years", "aria-label": "Seasons" }, seasons.map((s) => el("a", { class: "years__link", href: `#season-${s.season}`, text: s.season })))
      );
    }

    for (const s of seasons) root.append(renderSeason(s));
  }

  // ---------- Wiring ----------

  function setStatus(msg, kind) {
    const node = $("#status");
    node.textContent = msg || "";
    node.className = "status" + (kind ? ` status--${kind}` : "");
    node.hidden = !msg;
  }

  let loading = false;
  async function go(leagueId, { pushUrl = true } = {}) {
    leagueId = String(leagueId || "").trim();
    if (!leagueId || loading) return;
    if (!/^\d+$/.test(leagueId)) {
      setStatus("A Sleeper league ID is a long number, e.g. 1124831356770168832. Find it in the league URL on sleeper.com.", "error");
      return;
    }
    loading = true;
    $("#go").disabled = true;
    $("#results").replaceChildren();
    setStatus("Loading…", "loading");
    if (pushUrl) {
      const url = new URL(location.href);
      url.searchParams.set("league", leagueId);
      history.pushState({ leagueId }, "", url);
    }
    try {
      const data = await loadHistory(leagueId, (m) => setStatus(m, "loading"));
      setStatus("");
      renderLeague(data);
      document.title = `${data.current.name} · League History`;
      try {
        localStorage.setItem(CACHE_PREFIX + "last", leagueId);
      } catch (_) {}
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Something went wrong talking to Sleeper.", "error");
    } finally {
      loading = false;
      $("#go").disabled = false;
    }
  }

  function init() {
    const form = $("#league-form");
    const input = $("#league-id");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      go(input.value);
    });

    const fromUrl = new URLSearchParams(location.search).get("league");
    let last = null;
    try {
      last = localStorage.getItem(CACHE_PREFIX + "last");
    } catch (_) {}
    const initial = fromUrl || last;
    if (initial) {
      input.value = initial;
      go(initial, { pushUrl: false });
    }

    window.addEventListener("popstate", () => {
      const id = new URLSearchParams(location.search).get("league");
      if (id) {
        input.value = id;
        go(id, { pushUrl: false });
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
