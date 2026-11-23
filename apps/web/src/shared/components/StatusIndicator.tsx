import type { GenerationStatus } from '@map-exporter/contracts';
import styled, { css } from 'styled-components';

export type StatusTone = 'ready' | 'active' | 'queued' | 'success' | 'danger' | 'muted' | 'warning';

const toneColor: Record<StatusTone, string> = {
  ready: 'var(--color-success)',
  active: 'var(--color-accent)',
  queued: 'var(--color-text-secondary)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  muted: 'var(--color-text-muted)',
  warning: 'var(--color-warning)',
};

const Root = styled.span<{ $tone: StatusTone; $size: 'sm' | 'md' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ $size }) => ($size === 'sm' ? 'var(--font-size-xs)' : 'var(--font-size-sm)')};
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $tone }) => toneColor[$tone]};
  white-space: nowrap;
`;

const Dot = styled.span<{ $tone: StatusTone; $pulse: boolean }>`
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $tone }) => toneColor[$tone]};
  flex-shrink: 0;
  ${({ $pulse, $tone }) =>
    $pulse &&
    css`
      &::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50%;
        border: 1px solid ${toneColor[$tone]};
        animation: me-ping 1.4s var(--easing-standard) infinite;
      }
      @keyframes me-ping {
        0% {
          transform: scale(0.6);
          opacity: 0.9;
        }
        100% {
          transform: scale(1.6);
          opacity: 0;
        }
      }
    `}
`;

export function statusTone(status: GenerationStatus): StatusTone {
  switch (status) {
    case 'GENERATING':
    case 'PACKAGING':
      return 'active';
    case 'QUEUED':
      return 'queued';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'CANCELLED':
      return 'muted';
  }
}

export function StatusIndicator({
  tone,
  label,
  pulse = tone === 'active',
  size = 'md',
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <Root $tone={tone} $size={size}>
      <Dot $tone={tone} $pulse={pulse} aria-hidden />
      {label}
    </Root>
  );
}

export function GenerationStatusBadge({ status, size = 'md' }: { status: GenerationStatus; size?: 'sm' | 'md' }) {
  return <StatusIndicator tone={statusTone(status)} label={status} size={size} />;
}
