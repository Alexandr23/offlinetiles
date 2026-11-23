import { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { selectCanGenerate, useAuthStore } from '@/modules/auth/auth.store';
import { useDatasetStore } from '@/modules/dataset/dataset.store';
import { CountrySearch } from '@/modules/drawing/CountrySearch';
import { selectionAreaKm2, selectionBounds, useDrawingStore } from '@/modules/drawing/drawing.store';
import { selectIsBusy, useQueueStore } from '@/modules/queue/queue.store';
import { StylePicker } from '@/modules/style-editor/components/StylePicker';
import { selectCurrentStyleName, useStyleStore } from '@/modules/style-editor/style.store';
import { useUiStore } from '@/modules/ui/ui.store';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconClear, IconGenerate, IconPlus, IconPolygon, IconRectangle } from '@/shared/components/Icons';
import { Hint, Mono, PanelBody, PanelFooter } from '@/shared/components/Panel';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { RangeSlider } from '@/shared/components/Slider';
import { formatArea } from '@/shared/utils/format';
import { buildGenerationName, useGenerateStore } from '../generate.store';
import { useSubmitGeneration } from '../useSubmitGeneration';
import { EstimateCard } from './EstimateCard';

/** Future formats land here; the control only renders when length > 1. */
const CONTAINER_OPTIONS = [{ value: 'mbtiles' as const, label: 'MBTiles' }];

const Pipeline = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

const Step = styled.section`
  min-width: 0;
`;

const StepHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
`;

const StepTitle = styled.h3`
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-primary);
`;

const StepNumber = styled.span`
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.04em;
  color: var(--color-accent);
  text-shadow: 0 0 12px var(--color-accent-glow);
`;

const AreaStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AreaBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
`;

const AreaCopy = styled.div`
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  strong {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }
`;

const ToolRow = styled.div`
  display: flex;
  gap: 4px;
  flex-shrink: 0;
`;

const Field = styled.div`
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const Label = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  line-height: 1.2;
`;

const FooterStats = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
`;

const GenerateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: stretch;
`;

const Remaining = styled.div<{ $exhausted: boolean }>`
  min-width: 88px;
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  border: 1px solid ${({ $exhausted }) => ($exhausted ? 'rgba(255, 92, 108, 0.35)' : 'var(--color-border-subtle)')};
  background: ${({ $exhausted }) => ($exhausted ? 'var(--color-danger-muted)' : 'var(--color-surface-2)')};
  text-align: center;
  small {
    display: block;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  strong {
    display: block;
    margin-top: 1px;
    font-family: var(--font-mono);
    font-size: var(--font-size-md);
    font-variant-numeric: tabular-nums;
    color: ${({ $exhausted }) => ($exhausted ? 'var(--color-danger)' : 'var(--color-text-primary)')};
  }
`;

