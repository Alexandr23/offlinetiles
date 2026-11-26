import { useEffect, useRef, type RefObject } from 'react';
import styled from 'styled-components';
import heroLarge from './assets/hero-uae-2880.webp';
import heroSmall from './assets/hero-uae-1440.webp';
import { HERO_MAIN_PATH, HERO_OUTLINE_BOX, HERO_REST_PATH, HERO_SIZE } from './hero-outline.data';
import { landingTokens } from './landing.tokens';
import { outlineFrame, STATIC_OUTLINE_FRAME, type OutlineFrame } from './outline-animation';

/*
 * Decorative hero background: a still picture of the dark UAE map with the country boundary drawn
 * over it as a glowing line that grows along the border, holds, fades and starts over.
 *
 * The map is NOT live. The picture and the outline path are rendered together from the same tiles by
 * scripts/build-landing-hero.mjs, so the glow lies exactly on the borders and coast in the picture
 * and the page ships no map engine, tile requests or WebGL. The picture is a content-hashed asset
 * (served with a one-year cache), the path is part of the JS bundle.
 */

const FRAME_INTERVAL_MS = 33;
const FILL_OPACITY = 0.1;
/** Length of the bright comet trail behind the head, as a share of the line. */
const COMET = 0.12;
const HEAD_COLOR = '#ffe8f1';

const ratio = HERO_SIZE.width / HERO_SIZE.height;
const [boxLeft, , boxRight] = HERO_OUTLINE_BOX;
const outlineCenter = (boxLeft + boxRight) / 2 / HERO_SIZE.width;
const outlineShare = (boxRight - boxLeft) / HERO_SIZE.width;
/** On a phone the country spans nearly the whole width, centred under the headline. */
const PHONE_FILL = 0.94;
const phoneWidth = PHONE_FILL / outlineShare;
const phoneLeft = 0.5 - outlineCenter * phoneWidth;

/**
 * Stroke widths in CSS pixels, the same on every screen whatever the picture's scale. Kept narrow:
 * wide soft glow layers make the line look blurry. Softest first.
 */
const GLOW = [
  { width: 7, opacity: 0.14 },
  { width: 3.5, opacity: 0.32 },
  { width: 1.5, opacity: 1 },
] as const;
const HEAD = [
  { width: 5, opacity: 0.35, length: 0.06, color: landingTokens.cut },
  { width: 2, opacity: 1, length: COMET, color: landingTokens.cut },
  { width: 2, opacity: 1, length: 0.03, color: HEAD_COLOR },
] as const;
/** SVG stroke width for a width in CSS pixels; --px is picture pixels per CSS pixel. */
const cssWidth = (px: number) => `calc(var(--px) * ${px})`;

const Frame = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #050a14;
  pointer-events: none;
  container-type: size;
`;

/**
 * The picture and the outline share this box, so they always line up. On desktop the box covers the
 * hero like `background-size: cover`, pinned bottom right. On a phone it is wider than the screen
 * and shifted so the country is centred.
 */
const Stage = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: max(100cqw, calc(100cqh * ${ratio}));
  aspect-ratio: ${HERO_SIZE.width} / ${HERO_SIZE.height};
  --px: 2px;
  @media (max-width: 720px) {
    right: auto;
    left: ${(phoneLeft * 100).toFixed(2)}cqw;
    width: ${(phoneWidth * 100).toFixed(2)}cqw;
    /* The picture's top edge is higher than the screen's, so melt it into the page. */
    mask-image: linear-gradient(to bottom, transparent 0%, #000 22%);
  }
  img,
  svg {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
`;

const Outline = styled.svg`
  overflow: visible;
  fill: none;
  stroke: ${landingTokens.cut};
  stroke-linecap: round;
  stroke-linejoin: round;
`;

