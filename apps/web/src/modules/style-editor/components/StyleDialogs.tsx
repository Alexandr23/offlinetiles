import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { Hint } from '@/shared/components/Panel';
import { selectCurrentStyleName, useStyleStore } from '../style.store';

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 12px;
`;

export function SaveStyleDialog() {
  const open = useUiStore((s) => s.saveStyleDialogOpen);
  const setOpen = useUiStore((s) => s.setSaveStyleDialogOpen);
  const setGenerateView = useUiStore((s) => s.setGenerateView);
  const pushToast = useUiStore((s) => s.pushToast);
  const currentName = useStyleStore(selectCurrentStyleName);
  const saveAsNew = useStyleStore((s) => s.saveAsNew);
  const saving = useStyleStore((s) => s.saving);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(`${currentName} custom`);
  }, [open, currentName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await saveAsNew(trimmed);
      pushToast({ tone: 'success', title: 'Style saved', message: created.name });
      setOpen(false);
      setGenerateView('generate');
    } catch (e) {
      toastError('Could not save style', e);
    }
  };

  return (
    <Modal
      open={open}
      title="Save style"
      onClose={() => setOpen(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <Field>
        Name
        <Input
          autoFocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="My dark style"
        />
      </Field>
      <Hint>The full MapLibre style JSON is stored. Reuse it for any area, vector or raster.</Hint>
    </Modal>
  );
}

export function RenameStyleDialog() {
  const id = useUiStore((s) => s.renameStyleId);
  const setId = useUiStore((s) => s.setRenameStyleId);
  const pushToast = useUiStore((s) => s.pushToast);
  const saved = useStyleStore((s) => s.savedStyles);
  const rename = useStyleStore((s) => s.rename);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const target = saved.find((s) => s.id === id);

  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  const submit = async () => {
    if (!id || !name.trim()) return;
    setBusy(true);
    try {
      await rename(id, name.trim());
      pushToast({ tone: 'success', title: 'Style renamed' });
      setId(null);
    } catch (e) {
      toastError('Rename failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={id !== null}
      title="Rename style"
      onClose={() => setId(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => setId(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Rename
          </Button>
        </>
      }
    >
      <Field>
        Name
        <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
    </Modal>
  );
}
