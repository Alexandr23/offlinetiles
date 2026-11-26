import type { AdminUserRow, RoleLimits, UpdateRoleLimitsRequest } from '@map-exporter/contracts';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { Button } from '@/shared/components/Button';
import { IconInfo } from '@/shared/components/Icons';
import { Input } from '@/shared/components/Input';
import { formatArea, formatInt } from '@/shared/utils/format';
import type { AdminViewProps } from '../admin.types';
import { Card, CardHead, CardHint, CardTitle, Empty, Mono, Pill, RoleBadge } from '../admin.ui';

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
`;

const Field = styled.label`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  align-items: center;
  gap: 6px 16px;
  padding: 14px 0;
  border-top: 1px solid var(--color-border-subtle);
  strong {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }
  small {
    display: block;
    margin-top: 2px;
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    line-height: 1.45;
  }
  input {
    height: 34px;
    text-align: right;
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border-subtle);
`;

const Note = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(139, 156, 255, 0.25);
  background: rgba(139, 156, 255, 0.08);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  svg {
    flex: none;
    margin-top: 2px;
    color: var(--color-info);
  }
`;

const FIELDS = [
  {
    key: 'maxGenerations',
    label: 'Generations',
    hint: 'Total generations a person can start before usage is reset.',
    format: formatInt,
  },
  { key: 'maxTiles', label: 'Max tiles per job', hint: 'Upper bound on the tile count of a single export.', format: formatInt },
  { key: 'maxAreaKm2', label: 'Max area per job', hint: 'Largest selectable area, in km².', format: formatArea },
] as const;

export function LimitsView({ data, setData, loaded, refresh }: AdminViewProps) {
  const pushToast = useUiStore((s) => s.pushToast);

  const save = async (role: RoleLimits['role'], patch: UpdateRoleLimitsRequest) => {
    try {
      const updated = await api.admin.updateRoleLimits(role, patch);
      setData((d) => ({ ...d, roleLimits: d.roleLimits.map((r) => (r.role === role ? updated : r)) }));
      pushToast({ tone: 'success', title: `${role} limits updated` });
      void refresh();
    } catch (e) {
      toastError('Could not update role limits', e);
    }
  };

  if (loaded && data.roleLimits.length === 0) {
    return (
      <Card>
        <Empty>No role limits configured</Empty>
      </Card>
    );
  }

  return (
    <>
      <Cards>
        {data.roleLimits.map((limits, i) => (
          <RoleCard key={limits.role} limits={limits} users={data.users} delay={i * 60} onSave={(p) => save(limits.role, p)} />
        ))}
      </Cards>
      <Note>
        <IconInfo size={16} />
        <span>
          Admins are always unlimited. Per-user overrides set on the Users page take precedence over these defaults; users
          without overrides pick up changes immediately.
        </span>
      </Note>
    </>
  );
}

function RoleCard({
  limits,
  users,
  delay,
  onSave,
}: {
  limits: RoleLimits;
  users: AdminUserRow[];
  delay: number;
  onSave: (patch: UpdateRoleLimitsRequest) => Promise<void>;
}) {
  const initial = useMemo(
    () => ({
      maxGenerations: String(limits.maxGenerations),
      maxTiles: String(limits.maxTiles),
      maxAreaKm2: String(Math.round(limits.maxAreaKm2)),
    }),
    [limits],
  );
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(initial), [initial]);

  const stats = useMemo(() => {
    const members = users.filter((u) => u.role === limits.role);
    return {
      total: members.length,
      custom: members.filter((u) => Object.values(u.overrides).some((v) => v !== null)).length,
      exhausted: members.filter((u) => !u.limits.unlimited && u.limits.generationsRemaining === 0).length,
    };
  }, [users, limits.role]);

  const values = {
    maxGenerations: Number(draft.maxGenerations),
    maxTiles: Number(draft.maxTiles),
    maxAreaKm2: Number(draft.maxAreaKm2),
  };
  const valid = Object.entries(draft).every(([, v]) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0);
  const dirty = (Object.keys(draft) as (keyof typeof draft)[]).some((k) => draft[k] !== initial[k]);

  return (
    <Card $delay={delay}>
      <CardHead>
        <div>
          <CardTitle>
            <RoleBadge $role={limits.role}>{limits.role}</RoleBadge> defaults
          </CardTitle>
          <CardHint>
            {stats.total} {stats.total === 1 ? 'person' : 'people'}
            {stats.custom > 0 && ` · ${stats.custom} with custom limits`}
          </CardHint>
        </div>
        {stats.exhausted > 0 && <Pill $tone="warning">{stats.exhausted} at quota</Pill>}
      </CardHead>

      {FIELDS.map((f) => (
        <Field key={f.key}>
          <div>
            <strong>{f.label}</strong>
            <small>
              {f.hint}
              {draft[f.key] !== initial[f.key] && <Mono> was {f.format(limits[f.key])}</Mono>}
            </small>
          </div>
          <Input
            mono
            type="number"
            min={0}
            value={draft[f.key]}
            invalid={draft[f.key].trim() === '' || Number(draft[f.key]) < 0}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </Field>
      ))}

      <Footer>
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(initial)}>
          Revert
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || !valid}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                maxGenerations: Math.round(values.maxGenerations),
                maxTiles: Math.round(values.maxTiles),
                maxAreaKm2: values.maxAreaKm2,
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          Save changes
        </Button>
      </Footer>
    </Card>
  );
}
