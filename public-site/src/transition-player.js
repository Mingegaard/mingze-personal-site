// Keep navigation atomic: change the page only while the character field covers it.
export function createTransitionPlayer({ render, setActive, now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, duration = 2000 }) {
  let frame = 0;
  let start = 0;
  let animationStart = 0;
  let elapsed = 0;
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
    render(1, elapsed);
    active = false;
    setActive(false);
  }

  function tick(time) {
    // Glyph motion has its own clock; reversing coverage must not rewind the text.
    elapsed = Math.max(0, time - animationStart);
    progress = Math.min(1, (time - start) / duration);
    if (progress >= .5 && pending) {
      // Also cover a late frame before committing after a background-tab pause.
      render(.5, elapsed);
      commit();
    }
    render(progress, elapsed);
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
        animationStart = start;
        elapsed = 0;
        setActive(true);
        render(0, elapsed);
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
    redraw() { if (active) render(progress, elapsed); },
    destroy() {
      disposed = true;
      cancelFrame(frame);
      pending = null;
    },
  };
}
