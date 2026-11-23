import styled from 'styled-components';
import { useMapStore } from '@/modules/map/map.store';
import { IconButton } from '@/shared/components/IconButton';
import { IconClear, IconFit, IconPlus, IconPolygon, IconRectangle } from '@/shared/components/Icons';
import {
  mapOverlayDivider,
  mapOverlayRadius,
  mapOverlaySurface,
  mapOverlayText,
  mapOverlayTextMuted,
} from '@/shared/styles/overlay';
import { selectionBounds, useDrawingStore } from './drawing.store';

const Dock = styled.div`
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  z-index: var(--z-map-overlay);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 30px;
  padding: 2px;
  box-sizing: border-box;
  border-radius: ${mapOverlayRadius};
  ${mapOverlaySurface}

  button {
    width: 24px !important;
    height: 24px !important;
    flex-shrink: 0;
    border-radius: 4px;
    color: ${mapOverlayText};
  }
  button:hover:not(:disabled) {
    color: ${mapOverlayText};
  }
  button:disabled {
    opacity: 1;
    color: rgba(255, 255, 255, 0.55);
  }
  button[aria-pressed='true'] {
    color: var(--color-accent);
  }
  button svg {
    width: 14px !important;
    height: 14px !important;
  }
`;

const Gap = styled.div`
  height: 1px;
  width: 14px;
  margin: 2px 0;
  background: ${mapOverlayDivider};
`;

const ZoomLevel = styled.div`
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  text-align: center;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 8px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.03em;
  color: ${mapOverlayText};
  line-height: 1;
  overflow: hidden;
`;

const ModeBadge = styled.div`
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-map-overlay);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 8px;
  border-radius: ${mapOverlayRadius};
  border: 1px solid var(--color-accent);
  color: ${mapOverlayText};
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  ${mapOverlaySurface}
  animation: me-slide-down var(--duration-base) var(--easing-emphasized);
  pointer-events: none;
  svg {
    width: 14px;
    height: 14px;
    color: var(--color-accent);
  }
  span {
    color: ${mapOverlayTextMuted};
    font-weight: var(--font-weight-regular);
    letter-spacing: 0.04em;
    text-transform: none;
  }
`;

const IconMinus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
    <path d="M5 12h14" />
  </svg>
);

export function DrawingToolbar() {
  const tool = useDrawingStore((s) => s.tool);
  const setTool = useDrawingStore((s) => s.setTool);
  const clear = useDrawingStore((s) => s.clear);
  const hasSelection = useDrawingStore((s) => s.selection !== null);
  const map = useMapStore((s) => s.map);
  const loaded = useMapStore((s) => s.loaded);
  const zoom = useMapStore((s) => s.viewport.zoom);

  const fit = () => {
    const m = useMapStore.getState().map;
    const bounds = selectionBounds(useDrawingStore.getState().selection);
    if (m && bounds) m.fitBounds(bounds, { padding: 80, duration: 500 });
  };

  /** Toolbar +/- snaps to whole zoom levels; wheel/pinch zoom stays fractional. */
  const zoomBy = (delta: 1 | -1) => {
    if (!map) return;
    const z = map.getZoom();
    const next = delta > 0 ? Math.floor(z + 1e-6) + 1 : Math.ceil(z - 1e-6) - 1;
    map.easeTo({ zoom: next, duration: 180 });
  };

  return (
    <>
      <Dock>
        <Root role="toolbar" aria-label="Drawing tools">
          <IconButton size="sm" label="Draw rectangle (R)" tooltipSide="right" active={tool === 'rectangle'} disabled={!loaded} onClick={() => setTool(tool === 'rectangle' ? 'none' : 'rectangle')}>
            <IconRectangle />
          </IconButton>
          <IconButton size="sm" label="Draw polygon (P)" tooltipSide="right" active={tool === 'polygon'} disabled={!loaded} onClick={() => setTool(tool === 'polygon' ? 'none' : 'polygon')}>
            <IconPolygon />
          </IconButton>
          <Gap />
          <IconButton size="sm" label="Zoom to selection" tooltipSide="right" disabled={!hasSelection} onClick={fit}>
            <IconFit />
          </IconButton>
          <IconButton size="sm" label="Clear selection" tooltipSide="right" tone="danger" disabled={!hasSelection && tool === 'none'} onClick={clear}>
            <IconClear />
          </IconButton>
        </Root>

        <Root role="toolbar" aria-label="Zoom">
          <IconButton size="sm" label="Zoom in" tooltipSide="right" disabled={!loaded} onClick={() => zoomBy(1)}>
            <IconPlus />
          </IconButton>
          <ZoomLevel>{zoom.toFixed(1)}</ZoomLevel>
          <IconButton size="sm" label="Zoom out" tooltipSide="right" disabled={!loaded} onClick={() => zoomBy(-1)}>
            <IconMinus />
          </IconButton>
        </Root>
      </Dock>
      {tool !== 'none' && (
        <ModeBadge>
          {tool === 'rectangle' ? <IconRectangle /> : <IconPolygon />}
          {tool} active
          <span>{tool === 'rectangle' ? 'click and drag · Esc to cancel' : 'click to add points · click first point to close · Esc'}</span>
        </ModeBadge>
      )}
    </>
  );
}
