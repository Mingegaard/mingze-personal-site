// Keep navigation atomic: change the page only while the character field covers it.
export function createTransitionPlayer({ render, setActive, now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, duration = 760 }) {
  let frame = 0;
  let start = 0;
  let progress = 0;
  let pending = null;
  let active = false;
  let disposed = false;

  function commit() {
    const action = pending;
    pending = null;
    action?.();
  }

  function finish() {
    cancelFrame(frame);
    frame = 0;
    render(1);
    active = false;
    setActive(false);
  }

  function tick(time) {
    progress = Math.min(1, (time - start) / duration);
    if (progress >= .5 && pending) {
      // Also cover a late frame before committing after a background-tab pause.
      render(.5);
      commit();
    }
    render(progress);
    if (progress < 1) frame = requestFrame(tick);
    else finish();
  }

  return {
    play(action, immediate = false) {
      if (disposed) return;
      pending = action;
      if (immediate) {
        commit();
        finish();
        return;
      }
      if (!active) {
        active = true;
        progress = 0;
        start = now();
        setActive(true);
        render(0);
        frame = requestFrame(tick);
      } else if (progress > .5) {
        // Reverse the same field smoothly if a second tab is chosen during reveal.
        progress = 1 - progress;
        start = now() - progress * duration;
      }
    },
    settle() {
      if (!active || disposed) return;
      commit();
      finish();
    },
    redraw() { if (active) render(progress); },
    destroy() {
      disposed = true;
      cancelFrame(frame);
      pending = null;
    },
  };
}
