import styled from 'styled-components';

const Ring = styled.span<{ $size: number }>`
  display: inline-block;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong);
  border-top-color: currentColor;
  animation: me-spin 700ms linear infinite;
`;

export function Spinner({ size = 14 }: { size?: number }) {
  return <Ring $size={size} role="progressbar" aria-label="loading" />;
}
