import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useDatasetStore } from '@/modules/dataset/dataset.store';
import { useStyleStore } from '@/modules/style-editor/style.store';
import { useMapStore } from './map.store';
import { applyStylePreservingOverlays } from './style-apply';

const Container = styled.div`
  position: absolute;
  inset: 0;
  background: var(--color-background);
  .maplibregl-ctrl-bottom-right {
    bottom: 0;
    right: 0;
  }
  .maplibregl-ctrl-group {
    display: none;
  }
`;

/**
 * Owns the MapLibre instance. The map is created once; styles are applied via
 * diffing so drawing overlays survive preset switches.
 */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);
  const setLoaded = useMapStore((s) => s.setLoaded);
  const setViewport = useMapStore((s) => s.setViewport);
  const setCursor = useMapStore((s) => s.setCursor);
  const bounds = useDatasetStore((s) => (s.info?.ready ? s.info.bounds : null));
  const fitted = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const initialStyle = useStyleStore.getState().workingStyle;
    const viewport = useMapStore.getState().viewport;

    const map = new maplibregl.Map({
      container: container.current,
      style: initialStyle as maplibregl.StyleSpecification,
      center: viewport.center,
      zoom: viewport.zoom,
      bearing: viewport.bearing,
      pitch: viewport.pitch,
      attributionControl: { compact: true },
      maxPitch: 60,
      fadeDuration: 150,
      canvasContextAttributes: { antialias: true },
    });

    map.on('load', () => setLoaded(true));
    map.on('moveend', () => {
      const c = map.getCenter();
      setViewport({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    });

    let frame: number | null = null;
    map.on('mousemove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setCursor([e.lngLat.lng, e.lngLat.lat]);
      });
    });
    map.on('mouseout', () => setCursor(null));

    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      // Missing glyph ranges or empty tiles are non-fatal for preview.
      if (/glyph|fonts|204/i.test(msg)) return;
      console.warn('[maplibre]', msg);
    });

    setMap(map);

    const unsubscribe = useStyleStore.subscribe((state, prev) => {
      if (state.workingStyle !== prev.workingStyle) {
        applyStylePreservingOverlays(map, state.workingStyle);
      }
    });

    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
      setMap(null);
      map.remove();
    };
  }, [setMap, setLoaded, setViewport, setCursor]);

  useEffect(() => {
    const map = useMapStore.getState().map;
    if (!map || !bounds || fitted.current) return;
    fitted.current = true;
    const [w, s, e, n] = bounds;
    if (Math.abs(e - w) >= 359) {
      map.jumpTo({ center: [10, 30], zoom: 2 });
      return;
    }
    map.fitBounds([w, s, e, n], { padding: 48, duration: 0 });
  }, [bounds]);

  return <Container ref={container} data-testid="map" />;
}
