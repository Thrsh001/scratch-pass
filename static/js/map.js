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

  // Phase 2 swap point (SP-10/SP-11): once a user is authenticated, region
  // toggles will also need to sync to the server so `visited_regions`
  // persists across devices. Planned shape, per CLAUDE.md's API rules:
  //
  //   toggleRegion() will POST to /api/me/visits/toggle/ with:
  //     - body: { region: id }
  //     - header: X-CSRFToken, read from the `csrftoken` cookie
  //   The response returns the full updated `visited` list (not just a
  //   success flag), which saveVisited() then writes back to localStorage
  //   so localStorage keeps acting as an offline cache of server state.
  //
  // Until SP-9 (auth) lands, there's no session to attach this to, so
  // toggleRegion() below stays localStorage-only — this comment marks
  // where the fetch call gets added, not a TODO to build it now.

  let visited = loadVisited();

  function applyVisited() {
    document.querySelectorAll(".region").forEach((el) => {
      const isVisited = visited.includes(el.dataset.region);
      el.classList.toggle("visited", isVisited);
      el.setAttribute("aria-pressed", String(isVisited));
    });
  }

  function toggleRegion(el) {
    const id = el.dataset.region;
    if (!id) return;
    visited = visited.includes(id)
      ? visited.filter((x) => x !== id)
      : [...visited, id];
    saveVisited(visited);
    el.classList.toggle("visited", visited.includes(id));
    el.setAttribute("aria-pressed", String(visited.includes(id)));
  }

  applyVisited();

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
