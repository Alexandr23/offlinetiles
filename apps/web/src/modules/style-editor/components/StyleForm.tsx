import styled from 'styled-components';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconChevronRight, IconRetry, IconSave } from '@/shared/components/Icons';
import { Divider, Hint, PanelBody, PanelFooter, SectionLabel } from '@/shared/components/Panel';
import { selectCurrentStyleName, selectIsDirty, useStyleStore } from '../style.store';
import { SavedStylesList } from './SavedStylesList';
import { StyleEditor } from './StyleEditor';

const BackRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
`;

const BackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--easing-standard);
  svg {
    transform: rotate(180deg);
    color: var(--color-text-muted);
  }
  &:hover {
    color: var(--color-text-primary);
  }
`;

const Current = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
`;

const CurrentName = styled.div`
  min-width: 0;
  small {
    display: block;
    font-size: var(--font-size-xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  strong {
    display: block;
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const Dirty = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-warning);
  letter-spacing: 0.08em;
`;

/**
 * Style create/edit form shown in place of the generation form.
 * Edits the working style live on the map; Save persists a custom style.
 */
export function StyleForm() {
  const setGenerateView = useUiStore((s) => s.setGenerateView);
  const setSaveOpen = useUiStore((s) => s.setSaveStyleDialogOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const name = useStyleStore(selectCurrentStyleName);
  const dirty = useStyleStore(selectIsDirty);
  const source = useStyleStore((s) => s.source);
  const saving = useStyleStore((s) => s.saving);
  const resetWorking = useStyleStore((s) => s.resetWorking);
  const saveCurrent = useStyleStore((s) => s.saveCurrent);
  const savedCount = useStyleStore((s) => s.savedStyles.length);

  const back = () => setGenerateView('generate');

  const onSave = async () => {
    if (source.kind === 'saved') {
      try {
        await saveCurrent();
        pushToast({ tone: 'success', title: 'Style saved' });
        back();
      } catch (e) {
        toastError('Could not save style', e);
      }
    } else {
      setSaveOpen(true);
    }
  };

  return (
    <>
      <PanelBody>
        <BackRow>
          <BackBtn type="button" onClick={back}>
            <IconChevronRight size={14} />
            Back to generate
          </BackBtn>
          <div style={{ flex: 1 }} />
          <IconButton label="Reset changes" size="sm" disabled={!dirty} onClick={resetWorking}>
            <IconRetry />
          </IconButton>
        </BackRow>

        <Current>
          <CurrentName>
            <small>{source.kind === 'preset' ? 'Based on preset' : 'Editing saved style'}</small>
            <strong>{name}</strong>
          </CurrentName>
          {dirty && <Dirty>MODIFIED</Dirty>}
        </Current>

        <Hint style={{ marginBottom: 12 }}>
          Adjust colours and visibility below. Save to keep a reusable custom style, or go back to use the changes for this generation only.
        </Hint>

        <SectionLabel>Editor</SectionLabel>
        <StyleEditor />

        {savedCount > 0 && (
          <>
            <Divider $spacing={16} />
            <SectionLabel>Your styles</SectionLabel>
            <SavedStylesList />
          </>
        )}
      </PanelBody>

      <PanelFooter>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button block variant="ghost" onClick={back}>
            Cancel
          </Button>
          <Button
            block
            variant={dirty ? 'primary' : 'secondary'}
            icon={<IconSave />}
            onClick={onSave}
            loading={saving}
            disabled={!dirty && source.kind === 'saved'}
          >
            {source.kind === 'saved' ? 'Save' : 'Save as new style'}
          </Button>
        </div>
        {source.kind === 'saved' && (
          <Button block variant="ghost" style={{ marginTop: 8 }} onClick={() => setSaveOpen(true)}>
            Save as new style…
          </Button>
        )}
      </PanelFooter>
    </>
  );
}
