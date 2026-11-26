import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { mountRipples } from '../../personal-ocean/src/ripples.js';
import { mountDolphinPlayer } from './dolphin-player.js';

export function DolphinBackground({ dark }) {
  const canvas = useRef(null);
  const player = useRef(null);
  useEffect(() => mountRipples({ cellBackground: false }), []);
  useEffect(() => {
    player.current = mountDolphinPlayer(canvas.current);
    return () => player.current.destroy();
  }, []);
  useEffect(() => { player.current.setTheme(dark); }, [dark]);

  return createPortal(
    <div className="site-dolphin-background" aria-hidden="true">
      <div className="site-dolphin-film">
        <canvas ref={canvas} />
      </div>
    </div>,
    document.body,
  );
}
