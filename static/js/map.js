// Zoom/pan: wheel + pinch zoom toward the cursor/touch midpoint, single-
// pointer drag to pan, double-click/double-tap to reset. Pure viewBox
// manipulation via the Pointer Events API — no dependencies.
//
// Click-to-open: a pointerdown->pointerup with little to no movement is a
// tap, which opens the region info panel (SP-18.2); scratching happens from
// the panel's button. One that moved past TAP_MOVE_THRESHOLD is a pan and
// opens nothing. A tap on empty map closes the panel.
//
// Subdivision drill-down: the panel's "Explore regions" button on a country
// with subdivisions zooms in on it in place — same <svg>, same coordinate space,
// neighbors stay visible — rather than swapping to a separate view.
// Clicking the "Return to world view" button zooms back out to wherever
// the view was before drilling in, instead of resetting to the whole
// world. A country's
// subdivision geometry is fetched from the server on first drill-down (not
// shipped in the initial page) and the resulting <g> stays in the DOM as
// its own cache, so re-entering the same country later doesn't re-fetch
// (SP-13.3).
(() => {
  const svg = document.querySelector(".world-map");
  if (!svg) return;

  const STORAGE_KEY = "scratchpass:visited:v1";
  const TAP_MOVE_THRESHOLD = 6; // px, in screen space

  function loadVisited() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveVisited(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Server sync (SP-10/SP-11): the map only ever renders for an
  // authenticated user (SP-9.1's @login_required), so on load we hydrate
  // from the server rather than trusting whatever's in localStorage, and
  // every toggle both updates the UI optimistically *and* persists to the
  // server. localStorage stays in sync throughout, acting as an offline
  // cache/fallback if a request fails, not the source of truth.

  let visited = loadVisited();

  // Countries with a drill-down map. bbox is that country's real lon/lat
  // extent, padded a couple degrees for neighbor context, used to zoom in
  // on click. A country listed here is never manually toggled — its
  // visited state is *derived* (see isCountryVisitedViaSubdivisions): any
  // one of its regions being visited marks the whole country visited.
  const SUBDIVISIONS = {
    IT: { bbox: { lonMin: 4.6, lonMax: 20.52, latMin: 33.49, latMax: 49.09 } },
    DE: { bbox: { lonMin: 5.0, lonMax: 16.0, latMin: 46.5, latMax: 56.0 } },
    MX: { bbox: { lonMin: -119.5, lonMax: -85.5, latMin: 13.5, latMax: 33.5 } },
    // Includes the Canary Islands (~13-18°W) — still a meaningful zoom-in
    // (22° of longitude vs. the map's full 360°), unlike Russia's ~170°
    // extent, so no need to crop them out of the frame.
    ES: { bbox: { lonMin: -19.5, lonMax: 5.5, latMin: 26.5, latMax: 44.5 } },
    // Deliberately excludes Rockall (~13.7°W, a single uninhabited islet
    // folded into Scotland's polygon) — it'd be off-screen while drilled
    // in, but Scotland is one clickable path either way, so nothing
    // becomes unreachable the way a whole federal-subject would for Russia.
    GB: { bbox: { lonMin: -9.5, lonMax: 2.5, latMin: 49.5, latMax: 61.0 } },
    // Full real extent (mainland + Alaska + Hawaii), same principle as the
    // Russia decision: Alaska and Hawaii are each their own clickable
    // state, so a tighter bbox would make them genuinely unreachable while
    // drilled in, not just off-screen scenery like GB's Rockall. Still a
    // real zoom (~111° of longitude vs. the map's 360°).
    US: { bbox: { lonMin: -180, lonMax: -64, latMin: 17, latMax: 72 } },
    AU: { bbox: { lonMin: 111.5, lonMax: 155, latMin: -45, latMax: -8.5 } },
    BR: { bbox: { lonMin: -76, lonMax: -32.5, latMin: -35.5, latMax: 7 } },
    // Nunavut/Yukon reach up to ~83°N — full real extent, same reachability
    // principle as US/Russia (each territory is its own clickable path).
    CA: { bbox: { lonMin: -143, lonMax: -50.5, latMin: 40, latMax: 84.5 } },
    CN: { bbox: { lonMin: 71.5, lonMax: 136.5, latMin: 16.5, latMax: 55 } },
    // Metropolitan France only — the 5 overseas departments (Guadeloupe,
    // Martinique, French Guiana, Réunion, Mayotte) are independent
    // top-level countries instead (GP/MQ/GF/RE/YT), not FR: subdivisions,
    // so this bbox doesn't need to reach them.
    FR: { bbox: { lonMin: -6.5, lonMax: 10.5, latMin: 40.5, latMax: 52 } },
    JP: { bbox: { lonMin: 122, lonMax: 155, latMin: 23, latMax: 46.5 } },
    IN: { bbox: { lonMin: 67, lonMax: 98.5, latMin: 5.5, latMax: 36.5 } },
    // Full real extent, Kaliningrad to the antimeridian (~163° of
    // longitude), so every federal subject stays reachable: a subtle zoom,
    // an accepted tradeoff. Chukotka's sliver east of 180° lands at the
    // map's far-left edge, out of frame, but it's the same path as the rest
    // of Chukotka, so nothing becomes unreachable.
    RU: { bbox: { lonMin: 17, lonMax: 180, latMin: 39.5, latMax: 83 } },
  };
  let drilldownCountry = null; // e.g. "IT" while its regions are shown
  let preDrilldownView = null; // view rect saved the moment drill-down started
  const loadingSubdivisions = new Set(); // codes with a fetch in flight

  // `.hidden = true/false` doesn't reliably reflect to the `hidden`
  // content attribute on SVGElement in this environment (it does on plain
  // HTML elements) — set the attribute directly so `[hidden]` CSS rules
  // actually take effect.
  function setHidden(el, isHidden) {
    if (isHidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function isCountryVisitedViaSubdivisions(code) {
    if (!SUBDIVISIONS[code]) return null;
    const prefix = `${code}:`;
    return visited.some((id) => id.startsWith(prefix));
  }

  // Dims every region outside the active drill-down (everything but the
  // country being explored) and makes them inert — `.dimmed`'s CSS sets
  // pointer-events: none, and dropping tabindex removes them from the tab
  // order too, so a keyboard user can't reach an unclickable region either.
  function setDimmed(isDimmed) {
    document.querySelectorAll(".region").forEach((el) => {
      if (el.closest(".subdivision-group")) return;
      el.classList.toggle("dimmed", isDimmed);
      el.setAttribute("tabindex", isDimmed ? "-1" : "0");
    });
  }

  // `.region` elements don't change at runtime, so the top-level (country)
  // code list only needs computing once, not on every count update.
  const topLevelCodes = [...document.querySelectorAll(".region")]
    .map((el) => el.dataset.region)
    .filter((code) => code && !code.includes(":"));

  function isEffectivelyVisited(code) {
    const derived = isCountryVisitedViaSubdivisions(code);
    return derived !== null ? derived : visited.includes(code);
  }

  // Top bar's visited count (SP-9.1) — only rendered when logged in;
  // guarded since it's absent on the map page when logged out. Counts
  // top-level countries normally (using the same derived-or-literal check
  // as the map's fill, so a country visited only via its subdivisions
  // still counts), or just the drilled-in country's regions while zoomed
  // into it.
  const visitedCountEl = document.querySelector("[data-visited-count]");
  const drilldownHintEl = document.querySelector("[data-drilldown-hint]");

  const panelEl = document.querySelector("[data-region-panel]");
  const panelTitleEl = panelEl && panelEl.querySelector("[data-region-panel-title]");
  const panelExtractEl = panelEl && panelEl.querySelector("[data-region-panel-extract]");
  const panelSourceEl = panelEl && panelEl.querySelector("[data-region-panel-source]");
  const panelLinkEl = panelEl && panelEl.querySelector("[data-region-panel-link]");
  const panelActionEl = panelEl && panelEl.querySelector("[data-region-panel-action]");
  const panelCloseEl = panelEl && panelEl.querySelector("[data-region-panel-close]");
  let panelRegionEl = null; // the region the open panel describes

  function updateVisitedCount() {
    if (!visitedCountEl) return;
    let n, singular, plural;
    if (drilldownCountry) {
      const prefix = `${drilldownCountry}:`;
      n = visited.filter((id) => id.startsWith(prefix)).length;
      singular = "region";
      plural = "regions";
    } else {
      n = topLevelCodes.filter(isEffectivelyVisited).length;
      singular = "country";
      plural = "countries"; // irregular plural — not just singular + "s"
    }
    visitedCountEl.textContent = `${n} ${n === 1 ? singular : plural} visited`;
  }

  function applyVisited() {
    document.querySelectorAll(".region").forEach((el) => {
      const isVisited = isEffectivelyVisited(el.dataset.region);
      el.classList.toggle("visited", isVisited);
      el.setAttribute("aria-pressed", String(isVisited));
    });
    updateVisitedCount();
    // Server resync or rollback can change visited state under an open
    // panel, so its button follows every apply, not just its own clicks.
    renderPanelAction();
  }

  function setVisited(ids) {
    visited = Array.isArray(ids) ? ids : visited;
    saveVisited(visited);
    applyVisited();
  }

  function toggleRegion(el) {
    const id = el.dataset.region;
    if (!id) return;

    const wasVisited = visited.includes(id);
    // Optimistic: reflect the change immediately, don't wait on the network.
    setVisited(wasVisited ? visited.filter((x) => x !== id) : [...visited, id]);

    fetch("/api/me/visits/toggle/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify({ region: id }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setVisited(data.visited))
      .catch(() => {
        // Server didn't confirm it (offline, error) — roll back so the UI
        // doesn't drift from what's actually persisted.
        setVisited(wasVisited ? [...visited, id] : visited.filter((x) => x !== id));
      });
  }

  applyVisited();

  fetch("/api/me/visits/", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((data) => setVisited(data.visited))
    .catch(() => {
      // Offline or the request failed — keep whatever localStorage had.
    });

  const FULL = { x: 0, y: 0, width: 1000, height: 500 };
  // ~40x max zoom-in — needed so the smallest countries (e.g. Luxembourg,
  // Trinidad & Tobago) can reach a tappable size (~24px+) on mobile
  // viewports; 16x left them at ~9px, well under the touch-target minimum.
  const MIN_WIDTH = FULL.width / 40;
  const MAX_WIDTH = FULL.width; // can't zoom out past the initial fit
  const view = { ...FULL };

  function setViewBox() {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  }

  function clamp() {
    view.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, view.width));
    view.height = view.width * (FULL.height / FULL.width);
    view.x = Math.min(FULL.width - view.width, Math.max(0, view.x));
    view.y = Math.min(FULL.height - view.height, Math.max(0, view.y));
  }

  function clientToSvgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((clientY - rect.top) / rect.height) * view.height,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const before = clientToSvgPoint(clientX, clientY);
    view.width *= factor;
    view.height *= factor;
    clamp();
    const after = clientToSvgPoint(clientX, clientY);
    view.x += before.x - after.x;
    view.y += before.y - after.y;
    clamp();
    setViewBox();
  }

  function resetView() {
    Object.assign(view, FULL);
    setViewBox();
  }

  function lonLatToWorld(lon, lat) {
    return {
      x: (lon + 180) * (FULL.width / 360),
      y: (90 - lat) * (FULL.height / 180),
    };
  }

  function zoomToLonLatBox({ lonMin, lonMax, latMin, latMax }) {
    const topLeft = lonLatToWorld(lonMin, latMax);
    const bottomRight = lonLatToWorld(lonMax, latMin);
    const boxWidth = bottomRight.x - topLeft.x;
    const boxHeight = bottomRight.y - topLeft.y;
    // clamp() forces height = width * 0.5 to preserve the map's fixed 2:1
    // aspect ratio — pick whichever dimension needs more width so neither
    // axis of the target box gets cropped.
    const widthNeededForHeight = boxHeight * (FULL.width / FULL.height);
    view.width = Math.max(boxWidth, widthNeededForHeight);
    view.height = view.width * (FULL.height / FULL.width);
    view.x = topLeft.x + boxWidth / 2 - view.width / 2;
    view.y = topLeft.y + boxHeight / 2 - view.height / 2;
    clamp();
    setViewBox();
  }

  async function enterDrilldown(code) {
    closePanel();
    const sub = SUBDIVISIONS[code];
    const countryEl = document.querySelector(`.region[data-region="${code}"]`);
    if (!sub || !countryEl || drilldownCountry || loadingSubdivisions.has(code)) return;

    let group = document.querySelector(`.subdivision-group[data-country="${code}"]`);
    if (!group) {
      loadingSubdivisions.add(code);
      let markup;
      try {
        const res = await fetch(`/api/subdivisions/${code}/`);
        if (!res.ok) throw new Error(res.status);
        markup = await res.text();
      } catch {
        loadingSubdivisions.delete(code);
        return; // couldn't load — stay on the world view, no partial state
      }
      loadingSubdivisions.delete(code);
      group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "subdivision-group");
      group.setAttribute("data-country", code);
      group.setAttribute("hidden", "");
      group.innerHTML = markup;
      svg.appendChild(group);
      applyVisited(); // newly-added paths need their visited/aria-pressed state set
    }

    preDrilldownView = { ...view };
    setHidden(countryEl, true);
    setHidden(group, false);
    drilldownCountry = code;
    setDimmed(true);
    if (drilldownHintEl) setHidden(drilldownHintEl, false);
    zoomToLonLatBox(sub.bbox);
    updateVisitedCount();
  }

  function exitDrilldown() {
    if (!drilldownCountry) return;
    closePanel();
    const countryEl = document.querySelector(`.region[data-region="${drilldownCountry}"]`);
    const group = document.querySelector(`.subdivision-group[data-country="${drilldownCountry}"]`);
    if (group) setHidden(group, true);
    if (countryEl) setHidden(countryEl, false);
    drilldownCountry = null;
    setDimmed(false);
    if (drilldownHintEl) setHidden(drilldownHintEl, true);
    if (preDrilldownView) {
      Object.assign(view, preDrilldownView);
      setViewBox();
    }
    updateVisitedCount();
  }

  // --- Region info panel (SP-18.2) ---

  // Per-country description files, fetched once per page load. A failed or
  // missing file resolves to {} so the panel just shows the name.
  const descriptionCache = new Map();

  function loadDescriptions(country) {
    if (!descriptionCache.has(country)) {
      const base = panelEl.dataset.descriptionsUrl;
      descriptionCache.set(
        country,
        fetch(`${base}${country}.json`)
          .then((res) => (res.ok ? res.json() : {}))
          .catch(() => ({})),
      );
    }
    return descriptionCache.get(country);
  }

  // A country with a drill-down map is never scratched directly (its
  // state is derived from its regions), so the world view offers to
  // explore it instead.
  function panelOffersExplore(code) {
    return Boolean(SUBDIVISIONS[code]) && !drilldownCountry;
  }

  function renderPanelAction() {
    if (!panelRegionEl || !panelActionEl) return;
    const code = panelRegionEl.dataset.region;
    if (panelOffersExplore(code)) {
      panelActionEl.textContent = "Explore regions";
      panelActionEl.removeAttribute("aria-pressed");
      panelActionEl.classList.remove("is-visited");
    } else {
      const isVisited = visited.includes(code);
      panelActionEl.textContent = isVisited ? "Un-scratch" : "Scratch it";
      panelActionEl.setAttribute("aria-pressed", String(isVisited));
      panelActionEl.classList.toggle("is-visited", isVisited);
    }
  }

  function renderPanelDescription(entry) {
    const hasEntry = Boolean(entry && entry.extract);
    panelExtractEl.textContent = hasEntry ? entry.extract : "";
    setHidden(panelExtractEl, !hasEntry);
    setHidden(panelSourceEl, !(hasEntry && entry.source_url));
    if (hasEntry && entry.source_url) panelLinkEl.href = entry.source_url;
  }

  function openPanel(el, { moveFocus = false } = {}) {
    if (!panelEl) return;
    const code = el.dataset.region;
    panelRegionEl = el;
    panelTitleEl.textContent = el.getAttribute("aria-label") || code;
    renderPanelDescription(null);
    renderPanelAction();
    const wasHidden = panelEl.hasAttribute("hidden");
    setHidden(panelEl, false);
    document.body.classList.add("region-panel-open");
    // Restart the slide-in only on a fresh open, not when swapping regions.
    if (wasHidden) {
      panelEl.classList.remove("is-entering");
      void panelEl.offsetWidth;
      panelEl.classList.add("is-entering");
    }
    if (moveFocus) panelActionEl.focus();

    loadDescriptions(code.split(":")[0]).then((data) => {
      // The user may have moved on to another region while this loaded.
      if (panelRegionEl === el) renderPanelDescription(data[code]);
    });
  }

  function closePanel() {
    if (!panelEl || !panelRegionEl) return;
    const regionEl = panelRegionEl;
    const hadFocus = panelEl.contains(document.activeElement);
    panelRegionEl = null;
    setHidden(panelEl, true);
    document.body.classList.remove("region-panel-open");
    if (hadFocus && !regionEl.hasAttribute("hidden")) regionEl.focus();
  }

  function handlePanelAction() {
    if (!panelRegionEl) return;
    const code = panelRegionEl.dataset.region;
    if (panelOffersExplore(code)) {
      // The country path gets hidden while drilled in, so keyboard focus
      // can't return to it; hand it to the first region instead.
      const hadFocus = panelEl.contains(document.activeElement);
      enterDrilldown(code).then(() => {
        if (!hadFocus || drilldownCountry !== code) return;
        const first = svg.querySelector(`.subdivision-group[data-country="${code}"] .region`);
        if (first) first.focus();
      });
    } else {
      toggleRegion(panelRegionEl);
    }
  }

  if (panelEl) {
    panelActionEl.addEventListener("click", handlePanelAction);
    panelCloseEl.addEventListener("click", closePanel);
    // On narrow screens the bottom sheet would cover the lower half of the
    // letterboxed map (often the region just tapped). The CSS reserves
    // this height below the map so it re-centres above the sheet; tracked
    // live because the extract loads after the sheet opens.
    new ResizeObserver(() => {
      document.body.style.setProperty("--region-panel-height", `${panelEl.offsetHeight}px`);
    }).observe(panelEl);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelRegionEl) closePanel();
  });

  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest(".region");
    if (!el) return;
    e.preventDefault();
    openPanel(el, { moveFocus: true });
  });

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (drilldownCountry) return; // locked — the "Return to world view" button is the only way back
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false },
  );

  const pointers = new Map();
  let dragLast = null;
  let pinchLastDist = null;
  let tap = null; // { el, startX, startY } — candidate tap (el null = empty map), single pointer only

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchLastDist = dist(a, b);
      dragLast = null;
      tap = null;
    } else if (pointers.size === 1) {
      dragLast = { x: e.clientX, y: e.clientY };
      const regionEl = e.target.closest(".region");
      tap = { el: regionEl, startX: e.clientX, startY: e.clientY };
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      tap = null;
      const [a, b] = [...pointers.values()];
      const newDist = dist(a, b);
      const mid = midpoint(a, b);
      if (pinchLastDist && !drilldownCountry) zoomAt(mid.x, mid.y, pinchLastDist / newDist);
      pinchLastDist = newDist;
      return;
    }

    if (pointers.size === 1 && dragLast) {
      if (tap && dist({ x: e.clientX, y: e.clientY }, { x: tap.startX, y: tap.startY }) > TAP_MOVE_THRESHOLD) {
        tap = null; // moved past the tap threshold — this is a pan now
      }
      if (!drilldownCountry) {
        // Locked while drilled in — the "Return to world view" button is the only way back.
        const rect = svg.getBoundingClientRect();
        view.x -= ((e.clientX - dragLast.x) / rect.width) * view.width;
        view.y -= ((e.clientY - dragLast.y) / rect.height) * view.height;
        clamp();
        setViewBox();
      }
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  function resetPointerState() {
    pinchLastDist = pointers.size < 2 ? null : pinchLastDist;
    dragLast = pointers.size === 1 ? [...pointers.values()][0] : null;
  }

  svg.addEventListener("pointerup", (e) => {
    if (pointers.size === 1 && tap) {
      if (tap.el) openPanel(tap.el);
      else closePanel();
    }
    pointers.delete(e.pointerId);
    tap = null;
    resetPointerState();
  });

  svg.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    tap = null;
    resetPointerState();
  });

  svg.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (drilldownCountry) return; // exit is via the "Return to world view" button now
    resetView();
  });

  if (drilldownHintEl) drilldownHintEl.addEventListener("click", exitDrilldown);

  setViewBox();
})();
