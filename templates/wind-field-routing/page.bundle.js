"use strict";
(() => {
  // templates/_shared/scroll-driver.ts
  var ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  var REACH_CAP = 1.5;
  function mountScrollDriver(options = {}) {
    const params = new URLSearchParams(location.search);
    let span = Number(params.get("span")) || options.span || 12;
    const screens = options.screens ?? REACH_CAP;
    const driver = {
      renderAtTime(t) {
        const page = Math.max(document.body.scrollHeight - innerHeight, 0);
        const reach = Math.min(page, innerHeight * screens);
        const k = Math.min(Math.max(t / span, 0), 1);
        const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2);
        scrollTo({ top: reach * there, behavior: "instant" });
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

  // templates/wind-field-routing/entry.ts
  mountScrollDriver();
})();
