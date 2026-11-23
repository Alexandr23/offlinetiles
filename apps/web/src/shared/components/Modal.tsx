import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { IconButton } from './IconButton';
import { IconClear } from './Icons';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  background: var(--color-overlay);
  animation: me-fade-in var(--duration-base) var(--easing-standard);
`;

const Dialog = styled.div<{ $width: number }>`
  width: min(${({ $width }) => $width}px, calc(100vw - 32px));
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: me-scale-in var(--duration-base) var(--easing-emphasized);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 64px);
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  h3 {
    margin: 0;
    font-size: var(--font-size-sm);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
`;

const Body = styled.div`
  padding: 16px;
  overflow-y: auto;
`;

const Foot = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-subtle);
`;

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 420,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <Backdrop onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Dialog role="dialog" aria-modal="true" $width={width}>
        <Head>
          <h3>{title}</h3>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <IconClear />
          </IconButton>
        </Head>
        <Body>{children}</Body>
        {footer && <Foot>{footer}</Foot>}
      </Dialog>
    </Backdrop>,
    document.body,
  );
}
