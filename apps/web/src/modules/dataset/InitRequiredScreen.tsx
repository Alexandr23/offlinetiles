import type { DatasetInfo } from '@map-exporter/contracts';
import styled from 'styled-components';
import { Button } from '@/shared/components/Button';
import { IconRetry } from '@/shared/components/Icons';
import { Mono } from '@/shared/components/Panel';
import { StatusIndicator } from '@/shared/components/StatusIndicator';

const Root = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(79, 209, 255, 0.06), transparent 50%),
    linear-gradient(var(--color-border-subtle) 1px, transparent 1px) 0 0 / 48px 48px,
    linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px) 0 0 / 48px 48px,
    var(--color-background);
  z-index: var(--z-map-overlay);
`;

const Card = styled.div`
  width: min(520px, calc(100% - 32px));
  min-width: 0;
  padding: 28px 32px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: me-slide-up var(--duration-slow) var(--easing-emphasized);
`;

const Title = styled.h1`
  margin: 14px 0 6px;
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.01em;
`;

const Text = styled.p`
  margin: 0 0 18px;
  color: var(--color-text-secondary);
  line-height: 1.6;
`;

const Detail = styled.p`
  margin: 0 0 18px;
  line-height: 1.6;
  overflow-wrap: anywhere;
`;

const Code = styled.pre`
  margin: 0 0 18px;
  padding: 12px 14px;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-left: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  line-height: 1.7;
  color: var(--color-text-primary);
  overflow-x: auto;
  span {
    color: var(--color-text-muted);
  }
`;

export function InitRequiredScreen({
  info,
  error,
  onRetry,
  loading,
}: {
  info: DatasetInfo | null;
  error: string | null;
  onRetry: () => void;
  loading: boolean;
}) {
  const connecting = loading && !error && !info;
  const unreachable = error !== null;
  const notReady = info && !info.ready ? info : null;

  const tone = connecting ? 'active' : unreachable ? 'danger' : 'warning';
  const label = connecting ? 'Loading dataset' : unreachable ? 'API unreachable' : 'Dataset not initialized';
  const title = connecting ? 'Connecting to local map' : unreachable ? 'Backend is not responding' : 'Initialize a map dataset';
  const text = connecting
    ? 'Checking the API and master.pmtiles. The map appears here as soon as the dataset is ready.'
    : unreachable
      ? `The API could not be reached (${error}). Start the server with pnpm dev and make sure PostgreSQL is running.`
      : notReady?.reason === 'building'
        ? 'Planetiler is still building the master dataset. This screen will refresh when it is ready.'
        : notReady?.reason === 'failed'
          ? notReady.message
          : 'No master.pmtiles was found. Build one from an OpenStreetMap extract, then reload. Small regions take a few minutes.';

  return (
    <Root>
      <Card>
        <StatusIndicator tone={tone} label={label} pulse={connecting} />
        <Title>{title}</Title>
        <Text>{text}</Text>
        {!unreachable && !connecting && (
          <Code>
            <span># small region for development</span>
            {'\n'}pnpm init-map --region monaco{'\n\n'}
            <span># or an existing extract</span>
            {'\n'}pnpm init-map --osm-file ./data/source/custom.osm.pbf
          </Code>
        )}
        {notReady && notReady.reason !== 'building' && notReady.reason !== 'failed' && (
          <Detail>
            <Mono $muted $size="sm">
              {notReady.message}
            </Mono>
          </Detail>
        )}
        {!connecting && (
          <Button variant="primary" icon={<IconRetry />} onClick={onRetry} loading={loading}>
            Check again
          </Button>
        )}
      </Card>
    </Root>
  );
}
