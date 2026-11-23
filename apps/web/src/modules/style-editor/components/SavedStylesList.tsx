import styled, { css } from 'styled-components';
import { useUiStore, toastError } from '@/modules/ui/ui.store';
import { IconButton } from '@/shared/components/IconButton';
import { IconCopy, IconEdit, IconTrash } from '@/shared/components/Icons';
import { EmptyState, Skeleton } from '@/shared/components/Skeleton';
import { formatRelative } from '@/shared/utils/format';
import { useStyleStore } from '../style.store';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Row = styled.li<{ $active: boolean }>`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 10px;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--color-border-subtle)')};
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  transition:
    border-color var(--duration-fast) var(--easing-standard),
    background var(--duration-fast) var(--easing-standard);
  &:hover {
    background: var(--color-surface-hover);
  }
  ${({ $active }) =>
    $active &&
    css`
      background: var(--color-accent-muted);
    `}
`;

const Main = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  text-align: left;
  color: var(--color-text-primary);
  strong {
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  small {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 2px;
  opacity: 0.6;
  transition: opacity var(--duration-fast);
  ${Row}:hover & {
    opacity: 1;
  }
`;

export function SavedStylesList() {
  const saved = useStyleStore((s) => s.savedStyles);
  const status = useStyleStore((s) => s.savedStatus);
  const source = useStyleStore((s) => s.source);
  const applySaved = useStyleStore((s) => s.applySaved);
  const duplicate = useStyleStore((s) => s.duplicate);
  const remove = useStyleStore((s) => s.remove);
  const setRenameStyleId = useUiStore((s) => s.setRenameStyleId);
  const pushToast = useUiStore((s) => s.pushToast);

  if (status === 'loading' || status === 'idle') {
    return (
      <List>
        {[0, 1].map((i) => (
          <li key={i}>
            <Skeleton $h="34px" />
          </li>
        ))}
      </List>
    );
  }

  if (saved.length === 0) {
    return (
      <EmptyState style={{ padding: '18px 8px' }}>
        <strong>No saved styles</strong>
        Customize a preset and save it to reuse it for other areas.
      </EmptyState>
    );
  }

  const activeId = source.kind === 'saved' ? source.styleId : null;

  return (
    <List>
      {saved.map((s) => (
        <Row key={s.id} $active={activeId === s.id}>
          <Main type="button" onClick={() => applySaved(s.id)} aria-pressed={activeId === s.id}>
            <strong>{s.name}</strong>
            <small>
              {s.basePreset ? `${s.basePreset} · ` : ''}
              {formatRelative(s.updatedAt)}
            </small>
          </Main>
          <Actions>
            <IconButton label="Rename" size="sm" onClick={() => setRenameStyleId(s.id)}>
              <IconEdit />
            </IconButton>
            <IconButton
              label="Duplicate"
              size="sm"
              onClick={() => duplicate(s.id).then(() => pushToast({ tone: 'success', title: 'Style duplicated' })).catch((e) => toastError('Duplicate failed', e))}
            >
              <IconCopy />
            </IconButton>
            <IconButton
              label="Delete"
              size="sm"
              tone="danger"
              onClick={() => remove(s.id).then(() => pushToast({ tone: 'info', title: `Deleted “${s.name}”` })).catch((e) => toastError('Delete failed', e))}
            >
              <IconTrash />
            </IconButton>
          </Actions>
        </Row>
      ))}
    </List>
  );
}
