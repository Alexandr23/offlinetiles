import styled from 'styled-components';
import { SITE } from './landing.content';
import { landingTokens as t } from './landing.tokens';
import { WORDMARK } from './wordmark';

/** The four small tiles in the top-right corner. */
const Small = styled.g`
  fill: ${t.cut};
  transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
`;

const Root = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: ${t.text};
  svg {
    display: block;
    flex: none;
  }
  /* The small tiles drift off towards the corner. */
  a:hover > & ${Small}, a:focus-visible > & ${Small} {
    transform: translate(1.5px, -1.5px);
  }
`;

/**
 * Three big map tiles, and where the fourth would be, four small ones: the tile pyramid in one
 * mark. Big tiles are the accent blue, small ones the selection pink. Same geometry as /favicon.svg.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path fill={t.accent} d="M3 3h12v12H3zM3 17h12v12H3zM17 17h12v12H17z" />
      <Small>
        <path d="M17 3h5v5h-5zM24 3h5v5h-5zM17 10h5v5h-5zM24 10h5v5h-5z" />
      </Small>
    </svg>
  );
}

/** The name in its own cut letterforms, `height` pixels tall. */
export function Wordmark({ height = 11 }: { height?: number }) {
  return (
    <svg
      width={Math.round(height * WORDMARK.aspectRatio)}
      height={height}
      viewBox={WORDMARK.viewBox}
      aria-hidden
      focusable="false"
    >
      <path fill="currentColor" d={WORDMARK.offline} />
      <path fill={t.cut} d={WORDMARK.tiles} />
    </svg>
  );
}

/** Mark + wordmark. Decorative on its own: give the surrounding link an accessible name. */
export function Logo({ size }: { size?: number }) {
  return (
    <Root>
      <LogoMark size={size} />
      <Wordmark />
    </Root>
  );
}

export const LOGO_LABEL = `${SITE.name} home`;
