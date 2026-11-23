import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { IconCheck, IconChevronDown } from './Icons';

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Optional group heading; consecutive options with the same group share one header. */
  group?: string;
}

export interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  block?: boolean;
  'aria-label'?: string;
}

const Trigger = styled.button<{ $open: boolean; $size: 'sm' | 'md'; $block: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: ${({ $size }) => ($size === 'sm' ? 24 : 28)}px;
  padding: 0 6px 0 8px;
  min-width: 90px;
  ${({ $block }) =>
    $block &&
    css`
      width: 100%;
    `}
  background: var(--color-surface-1);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: ${({ $size }) => ($size === 'sm' ? 'var(--font-size-sm)' : 'var(--font-size-md)')};
  text-align: left;
  transition:
    border-color var(--duration-fast) var(--easing-standard),
    box-shadow var(--duration-fast) var(--easing-standard);
  &:hover {
    border-color: var(--color-border-strong);
  }
  ${({ $open }) =>
    $open &&
    css`
      border-color: var(--color-accent);
      box-shadow: 0 0 0 2px var(--color-accent-muted);
    `}
  svg {
    color: var(--color-text-muted);
    transition: transform var(--duration-base) var(--easing-standard);
    transform: rotate(${({ $open }) => ($open ? 180 : 0)}deg);
  }
`;

const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 100%;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
  animation: me-slide-down var(--duration-fast) var(--easing-standard);
  max-height: 260px;
  overflow-y: auto;
`;

const GroupLabel = styled.li`
  padding: 8px 8px 4px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  pointer-events: none;
`;

const Item = styled.li<{ $selected: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-md);
  color: ${({ $selected }) => ($selected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)')};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
  &:hover,
  &[data-active='true'] {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  svg {
    color: var(--color-accent);
    flex-shrink: 0;
  }
  small {
    display: block;
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
  }
`;

const Wrapper = styled.div<{ $block: boolean }>`
  position: relative;
  display: ${({ $block }) => ($block ? 'block' : 'inline-block')};
`;

export function Select<T extends string>({ value, options, onChange, placeholder = 'Select…', size = 'md', block = false, ...rest }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(options.findIndex((o) => o.value === value));
        return;
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let next = active;
      for (let i = 0; i < options.length; i++) {
        next = (next + dir + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      setActive(next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && active >= 0) {
        const opt = options[active];
        if (opt && !opt.disabled) {
          onChange(opt.value);
          setOpen(false);
        }
      } else {
        setOpen((o) => !o);
      }
    }
  };

  return (
    <Wrapper ref={root} $block={block}>
      <Trigger
        type="button"
        $open={open}
        $size={size}
        $block={block}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={rest['aria-label']}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label ?? placeholder}</span>
        <IconChevronDown size={14} />
      </Trigger>
      {open && (
        <Menu id={id} role="listbox">
          {options.map((o, i) => {
            const prevGroup = i > 0 ? options[i - 1]?.group : undefined;
            const showGroup = o.group && o.group !== prevGroup;
            return (
              <Fragment key={o.value}>
                {showGroup && <GroupLabel aria-hidden>{o.group}</GroupLabel>}
                <Item
                  role="option"
                  aria-selected={o.value === value}
                  data-active={i === active}
                  $selected={o.value === value}
                  $disabled={!!o.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span>
                    {o.label}
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {o.value === value && <IconCheck size={14} />}
                </Item>
              </Fragment>
            );
          })}
        </Menu>
      )}
    </Wrapper>
  );
}
