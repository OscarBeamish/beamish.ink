"use strict";
(() => {
  // templates/_shared/scroll-driver.ts
  var ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function mountScrollDriver(options = {}) {
    const params = new URLSearchParams(location.search);
    let span = Number(params.get("span")) || options.span || 14;
    const driver = {
      renderAtTime(t) {
        const reach = Math.max(document.body.scrollHeight - innerHeight, 0);
        const k = Math.min(Math.max(t / span, 0), 1);
        const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2);
        scrollTo(0, reach * there);
        options.onFrame?.(t);
      },
      start() {
      },
      stop() {
      },
      update(next) {
        if (next && typeof next.span === "number") span = next.span;
      },
      destroy() {
        options.onDestroy?.();
      }
    };
    window.__beamish = driver;
    if (!params.has("record")) scrollTo(0, 0);
    return driver;
  }

  // templates/bedside/entry.ts
  mountScrollDriver();
})();
