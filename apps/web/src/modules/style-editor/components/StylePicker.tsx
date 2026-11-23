import styled, { css } from 'styled-components';
import { IconCheck, IconUser } from '@/shared/components/Icons';
import { Skeleton } from '@/shared/components/Skeleton';
import { PRESETS, swatchesOf, type StyleSwatches } from '../presets';
import { useStyleStore } from '../style.store';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
`;

const Card = styled.button<{ $active: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--color-border-subtle)')};
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface-2);
  text-align: left;
  transition:
    border-color var(--duration-fast) var(--easing-standard),
    transform var(--duration-fast) var(--easing-standard),
    box-shadow var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: ${({ $active }) => ($active ? 'var(--color-accent)' : 'var(--color-border-strong)')};
    transform: translateY(-1px);
  }
  ${({ $active }) =>
    $active &&
    css`
      box-shadow: 0 0 0 1px var(--color-accent);
    `}
`;

const Preview = styled.div`
  position: relative;
  height: 36px;
  overflow: hidden;
`;

const Name = styled.div<{ $custom: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 5px;
  font-size: 9px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $custom }) => ($custom ? 'var(--color-accent)' : 'var(--color-text-secondary)')};
  background: var(--color-surface-1);
  border-top: 1px solid var(--color-border-subtle);
  min-width: 0;
  line-height: 1.2;
`;

const NameLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  svg {
    flex-shrink: 0;
  }
  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const NameMeta = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  svg {
    color: var(--color-accent);
  }
`;

/** Tiny vector "map" built from the style's own colours. */
export function StyleThumbnail({ swatches }: { swatches: StyleSwatches }) {
  const { bg, water, road, park, label } = swatches;
  return (
    <Preview style={{ background: bg }} aria-hidden>
      <svg viewBox="0 0 120 36" width="100%" height="100%" preserveAspectRatio="none">
        <path d="M0 22 C 20 14, 35 28, 55 24 S 95 6, 120 14 L120 36 L0 36 Z" fill={water} />
        <rect x="8" y="3" width="22" height="11" rx="1" fill={park} />
        <rect x="72" y="2" width="16" height="8" rx="1" fill={park} opacity="0.8" />
        <path d="M-4 12 L124 6" stroke={road} strokeWidth="2" fill="none" />
        <path d="M42 -2 L50 38" stroke={road} strokeWidth="1.4" fill="none" opacity="0.8" />
        <path d="M-2 18 L60 15 L124 20" stroke={road} strokeWidth="0.9" fill="none" opacity="0.7" />
        <circle cx="58" cy="14" r="1.3" fill={label} />
        <rect x="62" y="12" width="14" height="1.8" rx="0.8" fill={label} opacity="0.9" />
      </svg>
    </Preview>
  );
}

function StyleCard({
  name,
  title,
  swatches,
  active,
  custom,
  onSelect,
}: {
  name: string;
  title?: string;
  swatches: StyleSwatches;
  active: boolean;
  custom?: boolean;
  onSelect: () => void;
}) {
  return (
    <Card type="button" role="radio" aria-checked={active} $active={active} onClick={onSelect} title={title}>
      <StyleThumbnail swatches={swatches} />
      <Name $custom={!!custom}>
        <NameLabel>
          {custom && <IconUser size={9} />}
          <span>{name}</span>
        </NameLabel>
        <NameMeta>{active && <IconCheck size={10} />}</NameMeta>
      </Name>
    </Card>
  );
}

/**
 * Unified style gallery: presets + custom styles in one grid.
 * Used on the main generate form for style selection.
 */
export function StylePicker() {
  const source = useStyleStore((s) => s.source);
  const saved = useStyleStore((s) => s.savedStyles);
  const savedStatus = useStyleStore((s) => s.savedStatus);
  const applyPreset = useStyleStore((s) => s.applyPreset);
  const applySaved = useStyleStore((s) => s.applySaved);

  const activePresetId = source.kind === 'preset' ? source.presetId : null;
  const activeSavedId = source.kind === 'saved' ? source.styleId : null;
  const loadingSaved = savedStatus === 'loading' || savedStatus === 'idle';

  return (
    <Grid role="radiogroup" aria-label="Styles">
      {PRESETS.map((p) => (
        <StyleCard
          key={p.id}
          name={p.name}
          title={p.description}
          swatches={p.swatches}
          active={activePresetId === p.id}
          onSelect={() => applyPreset(p.id)}
        />
      ))}
      {loadingSaved
        ? [0, 1, 2].map((i) => <Skeleton key={`sk-${i}`} $h="54px" />)
        : saved.map((s) => (
            <StyleCard
              key={s.id}
              name={s.name}
              title={s.basePreset ? `Custom · based on ${s.basePreset}` : 'Custom style'}
              swatches={swatchesOf(s.style)}
              active={activeSavedId === s.id}
              custom
              onSelect={() => applySaved(s.id)}
            />
          ))}
    </Grid>
  );
}
