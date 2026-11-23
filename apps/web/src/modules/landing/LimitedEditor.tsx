import { geometryAreaKm2, type AreaSelection, type PresetId, type SelectionGeometry, type TileContent } from '@map-exporter/contracts';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { IconChevronRight, IconClear, IconPlus, IconPolygon, IconRectangle } from '@/shared/components/Icons';
import { formatArea } from '@/shared/utils/format';
import { LANDING_MAX_AREA_KM2, writeLandingHandoff } from './handoff';
import { LANDING_PRESET_OPTIONS, LANDING_PREVIEW_STYLES, landingTokens } from './landing.tokens';

const ACCENT = landingTokens.accent;

const Frame = styled.div`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #020617;
`;

const MapHost = styled.div`
  position: absolute;
  inset: 0;
  .maplibregl-ctrl-attrib {
    background: rgba(15, 23, 42, 0.7) !important;
    color: ${landingTokens.textMuted} !important;
    font-size: 10px !important;
  }
  .maplibregl-ctrl-attrib a {
    color: ${landingTokens.textSecondary} !important;
  }
  .maplibregl-ctrl-group {
    display: none;
  }
`;

const Panel = styled.div`
  position: absolute;
  top: max(88px, calc(env(safe-area-inset-top, 0px) + 72px));
  right: 20px;
  z-index: 2;
  width: min(280px, calc(100% - 40px));
  padding: 14px;
  border-radius: ${landingTokens.radiusSm};
  background: ${landingTokens.glass};
  border: 1px solid ${landingTokens.glassBorder};
  backdrop-filter: blur(14px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 720px) {
    top: auto;
    bottom: 20px;
    right: 16px;
    left: 16px;
    width: auto;
  }
`;

const PanelTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${landingTokens.text};
`;

const ToolRow = styled.div`
  display: flex;
  gap: 6px;
`;

const ToolBtn = styled.button<{ $active?: boolean }>`
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? ACCENT : landingTokens.glassBorder)};
  background: ${({ $active }) => ($active ? landingTokens.accentMuted : 'rgba(15, 23, 42, 0.55)')};
  color: ${({ $active }) => ($active ? ACCENT : landingTokens.textSecondary)};
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
  &:hover {
    color: ${landingTokens.text};
    border-color: rgba(148, 163, 184, 0.35);
  }
  svg {
    width: 16px;
    height: 16px;
  }
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${landingTokens.textMuted};
`;

const Select = styled.select`
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid ${landingTokens.glassBorder};
  background: rgba(15, 23, 42, 0.7);
  color: ${landingTokens.text};
  font-size: 13px;
  outline: none;
  &:focus {
    border-color: ${ACCENT};
  }
`;

const Segment = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
`;

const SegBtn = styled.button<{ $active?: boolean }>`
  height: 34px;
  border-radius: 10px;
  border: 1px solid ${({ $active }) => ($active ? ACCENT : landingTokens.glassBorder)};
  background: ${({ $active }) => ($active ? landingTokens.accentMuted : 'rgba(15, 23, 42, 0.55)')};
  color: ${({ $active }) => ($active ? landingTokens.text : landingTokens.textSecondary)};
  font-size: 12.5px;
  font-weight: 600;
`;

const AreaRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
  color: ${landingTokens.textSecondary};
  strong {
    color: ${landingTokens.text};
    font-weight: 600;
  }
`;

const Warn = styled.p`
  margin: 0;
  font-size: 12px;
  color: #fbbf24;
  line-height: 1.35;