export function GeneratePanel() {
  const selection = useDrawingStore((s) => s.selection);
  const selectionShape = useDrawingStore((s) => s.selectionShape);
  const selectionLabel = useDrawingStore((s) => s.selectionLabel);
  const tool = useDrawingStore((s) => s.tool);
  const setTool = useDrawingStore((s) => s.setTool);
  const clearSelection = useDrawingStore((s) => s.clear);
  const setName = useGenerateStore((s) => s.setName);
  const content = useGenerateStore((s) => s.content);
  const setContent = useGenerateStore((s) => s.setContent);
  const minZoom = useGenerateStore((s) => s.minZoom);
  const maxZoom = useGenerateStore((s) => s.maxZoom);
  const setZoomRange = useGenerateStore((s) => s.setZoomRange);
  const tileSize = useGenerateStore((s) => s.tileSize);
  const setTileSize = useGenerateStore((s) => s.setTileSize);
  const estimate = useGenerateStore((s) => s.estimate);
  const submitting = useGenerateStore((s) => s.submitting);
  const datasetMaxZoom = useDatasetStore((s) => (s.info?.ready ? s.info.maxZoom : 14));
  const datasetMinZoom = useDatasetStore((s) => (s.info?.ready ? s.info.minZoom : 0));
  const styleName = useStyleStore(selectCurrentStyleName);
  const setGenerateView = useUiStore((s) => s.setGenerateView);
  const busy = useQueueStore(selectIsBusy);
  const submit = useSubmitGeneration();
  const limits = useAuthStore((s) => s.user?.limits ?? null);
  const withinGenerationQuota = useAuthStore(selectCanGenerate);
  const remaining = limits?.generationsRemaining ?? null;
  const unlimited = limits?.unlimited ?? false;

  const bounds = useMemo(() => selectionBounds(selection), [selection]);
  const areaKm2 = useMemo(() => selectionAreaKm2(selection), [selection]);
  const shapeLabel = selectionLabel
    ? selectionLabel
    : selectionShape === 'rectangle'
      ? 'Rectangle'
      : selection?.geometry.type === 'MultiPolygon'
        ? 'Multi-polygon'
        : selection
          ? 'Polygon'
          : null;

  const areaOverLimit =
    areaKm2 !== null && limits?.maxAreaKm2 != null && !unlimited && areaKm2 > limits.maxAreaKm2;
  const tilesOverLimit =
    estimate != null && limits?.maxTiles != null && !unlimited && estimate.tiles > limits.maxTiles;

  useEffect(() => {
    if (maxZoom > datasetMaxZoom) setZoomRange(Math.min(minZoom, datasetMaxZoom), datasetMaxZoom);
  }, [datasetMaxZoom, maxZoom, minZoom, setZoomRange]);

  useEffect(() => {
    setName(buildGenerationName(styleName, minZoom, maxZoom), false);
  }, [styleName, minZoom, maxZoom, setName]);

  const exceeds = estimate?.limits.exceedsTileLimit || estimate?.limits.exceedsZoomLimit || areaOverLimit || tilesOverLimit;
  const canSubmit =
    !!selection && !submitting && !exceeds && (estimate?.tiles ?? 0) > 0 && withinGenerationQuota;

  return (
    <>
      <PanelBody>
        <Pipeline>
          <Step aria-labelledby="generate-step-area">
            <StepHead>
              <StepTitle id="generate-step-area">
                <StepNumber>1</StepNumber>
                Select area
              </StepTitle>
            </StepHead>
            <AreaStack>
              <CountrySearch />
              <AreaBar>
                <AreaCopy>
                  {selection && bounds ? (
                    <>
                      <strong>{shapeLabel}</strong> · {formatArea(areaKm2)}
                    </>
                  ) : (
                    <>Search a country, or draw a rectangle / polygon</>
                  )}
                </AreaCopy>
                <ToolRow>
                  <IconButton
                    label="Draw rectangle"
                    size="sm"
                    active={tool === 'rectangle'}
                    onClick={() => setTool(tool === 'rectangle' ? 'none' : 'rectangle')}
                  >
                    <IconRectangle />
                  </IconButton>
                  <IconButton
                    label="Draw polygon"
                    size="sm"
                    active={tool === 'polygon'}
                    onClick={() => setTool(tool === 'polygon' ? 'none' : 'polygon')}
                  >
                    <IconPolygon />
                  </IconButton>
                  {selection && (
                    <IconButton label="Clear selection" size="sm" tone="danger" onClick={clearSelection}>
                      <IconClear />
                    </IconButton>
                  )}
                </ToolRow>
              </AreaBar>
            </AreaStack>
          </Step>

          <Step aria-labelledby="generate-step-style">
            <StepHead>
              <StepTitle id="generate-step-style">
                <StepNumber>2</StepNumber>
                Style
              </StepTitle>
              <IconButton label="Create style" size="sm" onClick={() => setGenerateView('style')}>
                <IconPlus />
              </IconButton>
            </StepHead>
            <StylePicker />
          </Step>

          <Step aria-labelledby="generate-step-output">
            <StepHead>
              <StepTitle id="generate-step-output">
                <StepNumber>3</StepNumber>
                Generate
              </StepTitle>
              <Mono $muted $size="xs">
                {content === 'raster' ? 'PNG' : 'MVT'} · MBTiles
              </Mono>
            </StepHead>

            <Field>
              <Label>Type</Label>
              <SegmentedControl
                block
                value={content}
                onChange={setContent}
                options={[
                  { value: 'vector', label: 'Vector' },
                  { value: 'raster', label: 'Raster' },
                ]}
                aria-label="Tile type"
              />
            </Field>

            {CONTAINER_OPTIONS.length > 1 && (
              <Field>
                <Label>Container</Label>
                <SegmentedControl
                  block
                  value="mbtiles"
                  onChange={() => {}}
                  options={CONTAINER_OPTIONS}
                  aria-label="Container"
                />
              </Field>
            )}

            {content === 'raster' && (
              <Field>
                <Label>Tile size</Label>
                <SegmentedControl
                  block
                  value={String(tileSize) as '256' | '512'}
                  onChange={(v) => setTileSize(Number(v) as 256 | 512)}
                  options={[
                    { value: '256', label: '256 px' },
                    { value: '512', label: '512 px' },
                  ]}
                  aria-label="Raster tile size"
                />
              </Field>
            )}

            <Field>
              <Label>Zoom</Label>
              <RangeSlider
                size="lg"
                showValues
                min={datasetMinZoom}
                max={datasetMaxZoom}
                step={1}
                value={[minZoom, maxZoom]}
                onChange={([a, b]) => setZoomRange(a, b)}
                aria-label="Zoom range"
              />
            </Field>
          </Step>
        </Pipeline>
      </PanelBody>

      <PanelFooter>
        <FooterStats>
          <EstimateCard />
          {(areaOverLimit || tilesOverLimit || !withinGenerationQuota) && (
            <Hint style={{ color: 'var(--color-danger)', margin: 0 }}>
              {!withinGenerationQuota
                ? 'No generations left on this account.'
                : areaOverLimit
                  ? `Area exceeds your limit of ${formatArea(limits!.maxAreaKm2!)}.`
                  : `Tile count exceeds your limit of ${limits!.maxTiles!.toLocaleString()}.`}
            </Hint>
          )}
        </FooterStats>

        <GenerateRow>
          <Button block size="lg" variant="primary" icon={<IconGenerate />} disabled={!canSubmit} loading={submitting} onClick={submit}>
            {busy ? 'Add to queue' : 'Generate'}
          </Button>
          <Remaining $exhausted={!withinGenerationQuota} title="Generations remaining">
            <small>Left</small>
            <strong>{unlimited ? '∞' : remaining ?? '—'}</strong>
          </Remaining>
        </GenerateRow>
      </PanelFooter>
    </>
  );
}

