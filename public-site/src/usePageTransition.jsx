import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createAsciiTransition } from './ascii-transition.js';
import { createTransitionPlayer } from './transition-player.js';

export function usePageTransition() {
  const canvas = useRef(null);
  const controller = useRef(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    const field = createAsciiTransition(canvas.current);
    if (!field) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const player = createTransitionPlayer({ render: field.render, setActive });
    controller.current = action => {
      field.resize();
      player.play(() => flushSync(action), media.matches || document.hidden);
    };
    const resize = () => { field.resize(); player.redraw(); };
    const settle = () => { if (media.matches || document.hidden) player.settle(); };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', settle);
    media.addEventListener('change', settle);
    return () => {
      controller.current = null;
      player.destroy();
      field.destroy();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', settle);
      media.removeEventListener('change', settle);
    };
  }, []);

  const run = useCallback(action => {
    if (controller.current) controller.current(action);
    else action();
  }, []);
  return { canvas, run, active };
}
