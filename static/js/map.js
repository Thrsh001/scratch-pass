// Zoom/pan: wheel + pinch zoom toward the cursor/touch midpoint, single-
// pointer drag to pan, double-click/double-tap to reset. Pure viewBox
// manipulation via the Pointer Events API — no dependencies.
//
// Click-to-toggle: a pointerdown->pointerup with little to no movement is a
// tap (toggles the region); one that moved past TAP_MOVE_THRESHOLD is a pan
// and does not toggle anything.
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

  // Subdivision drill-down (SP-13.2) — country-level ("IT") and
  // subdivision-level ("IT:52") ids are fully independent entries in the
  // same flat `visited` list (no derived/aggregate logic). SUBDIVISIONS
  // maps a top-level code to its drill-down <svg>; only Italy exists so
  // far, but this stays a lookup rather than hardcoding "IT" everywhere
  // so a second country is a one-line addition, not a rewrite.
  const SUBDIVISIONS = {
    IT: { label: "Italy" },
  };
  let activeSubdivision = null; // e.g. "IT" while its region map is shown
  let lastTappedRegion = null;

  const drillDownBtn = document.querySelector("[data-drill-down-btn]");
  const backToWorldBtn = document.querySelector("[data-back-to-world-btn]");

  function subdivisionSvgFor(code) {
    return document.querySelector(`.subdivision-map[data-country="${code}"]`);
  }

  // Top bar's visited count (SP-9.1) — only rendered when logged in;
  // guarded since it's absent on the map page when logged out. Counts
  // top-level countries normally, or just the active country's regions
  // while drilled in (SP-13.2) — an "IT:52" entry shouldn't inflate the
  // world country count, and vice versa.
  const visitedCountEl = document.querySelector("[data-visited-count]");

  function updateVisitedCount() {
    if (!visitedCountEl) return;
    let n, singular, plural;
    if (activeSubdivision) {
      const prefix = `${activeSubdivision}:`;
      n = visited.filter((id) => id.startsWith(prefix)).length;
      singular = "region";
      plural = "regions";
    } else {
      n = visited.filter((id) => !id.includes(":")).length;
      singular = "country";
      plural = "countries"; // irregular plural — not just singular + "s"
    }
    visitedCountEl.textContent = `${n} ${n === 1 ? singular : plural} visited`;
  }

  // `.hidden = true/false` doesn't reliably reflect to the `hidden`
  // content attribute on SVGElement in this environment (it does on plain
  // HTML elements like the buttons below) — set the attribute directly so
  // the `[hidden] { display: none }` CSS rule actually takes effect.
  function setHidden(el, isHidden) {
    if (isHidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function updateDrillDownAffordance() {
    if (!drillDownBtn) return;
    const code = lastTappedRegion && lastTappedRegion.dataset.region;
    const sub = code && !activeSubdivision ? SUBDIVISIONS[code] : null;
    if (sub) {
      drillDownBtn.textContent = `View ${sub.label}'s regions →`;
      drillDownBtn.dataset.country = code;
      drillDownBtn.hidden = false;
    } else {
      drillDownBtn.hidden = true;
    }
  }

  function enterSubdivision(code) {
    const subSvg = subdivisionSvgFor(code);
    if (!SUBDIVISIONS[code] || !subSvg) return;
    setHidden(svg, true);
    setHidden(subSvg, false);
    activeSubdivision = code;
    if (drillDownBtn) drillDownBtn.hidden = true;
    if (backToWorldBtn) backToWorldBtn.hidden = false;
    updateVisitedCount();
  }

  function exitSubdivision() {
    if (!activeSubdivision) return;
    const subSvg = subdivisionSvgFor(activeSubdivision);
    if (subSvg) setHidden(subSvg, true);
    setHidden(svg, false);
    activeSubdivision = null;
    if (backToWorldBtn) backToWorldBtn.hidden = true;
    updateDrillDownAffordance();
    updateVisitedCount();
  }

  if (drillDownBtn) {
    drillDownBtn.addEventListener("click", () => {
      if (drillDownBtn.dataset.country) enterSubdivision(drillDownBtn.dataset.country);
    });
  }
  if (backToWorldBtn) {
    backToWorldBtn.addEventListener("click", exitSubdivision);
  }

  function applyVisited() {
    document.querySelectorAll(".region").forEach((el) => {
      const isVisited = visited.includes(el.dataset.region);
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
    lastTappedRegion = el;
    updateDrillDownAffordance();

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

  // Subdivision maps don't need the world map's pan/zoom/tap-vs-drag
  // machinery below — they're a fixed, tightly-fitted local viewBox, so a
  // plain click/keydown is enough (SP-13.2).
  document.querySelectorAll(".subdivision-map").forEach((subSvg) => {
    subSvg.addEventListener("click", (e) => {
      const el = e.target.closest(".region");
      if (el) toggleRegion(el);
    });
    subSvg.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target.closest(".region");
      if (!el) return;
      e.preventDefault();
      toggleRegion(el);
    });
  });

  fetch("/api/me/visits/", { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((data) => setVisited(data.visited))
    .catch(() => {
      // Offline or the request failed — keep whatever localStorage had.
    });

  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target.closest(".region");
    if (!el) return;
    e.preventDefault();
    toggleRegion(el);
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

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
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
      if (pinchLastDist) zoomAt(mid.x, mid.y, pinchLastDist / newDist);
      pinchLastDist = newDist;
      return;
    }

    if (pointers.size === 1 && dragLast) {
      if (tap && dist({ x: e.clientX, y: e.clientY }, { x: tap.startX, y: tap.startY }) > TAP_MOVE_THRESHOLD) {
        tap = null; // moved past the tap threshold — this is a pan now
      }
      const rect = svg.getBoundingClientRect();
      view.x -= ((e.clientX - dragLast.x) / rect.width) * view.width;
      view.y -= ((e.clientY - dragLast.y) / rect.height) * view.height;
      clamp();
      setViewBox();
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  function resetPointerState() {
    pinchLastDist = pointers.size < 2 ? null : pinchLastDist;
    dragLast = pointers.size === 1 ? [...pointers.values()][0] : null;
  }

  svg.addEventListener("pointerup", (e) => {
    if (pointers.size === 1 && tap) {
      toggleRegion(tap.el);
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
    resetView();
  });

  setViewBox();
})();
