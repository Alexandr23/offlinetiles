import { geometryBounds } from '@map-exporter/contracts';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useMapStore } from '@/modules/map/map.store';
import { Input } from '@/shared/components/Input';
import { IconSearch } from '@/shared/components/Icons';
import { loadCountries, searchCountries, type CountryRecord } from './countries';
import { useDrawingStore } from './drawing.store';

const Root = styled.div`
  position: relative;
  width: 100%;
`;

const Field = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  svg {
    position: absolute;
    left: 8px;
    color: var(--color-text-muted);
    pointer-events: none;
    z-index: 1;
  }
  input {
    padding-left: 28px;
  }
`;

const Menu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-surface-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
  max-height: 240px;
  overflow-y: auto;
  animation: me-slide-down var(--duration-fast) var(--easing-standard);
`;

const Item = styled.li<{ $active: boolean }>`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--color-surface-hover)' : 'transparent')};
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  small {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }
  &:hover {
    background: var(--color-surface-hover);
  }
`;

const Status = styled.div`
  padding: 8px;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
`;

export function CountrySearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [countries, setCountries] = useState<CountryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const loadSelection = useDrawingStore((s) => s.loadSelection);
  const selectionLabel = useDrawingStore((s) => s.selectionLabel);

  useEffect(() => {
    if (!open || countries) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCountries()
      .then((list) => {
        if (!cancelled) setCountries(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load countries');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, countries]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const results = useMemo(
    () => (countries ? searchCountries(countries, query, 10) : []),
    [countries, query],
  );

  useEffect(() => {
    setActive(0);
  }, [query, results.length]);

  const selectCountry = (country: CountryRecord) => {
    loadSelection({ geometry: country.geometry }, 'country', country.name);
    const map = useMapStore.getState().map;
    if (map) {
      map.fitBounds(geometryBounds(country.geometry), { padding: 80, duration: 600, maxZoom: 8 });
    }
    setQuery(country.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault();
      selectCountry(results[active]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Root ref={root}>
      <Field>
        <IconSearch size={14} />
        <Input
          value={query}
          placeholder={selectionLabel ? selectionLabel : 'Search country…'}
          aria-label="Search country"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          role="combobox"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </Field>
      {open && (
        <Menu id={listId} role="listbox">
          {loading && <Status>Loading countries…</Status>}
          {error && <Status>{error}</Status>}
          {!loading && !error && results.length === 0 && <Status>No countries match</Status>}
          {!loading &&
            !error &&
            results.map((country, i) => (
              <Item
                key={country.id}
                role="option"
                aria-selected={i === active}
                $active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCountry(country)}
              >
                <span>{country.name}</span>
                <small>{country.id}</small>
              </Item>
            ))}
        </Menu>
      )}
    </Root>
  );
}
