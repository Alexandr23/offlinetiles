import styled from 'styled-components';
import { useUiStore, type Toast as ToastModel } from '@/modules/ui/ui.store';
import { IconButton } from './IconButton';
import { IconCheck, IconClear, IconInfo, IconWarning } from './Icons';

const Stack = styled.div`
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  pointer-events: none;
`;

const Item = styled.div<{ $tone: ToastModel['tone'] }>`
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 10px 8px 10px 12px;
  background: rgba(9, 12, 17, 0.92);
  border: 1px solid rgba(148, 176, 204, 0.22);
  border-left: 2px solid
    var(
      --color-${({ $tone }) => ($tone === 'error' ? 'danger' : $tone === 'success' ? 'success' : $tone === 'warning' ? 'warning' : 'accent')}
    );
  border-radius: 8px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 12px 32px rgba(0, 0, 0, 0.45);
  color: #fff;
  backdrop-filter: blur(22px) saturate(1.4);
  -webkit-backdrop-filter: blur(22px) saturate(1.4);
  animation: me-slide-up var(--duration-base) var(--easing-emphasized);
  svg {
    margin-top: 2px;
    color: var(
      --color-${({ $tone }) => ($tone === 'error' ? 'danger' : $tone === 'success' ? 'success' : $tone === 'warning' ? 'warning' : 'accent')}
    );
  }
`;

const Title = styled.div`
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: #fff;
`;

const Message = styled.div`
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
  word-break: break-word;
`;

export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <Stack aria-live="polite">
      {toasts.map((t) => (
        <Item key={t.id} $tone={t.tone} role="status">
          {t.tone === 'success' ? <IconCheck size={15} /> : t.tone === 'info' ? <IconInfo size={15} /> : <IconWarning size={15} />}
          <div>
            <Title>{t.title}</Title>
            {t.message && <Message>{t.message}</Message>}
          </div>
          <IconButton label="Dismiss" size="sm" onClick={() => dismiss(t.id)}>
            <IconClear />
          </IconButton>
        </Item>
      ))}
    </Stack>
  );
}
