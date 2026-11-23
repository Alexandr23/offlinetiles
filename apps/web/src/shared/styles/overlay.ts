import { css } from 'styled-components';

/** Shared floating chrome over the map (toolbar, status, header chips, right panel). */
export const mapOverlaySurface = css`
  background: rgba(9, 12, 17, 0.88);
  border: 1px solid rgba(148, 176, 204, 0.22);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 12px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(22px) saturate(1.4);
  -webkit-backdrop-filter: blur(22px) saturate(1.4);
`;

export const mapOverlayRadius = '8px';

export const mapOverlayText = '#ffffff';
export const mapOverlayTextMuted = 'rgba(255, 255, 255, 0.7)';
export const mapOverlayDivider = 'rgba(255, 255, 255, 0.14)';
