// Zoom/pan: wheel + pinch zoom toward the cursor/touch midpoint, single-
// pointer drag to pan, double-click/double-tap to reset. Pure viewBox
// manipulation via the Pointer Events API — no dependencies.
//
// Note for SP-5 (click-to-toggle): a pointerdown->pointerup with little to
// no movement is a tap; one that moved is a pan. Check drag distance before
// treating a pointerup as a region toggle, so panning doesn't also toggle
// whatever region you started the drag on.
(() => {
  const svg = document.querySelector(".world-map");
  if (!svg) return;

  const FULL = { x: 0, y: 0, width: 1000, height: 500 };
  const MIN_WIDTH = FULL.width / 16; // ~16x max zoom-in
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

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchLastDist = dist(a, b);
      dragLast = null;
    } else if (pointers.size === 1) {
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const newDist = dist(a, b);
      const mid = midpoint(a, b);
      if (pinchLastDist) zoomAt(mid.x, mid.y, pinchLastDist / newDist);
      pinchLastDist = newDist;
      return;
    }

    if (pointers.size === 1 && dragLast) {
      const rect = svg.getBoundingClientRect();
      view.x -= ((e.clientX - dragLast.x) / rect.width) * view.width;
      view.y -= ((e.clientY - dragLast.y) / rect.height) * view.height;
      clamp();
      setViewBox();
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    pinchLastDist = pointers.size < 2 ? null : pinchLastDist;
    dragLast = pointers.size === 1 ? [...pointers.values()][0] : null;
  }

  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetView();
  });

  setViewBox();
})();
