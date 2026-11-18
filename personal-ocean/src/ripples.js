// Decorative character waves live behind the UI and never capture input.
const COMPONENTS = [
  'button', 'a', 'input', 'textarea', 'select', 'label', 'form', 'dialog',
  '[contenteditable]:not([contenteditable="false"])', '[role="button"]', '[role="dialog"]',
  '[role="menu"]', '[role="listbox"]', '[role="slider"]', '[role="tab"]',
  '[data-composer-card]', '[data-slot="sidebar"]', '[data-slot="sidebar.right"]',
  '.profile-stats', '.profile-activity', '.profile-heading',
  '[class$="_headline"]', '[data-chat-message]', '[data-message-id]',
  '.personal-project-panel', '.personal-message', '.personal-chat-title', '.personal-chat-history',
  '.guestbook-thread', '.guestbook-composer', '.guestbook-heading', '.guestbook-empty',
].join(',');
const DURATION = 2200;

// Closed popovers remain mounted with role="dialog"; only visible overlays block waves.
function hasVisibleOverlay() {
  return [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], [popover]:popover-open')]
    .some(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
}

export function mountRipples() {
  const canvas = document.createElement('canvas');
  canvas.className = 'personal-ripple-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const context = canvas.getContext('2d');
  if (!context) { canvas.remove(); return () => {}; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let waves = [], frame = 0, width = 0, height = 0, cellWidth = 0, cellHeight = 0;
  function clear() { context.clearRect(0, 0, width, height); }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    waves = [];
    clear();
  }
  function resize() {
    stop();
    width = innerWidth;
    height = innerHeight;
    // Match AsciiRenderer.resize: both fixed canvases share the viewport origin and grid.
    cellWidth = Math.max(6, Math.min(9, Math.round(width / 190)));
    cellHeight = Math.round(cellWidth * 1.55);
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.font = `500 ${Math.round(cellHeight * .88)}px 'SFMono-Regular', Menlo, Consolas, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
  }
  function paint(now) {
    frame = 0;
    clear();
    waves = waves.filter(wave => now - wave.start < DURATION);
    context.fillStyle = document.body.hasAttribute('data-ds-dark-theme') ? '#78b7f2' : '#397fc4';
    for (const wave of waves) {
      const t = (now - wave.start) / DURATION;
      const radius = 12 + 270 * (1 - (1 - t) ** 1.45);
      const fade = Math.min(1, t * 12) * (1 - t) ** 1.45;
      const reach = radius + 20;
      const left = Math.max(0, Math.floor((wave.x - reach) / cellWidth));
      const right = Math.min(Math.ceil(width / cellWidth) - 1, Math.ceil((wave.x + reach) / cellWidth));
      const top = Math.max(0, Math.floor((wave.y - reach) / cellHeight));
      const bottom = Math.min(Math.ceil(height / cellHeight) - 1, Math.ceil((wave.y + reach) / cellHeight));
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const x = col * cellWidth + cellWidth / 2, y = row * cellHeight + cellHeight / 2;
          const distance = Math.hypot(x - wave.x, y - wave.y);
          const main = Math.max(0, 1 - Math.abs(distance - radius) / 14);
          const echo = Math.max(0, 1 - Math.abs(distance - radius * .78) / 10) * .35;
          const intensity = Math.max(main, echo) * fade;
          if (intensity < .025) continue;
          const hash = (col * 17 + row * 31 + wave.seed) % 11;
          const glyph = intensity > .45 ? (hash % 2 ? '+' : 'x') : intensity > .16 ? (hash < 5 ? ':' : ';') : '.';
          // Character-only rings share the ocean's monospace rhythm.
          context.globalAlpha = intensity * .8;
          context.fillText(glyph, x, y);
        }
      }
    }
    context.globalAlpha = 1;
    if (waves.length) frame = requestAnimationFrame(paint);
  }
  let down = null;
  function onDown(event) {
    down = event.button === 0 && event.isPrimary ? {x:event.clientX,y:event.clientY,id:event.pointerId,overlay:hasVisibleOverlay()} : null;
  }
  function onClick(event) {
    const start = down;
    down = null;
    if (!start || event.defaultPrevented || event.button !== 0 || event.detail === 0 || reduced.matches || document.hidden) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    if (!(event.target instanceof Element) || event.target.closest(COMPONENTS)) return;
    if (start.overlay || hasVisibleOverlay()) return;
    // Allow exposed canvas space on chat, project and profile pages, never their cards.
    if (!event.target.closest('.personal-chat, .personal-profile, .personal-guestbook')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    waves.push({x:event.clientX,y:event.clientY,start:performance.now(),seed:Math.floor(Math.random()*11)});
    waves = waves.slice(-5);
    if (!frame) frame = requestAnimationFrame(paint);
  }
  const cancel = () => { down = null; };
  const onVisibility = () => { if (document.hidden) stop(); };
  resize();
  document.addEventListener('pointerdown', onDown, {passive:true});
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', resize);
  reduced.addEventListener('change', stop);
  return () => {
    stop();
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', resize);
    reduced.removeEventListener('change', stop);
    canvas.remove();
  };
}
