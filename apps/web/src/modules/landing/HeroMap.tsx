import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { landingTokens } from './landing.tokens';
import {
  createHeroMapStyle,
  glowLayerId,
  growingGradient,
  OUTLINE_PARTS,
  UAE_FILL_LAYER,
  glowLayerIds,
  glowLayerOpacity,
} from './hero-map-style';
import { outlineFrame, STATIC_OUTLINE_FRAME, type OutlineFrame } from './outline-animation';

/** Gulf Cooperation Council area: Kuwait down to Oman, Riyadh to the Gulf of Oman. */
const GCC_BOUNDS: maplibregl.LngLatBoundsLike = [
  [44.5, 16.4],
  [60.2, 30.2],
];

const FRAME_INTERVAL_MS = 33;
const FILL_OPACITY = 0.1;

const Frame = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #050a14;
  pointer-events: none;
`;

const MapHost = styled.div`
  position: absolute;
  inset: 0;
  .maplibregl-ctrl-attrib {
    pointer-events: auto;
    background: rgba(5, 10, 20, 0.6) !important;
    color: ${landingTokens.textMuted} !important;
    font-size: 10px !important;
  }
  .maplibregl-ctrl-attrib a {
    color: ${landingTokens.textSecondary} !important;
  }
`;

function applyFrame(map: maplibregl.Map, frame: OutlineFrame) {
  for (const part of OUTLINE_PARTS) {
    const gradient = growingGradient(frame[part], frame.heat);
    for (const id of ['halo', 'glow', 'core'] as const) {
      map.setPaintProperty(glowLayerId(part, id), 'line-gradient', gradient);
    }
  }
  for (const id of glowLayerIds()) map.setPaintProperty(id, 'line-opacity', frame.alpha * glowLayerOpacity(id));
  map.setPaintProperty(UAE_FILL_LAYER, 'fill-opacity', frame.fill * FILL_OPACITY);
}

/**
 * Decorative hero background: a minimal dark map of the GCC with the UAE boundary drawn by a
 * glowing line that grows along the border, holds, fades and starts over. Not interactive.
 */
export function HeroMap() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;

    const map = new maplibregl.Map({
      container: el,
      style: createHeroMapStyle(new URL('/landing/uae-outline.json', window.location.origin).toString()),
      interactive: false,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
      fadeDuration: 0,
    });

    const fit = () => {
      const { clientWidth: w, clientHeight: h } = el;
      const narrow = w < 720;
      map.fitBounds(GCC_BOUNDS, {
        animate: false,
        padding: narrow
          ? { top: Math.round(h * 0.46), bottom: 24, left: 8, right: 8 }
          : { top: 72, bottom: 48, left: Math.min(Math.round(w * 0.36), 520), right: 24 },
      });
    };

    // Frame the camera before the first tile arrives so there is no visible jump on load.
    fit();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ready = false;
    let visible = true;
    let raf = 0;
    let startedAt = 0;
    let lastPaint = 0;

    const tick = (now: number) => {
      raf = 0;
      if (!ready || !visible) return;
      if (!startedAt) startedAt = now;
      if (now - lastPaint >= FRAME_INTERVAL_MS) {
        lastPaint = now;
        applyFrame(map, outlineFrame(now - startedAt));
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && !reduceMotion) raf = requestAnimationFrame(tick);
    };

    map.on('load', () => {
      ready = true;
      if (reduceMotion) applyFrame(map, STATIC_OUTLINE_FRAME);
      else start();
    });
    map.on('resize', fit);
    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      if (/glyph|fonts|204/i.test(msg)) return;
      console.warn('[hero-map]', msg);
    });

    // No point repainting a map that has been scrolled out of view.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      map.remove();
    };
  }, []);

  return (
    <Frame aria-hidden>
      <MapHost ref={host} />
    </Frame>
  );
}
