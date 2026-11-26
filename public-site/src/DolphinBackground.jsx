import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { mountRipples } from '../../personal-ocean/src/ripples.js';
import { mountDolphinPlayer } from './dolphin-player.js';
import wideLight from './assets/dolphin/wide-light.webp';
import wideDark from './assets/dolphin/wide-dark.webp';
import portraitLight from './assets/dolphin/portrait-light.webp';
import portraitDark from './assets/dolphin/portrait-dark.webp';
import phoneLight from './assets/dolphin/phone-light.webp';
import phoneDark from './assets/dolphin/phone-dark.webp';

export function DolphinBackground({ dark }) {
  const canvas = useRef(null);
  const player = useRef(null);
  useEffect(mountRipples, []);
  useEffect(() => {
    player.current = mountDolphinPlayer(canvas.current);
    return () => player.current.destroy();
  }, []);
  useEffect(() => { player.current.setTheme(dark); }, [dark]);

  return createPortal(
    <div className="site-dolphin-background" aria-hidden="true">
      <div className="site-dolphin-film">
        <picture>
          <source media="(max-aspect-ratio: 3/5)" srcSet={dark ? phoneDark : phoneLight} />
          <source media="(max-aspect-ratio: 6/5)" srcSet={dark ? portraitDark : portraitLight} />
          <img src={dark ? wideDark : wideLight} alt="" decoding="async" />
        </picture>
        <canvas ref={canvas} />
      </div>
    </div>,
    document.body,
  );
}
