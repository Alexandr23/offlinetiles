import styled, { css } from 'styled-components';
import { useSmoothNumber } from '../hooks/useSmoothNumber';

const Track = styled.div<{ $height: number }>`
  position: relative;
  height: ${({ $height }) => $height}px;
  background: var(--color-surface-active);
  border-radius: 1px;
  overflow: hidden;
`;

const Fill = styled.div<{ $tone: 'accent' | 'success' | 'danger' | 'warning'; $active: boolean; $indeterminate: boolean }>`
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--color-${({ $tone }) => $tone});
  border-radius: 1px;
  will-change: width;
  ${({ $active }) =>
    $active &&
    css`
      background-image: linear-gradient(
        -45deg,
        rgba(255, 255, 255, 0.18) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255, 255, 255, 0.18) 50%,
        rgba(255, 255, 255, 0.18) 75%,
        transparent 75%,
        transparent
      );
      background-size: 24px 24px;
      animation: me-stripes 900ms linear infinite;
    `}
  ${({ $indeterminate }) =>
    $indeterminate &&
    css`
      width: 35% !important;
      animation: me-indeterminate 1.2s var(--easing-standard) infinite;
      @keyframes me-indeterminate {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(300%);
        }
      }
    `}
`;

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  tone?: 'accent' | 'success' | 'danger' | 'warning';
  active?: boolean;
  indeterminate?: boolean;
  height?: number;
  smooth?: boolean;
  'aria-label'?: string;
}

export function ProgressBar({ value, tone = 'accent', active = false, indeterminate = false, height = 4, smooth = true, ...rest }: ProgressBarProps) {
  const target = Math.min(1, Math.max(0, value));
  const smoothValue = useSmoothNumber(target, smooth ? 600 : 0);
  return (
    <Track $height={height} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target * 100)} aria-label={rest['aria-label']}>
      <Fill $tone={tone} $active={active} $indeterminate={indeterminate} style={{ width: `${smoothValue * 100}%` }} />
    </Track>
  );
}