interface Layers {
  fill: SVGPathElement;
  mainTrail: SVGGElement;
  mainHead: SVGGElement;
  restTrail: SVGGElement;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function setGroupOpacity(group: SVGGElement, opacity: number) {
  group.style.opacity = String(+opacity.toFixed(3));
}

function applyFrame(layers: Layers, frame: OutlineFrame) {
  const trailLevel = frame.alpha * (0.55 + 0.45 * (1 - frame.heat));
  const drawn = frame.main > 0.0005;

  // The trail grows with a dash from the start of the ring to `main`.
  const complete = frame.main >= 0.9995;
  for (const path of layers.mainTrail.children) {
    path.setAttribute('stroke-dasharray', complete ? 'none' : `${frame.main.toFixed(4)} 2`);
  }
  setGroupOpacity(layers.mainTrail, drawn ? trailLevel : 0);

  // The comet head is a short bright dash that ends at `main` and cools into the line.
  const head = layers.mainHead.children;
  HEAD.forEach((spec, i) => {
    const length = Math.min(spec.length, frame.main);
    head[i]?.setAttribute('stroke-dasharray', `${length.toFixed(4)} 2`);
    head[i]?.setAttribute('stroke-dashoffset', (-(frame.main - length)).toFixed(4));
  });
  setGroupOpacity(layers.mainHead, drawn ? frame.alpha * frame.heat : 0);

  // Islands and enclaves fade in at the end of the growth.
  setGroupOpacity(layers.restTrail, frame.alpha * trailLevel * clamp01(frame.rest));

  layers.fill.style.opacity = String(+(frame.fill * FILL_OPACITY).toFixed(3));
}

function useOutlineAnimation(stage: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const groups = (name: string) => el.querySelector<SVGGElement>(`[data-part="${name}"]`)!;
    const layers: Layers = {
      fill: el.querySelector<SVGPathElement>('[data-part="fill"]')!,
      mainTrail: groups('main-trail'),
      mainHead: groups('main-head'),
      restTrail: groups('rest-trail'),
    };

    const resize = new ResizeObserver(() => {
      if (el.clientWidth) el.style.setProperty('--px', `${(HERO_SIZE.width / el.clientWidth).toFixed(4)}px`);
    });
    resize.observe(el);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyFrame(layers, STATIC_OUTLINE_FRAME);
      return () => resize.disconnect();
    }

    let visible = true;
    let raf = 0;
    let startedAt = 0;
    let lastPaint = 0;

    const tick = (now: number) => {
      raf = 0;
      if (!visible) return;
      if (!startedAt) startedAt = now;
      if (now - lastPaint >= FRAME_INTERVAL_MS) {
        lastPaint = now;
        applyFrame(layers, outlineFrame(now - startedAt));
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // No point repainting a hero that has been scrolled out of view.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
    });
    observer.observe(el);
    start();

    return () => {
      observer.disconnect();
      resize.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stage]);
}

export function HeroMap() {
  const stage = useRef<HTMLDivElement>(null);
  useOutlineAnimation(stage);

  return (
    <Frame aria-hidden>
      <Stage ref={stage}>
        <img
          src={heroSmall}
          srcSet={`${heroSmall} 1440w, ${heroLarge} 2880w`}
          sizes={`(max-width: 720px) ${(phoneWidth * 100).toFixed(0)}vw, max(100vw, ${(ratio * 100).toFixed(0)}vh)`}
          width={HERO_SIZE.width}
          height={HERO_SIZE.height}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
        <Outline viewBox={`0 0 ${HERO_SIZE.width} ${HERO_SIZE.height}`}>
          <path
            data-part="fill"
            d={`${HERO_MAIN_PATH}${HERO_REST_PATH}`}
            style={{ fill: landingTokens.cut, stroke: 'none', opacity: 0 }}
          />
          <g data-part="main-trail" style={{ opacity: 0 }}>
            {GLOW.map((l) => (
              <path
                key={l.width}
                d={HERO_MAIN_PATH}
                pathLength={1}
                style={{ strokeWidth: cssWidth(l.width) }}
                strokeOpacity={l.opacity}
                strokeDasharray="0 2"
              />
            ))}
          </g>
          <g data-part="main-head" style={{ opacity: 0 }}>
            {HEAD.map((l, i) => (
              <path
                key={i}
                d={HERO_MAIN_PATH}
                pathLength={1}
                stroke={l.color}
                style={{ strokeWidth: cssWidth(l.width) }}
                strokeOpacity={l.opacity}
                strokeDasharray="0 2"
              />
            ))}
          </g>
          <g data-part="rest-trail" style={{ opacity: 0 }}>
            {GLOW.map((l) => (
              <path
                key={l.width}
                d={HERO_REST_PATH}
                style={{ strokeWidth: cssWidth(l.width) }}
                strokeOpacity={l.opacity}
              />
            ))}
          </g>
        </Outline>
      </Stage>
    </Frame>
  );
}
