import styled from 'styled-components';

export const Skeleton = styled.div<{ $w?: string; $h?: string }>`
  width: ${({ $w = '100%' }) => $w};
  height: ${({ $h = '12px' }) => $h};
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-surface-2) 25%, var(--color-surface-3) 50%, var(--color-surface-2) 75%);
  background-size: 200% 100%;
  animation: me-shimmer 1.4s linear infinite;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  strong {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    margin-bottom: 2px;
  }
`;