`;

const Generate = styled.button`
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  background: ${ACCENT};
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border: 0;
  transition:
    background 160ms ease,
    transform 120ms ease;
  &:hover:not(:disabled) {
    background: ${landingTokens.accentHover};
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  svg {
    width: 16px;
    height: 16px;
  }
`;

const AreaBadge = styled.div`
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: ${landingTokens.glass};
  border: 1px solid ${landingTokens.glassBorder};
  backdrop-filter: blur(12px);
  color: ${landingTokens.text};
  font-size: 12.5px;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  @media (max-width: 720px) {
    bottom: auto;
    top: max(88px, calc(env(safe-area-inset-top, 0px) + 72px));
  }
`;

const Hint = styled.div`
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2;
  padding: 8px 12px;
  border-radius: 10px;
  background: ${landingTokens.glass};
  border: 1px solid ${landingTokens.glassBorder};
  backdrop-filter: blur(12px);
  color: ${landingTokens.textSecondary};
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  @media (max-width: 720px) {
    display: none;
  }
`;

const ZoomStack = styled.div`
  position: absolute;
  right: 20px;
  bottom: 24px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  @media (max-width: 720px) {
    right: 16px;
    bottom: auto;
    top: max(88px, calc(env(safe-area-inset-top, 0px) + 72px));
  }
`;

const ZoomBtn = styled.button`
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid ${landingTokens.glassBorder};
  background: ${landingTokens.glass};
  backdrop-filter: blur(14px);
  color: ${landingTokens.text};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  transition:
    background 160ms ease,
    color 160ms ease;
  &:hover:not(:disabled) {
    background: rgba(30, 41, 59, 0.85);
    color: #fff;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  svg {
    width: 16px;
    height: 16px;
  }
`;

function IconMinus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}

type Tool = 'none' | 'rectangle' | 'polygon';

function featureStyles() {
  return {
    fillColor: ACCENT,
    fillOpacity: 0.14,
    outlineColor: ACCENT,
    outlineWidth: 2.5,
  } as const;
}

export function LimitedEditor() {
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const [tool, setTool] = useState<Tool>('polygon');
  const [selection, setSelection] = useState<AreaSelection | null>(null);
  const [presetId, setPresetId] = useState<PresetId>('dark');
  const [content, setContent] = useState<TileContent>('vector');
  const [mapReady, setMapReady] = useState(false);

  const areaKm2 = useMemo(() => (selection ? geometryAreaKm2(selection.geometry) : null), [selection]);
  const overLimit = areaKm2 !== null && areaKm2 > LANDING_MAX_AREA_KM2;
  const canGenerate = Boolean(selection) && !overLimit;

  useEffect(() => {
    if (!host.current) return;

    const map = new maplibregl.Map({
      container: host.current,
      style: LANDING_PREVIEW_STYLES.dark,
      center: landingTokens.heroCenter,
      zoom: landingTokens.heroZoom,
      attributionControl: { compact: true },
      fadeDuration: 100,
      canvasContextAttributes: { antialias: true },
      // Landing is a scrollable page — wheel should scroll the document, not zoom the map.
      scrollZoom: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.resize();
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 7 }),
        modes: [
          new TerraDrawRectangleMode({ styles: { ...featureStyles() } }),
          new TerraDrawPolygonMode({
            showCoordinatePoints: true,
            pointerDistance: 28,
            styles: {
              ...featureStyles(),
              closingPointColor: '#F8FAFC',
              closingPointWidth: 7,
              closingPointOutlineColor: ACCENT,
              closingPointOutlineWidth: 2,
              coordinatePointColor: '#F8FAFC',
              coordinatePointWidth: 7,
              coordinatePointOutlineColor: ACCENT,
              coordinatePointOutlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            dragEventThrottle: 32,
            pointerDistance: 28,
            flags: {
              polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
              rectangle: { feature: { draggable: true, coordinates: { resizable: 'opposite' } } },
            },
            styles: {
              selectedPolygonColor: ACCENT,
              selectedPolygonFillOpacity: 0.18,
              selectedPolygonOutlineColor: landingTokens.accentHover,
              selectedPolygonOutlineWidth: 2.5,
              selectionPointColor: '#F8FAFC',
              selectionPointWidth: 7,
              selectionPointOutlineColor: ACCENT,
              selectionPointOutlineWidth: 2,
              midPointColor: ACCENT,
              midPointWidth: 5,
              midPointOutlineColor: '#F8FAFC',
              midPointOutlineWidth: 2,
            },
          }),
        ],
      });

      draw.start();
      draw.setMode('polygon');
      drawRef.current = draw;
      setMapReady(true);

      const sync = (id: string | number) => {
        const feature = draw.getSnapshot().find((f) => f.id === id);
        if (!feature || feature.geometry.type !== 'Polygon') return;
        setSelection({ geometry: feature.geometry as SelectionGeometry });
      };

      draw.on('finish', (id, context) => {
        if (context.action === 'draw') {
          for (const f of draw.getSnapshot()) {
            if (f.id !== id && f.id !== undefined) draw.removeFeatures([f.id]);
          }
          sync(id);
          draw.setMode('select');
          draw.selectFeature(id);
          setTool('none');
        } else {
          sync(id);
        }
      });

      draw.on('change', (ids, type) => {
        if (type === 'delete') {
          const remaining = draw.getSnapshot().filter((f) => f.geometry.type === 'Polygon');
          if (remaining.length === 0) setSelection(null);
        } else if (type === 'update' && ids[0] !== undefined) {
          sync(ids[0]);
        }
      });
    });

    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      if (/glyph|fonts|204/i.test(msg)) return;
      console.warn('[landing-map]', msg);
    });

    return () => {
      try {
        drawRef.current?.stop();
      } catch {
        // map may already be removed
      }
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  const activateTool = (next: Tool) => {
    const draw = drawRef.current;
    if (!draw || !mapReady) return;
    if (next === tool) {
      setTool('none');
      draw.setMode('select');
      return;
    }
    setTool(next);
    if (next === 'rectangle' || next === 'polygon') {
      draw.clear();
      setSelection(null);
      draw.setMode(next);
    } else {
      draw.setMode('select');
    }
  };

  const clearSelection = () => {
    drawRef.current?.clear();
    setSelection(null);
    setTool('polygon');
    drawRef.current?.setMode('polygon');
  };

  const generate = () => {
    if (!selection || overLimit) return;
    writeLandingHandoff({ selection, presetId, content });
    navigate('/editor');
  };

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 180 });
  };

  return (
    <Frame>
      <MapHost ref={host} />
      {!selection && mapReady && <Hint>Draw on the map to select an area</Hint>}
      {selection && areaKm2 !== null && <AreaBadge>Selected area · {formatArea(areaKm2)}</AreaBadge>}

      <ZoomStack>
        <ZoomBtn type="button" aria-label="Zoom in" disabled={!mapReady} onClick={() => zoomBy(1)}>
          <IconPlus />
        </ZoomBtn>
        <ZoomBtn type="button" aria-label="Zoom out" disabled={!mapReady} onClick={() => zoomBy(-1)}>
          <IconMinus />
        </ZoomBtn>
      </ZoomStack>

      <Panel>
        <PanelTitle>Select area</PanelTitle>
        <ToolRow>
          <ToolBtn type="button" $active={tool === 'rectangle'} aria-label="Rectangle" onClick={() => activateTool('rectangle')} disabled={!mapReady}>
            <IconRectangle />
          </ToolBtn>
          <ToolBtn type="button" $active={tool === 'polygon'} aria-label="Polygon" onClick={() => activateTool('polygon')} disabled={!mapReady}>
            <IconPolygon />
          </ToolBtn>
          <ToolBtn type="button" aria-label="Clear selection" onClick={clearSelection} disabled={!selection && tool === 'none'}>
            <IconClear />
          </ToolBtn>
        </ToolRow>

        <Label>
          Style preset
          <Select value={presetId} onChange={(e) => setPresetId(e.target.value as PresetId)} aria-label="Style preset">
            {LANDING_PRESET_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Label>

        <Label as="div">
          Tile format
          <Segment role="radiogroup" aria-label="Tile format">
            <SegBtn type="button" role="radio" aria-checked={content === 'vector'} $active={content === 'vector'} onClick={() => setContent('vector')}>
              Vector
            </SegBtn>
            <SegBtn type="button" role="radio" aria-checked={content === 'raster'} $active={content === 'raster'} onClick={() => setContent('raster')}>
              Raster
            </SegBtn>
          </Segment>
        </Label>

        <AreaRow>
          <span>Area</span>
          <strong>{formatArea(areaKm2)}</strong>
        </AreaRow>

        {overLimit && <Warn>Keep selections under {LANDING_MAX_AREA_KM2} km² in the limited editor, or open the full editor for larger regions.</Warn>}

        <Generate type="button" disabled={!canGenerate} onClick={generate}>
          Generate
          <IconChevronRight />
        </Generate>
      </Panel>
    </Frame>
  );
}
