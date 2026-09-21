// Zoom/pan: wheel + pinch zoom toward the cursor/touch midpoint, single-
// pointer drag to pan, double-click/double-tap to reset. Pure viewBox
// manipulation via the Pointer Events API — no dependencies.
//
// Click-to-toggle: a pointerdown->pointerup with little to no movement is a
// tap (toggles the region); one that moved past TAP_MOVE_THRESHOLD is a pan
// and does not toggle anything.
//
// Subdivision drill-down: clicking a country with subdivisions (currently
// just Italy) zooms in on it in place — same <svg>, same coordinate space,
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

  // Dispatcher for both the pointer-tap and keyboard activation paths: a
  // country with subdivisions always drills in instead of toggling;
  // everything else (including regions inside an open drill-down) toggles
  // normally.
  function handleRegionActivate(el) {
    const code = el.dataset.region;
    if (code && SUBDIVISIONS[code] && !drilldownCountry) {
      enterDrilldown(code);
    } else {
      toggleRegion(el);
    }
  }

  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest(".region");
    if (!el) return;
    e.preventDefault();
    handleRegionActivate(el);
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
  let tap = null; // { el, startX, startY } — candidate region tap, single pointer only

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
      tap = regionEl ? { el: regionEl, startX: e.clientX, startY: e.clientY } : null;
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
      handleRegionActivate(tap.el);
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
