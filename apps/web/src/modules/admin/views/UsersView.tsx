import type { AdminUserRow, RoleLimits, UpdateUserLimitsRequest, UserRole } from '@map-exporter/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import { IconChevronDown, IconCopy, IconPlus, IconRetry, IconSliders } from '@/shared/components/Icons';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { formatArea, formatDateTime, formatInt, formatRelative } from '@/shared/utils/format';
import { displayName, usageRatio } from '../admin.stats';
import type { AdminViewProps } from '../admin.types';
import {
  Avatar,
  Card,
  Empty,
  Mono,
  Pill,
  RoleBadge,
  RowActions,
  SearchField,
  SortHeader,
  Spacer,
  Table,
  TableWrap,
  Toolbar,
} from '../admin.ui';

const PAGE = 50;
const LOGIN_PATTERN = /^[a-zA-Z0-9._-]+$/;

type RoleFilter = 'all' | UserRole;
type SortKey = 'name' | 'usage' | 'jobs' | 'created' | 'seen';

const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  div {
    min-width: 0;
  }
  strong {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const CopyId = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  svg {
    width: 10px;
    height: 10px;
    opacity: 0;
    transition: opacity var(--duration-fast);
  }
  &:hover {
    color: var(--color-accent);
    svg {
      opacity: 1;
    }
  }
`;

const Usage = styled.div`
  display: grid;
  grid-template-columns: 72px auto;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
`;

const UsageTrack = styled.div`
  height: 5px;
  border-radius: 999px;
  background: rgba(148, 176, 204, 0.12);
  overflow: hidden;
  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width 600ms var(--easing-emphasized);
  }
`;

const Field = styled.label`
  display: grid;
  gap: 6px;
  & + & {
    margin-top: 14px;
  }
  > span {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  em {
    font-style: normal;
    letter-spacing: 0;
    text-transform: none;
    font-weight: var(--font-weight-regular);
    color: var(--color-text-muted);
  }
  input {
    height: 34px;
  }
`;

const FieldError = styled.small`
  color: var(--color-danger);
  font-size: var(--font-size-xs);
`;

function usageColor(ratio: number): string {
  if (ratio >= 1) return 'var(--color-danger)';
  if (ratio >= 0.8) return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function compare(a: AdminUserRow, b: AdminUserRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return displayName(a).localeCompare(displayName(b));
    case 'usage':
      return (usageRatio(a) ?? Infinity) - (usageRatio(b) ?? Infinity);
    case 'jobs':
      return a.generationCount - b.generationCount;
    case 'created':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    case 'seen':
      return Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt);
  }
}

export function UsersView({ data, refresh }: AdminViewProps) {
  const { users, roleLimits } = data;
  const pushToast = useUiStore((s) => s.pushToast);
  const [role, setRole] = useState<RoleFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'seen', desc: true });
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const c: Record<RoleFilter, number> = { all: users.length, admin: 0, user: 0, guest: 0 };
    for (const u of users) c[u.role]++;
    return c;
  }, [users]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (!q) return true;
      return [u.login, u.displayName, u.id].some((v) => v?.toLowerCase().includes(q));
    });
    list.sort((a, b) => compare(a, b, sort.key) * (sort.desc ? -1 : 1));
    return list;
  }, [users, role, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));

  const sortHead = (key: SortKey, label: string) => (
    <SortHeader $active={sort.key === key} onClick={() => toggleSort(key)} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      {label}
      {sort.key === key && <IconChevronDown size={10} style={{ transform: sort.desc ? undefined : 'rotate(180deg)' }} />}
    </SortHeader>
  );

  const resetUsage = async (row: AdminUserRow) => {
    const name = displayName(row);
    if (!window.confirm(`Reset the generation counter for ${name}?`)) return;
    try {
      await api.admin.resetUsage(row.id);
      pushToast({ tone: 'success', title: 'Usage reset', message: name });
      await refresh();
    } catch (e) {
      toastError('Reset failed', e);
    }
  };

  const copyId = (id: string) => {
    void navigator.clipboard?.writeText(id).then(() => pushToast({ tone: 'info', title: 'User ID copied' }, 2000));
  };

  return (
    <Card>
      <Toolbar>
        <SegmentedControl
          size="sm"
          value={role}
          onChange={(v) => {
            setRole(v);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: `All ${counts.all}` },
            { value: 'user', label: `Users ${counts.user}` },
            { value: 'guest', label: `Guests ${counts.guest}` },
            { value: 'admin', label: `Admins ${counts.admin}` },
          ]}
          aria-label="Filter by role"
        />
        <SearchField value={query} onChange={setQuery} placeholder="Search login, name or ID…" />
        <Spacer />
        <Button variant="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>
          New user
        </Button>
      </Toolbar>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>{sortHead('name', 'User')}</th>
              <th>Role</th>
              <th>{sortHead('usage', 'Quota')}</th>
              <th className="num">{sortHead('jobs', 'Jobs')}</th>
              <th>Limits</th>
              <th>{sortHead('created', 'Joined')}</th>
              <th>{sortHead('seen', 'Last seen')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((u) => {
              const name = displayName(u);
              const ratio = usageRatio(u);
              const hasOverrides = Object.values(u.overrides).some((v) => v !== null);
              return (
                <tr key={u.id}>
                  <td>
                    <Identity>
                      <Avatar name={name} role={u.role} />
                      <div>
                        <strong title={name}>{name}</strong>
                        <CopyId onClick={() => copyId(u.id)} title="Copy full ID">
                          {u.login && u.login !== name ? `@${u.login} · ` : ''}
                          {u.id.slice(0, 8)}
                          <IconCopy />
                        </CopyId>
                      </div>
                    </Identity>
                  </td>
                  <td>
                    <RoleBadge $role={u.role}>{u.role}</RoleBadge>
                  </td>
                  <td>
                    {ratio == null ? (
                      <Mono>∞ unlimited</Mono>
                    ) : (
                      <Usage title={`${u.limits.generationsRemaining ?? 0} remaining`}>
                        <UsageTrack>
                          <i style={{ width: `${Math.max(ratio * 100, 3)}%`, background: usageColor(ratio) }} />
                        </UsageTrack>
                        <span style={{ color: ratio >= 0.8 ? usageColor(ratio) : 'var(--color-text-secondary)' }}>
                          {u.limits.generationsUsed} / {u.limits.maxGenerations}
                        </span>
                      </Usage>
                    )}
                  </td>
                  <td className="num">{formatInt(u.generationCount)}</td>
                  <td>{hasOverrides ? <Pill $tone="warning">Custom</Pill> : <Mono>Role default</Mono>}</td>
                  <td title={formatDateTime(u.createdAt)}>
                    <Mono>{formatRelative(u.createdAt)}</Mono>
                  </td>
                  <td title={formatDateTime(u.lastSeenAt)}>
                    <Mono>{formatRelative(u.lastSeenAt)}</Mono>
                  </td>
                  <td>
                    {u.role !== 'admin' && (
                      <RowActions>
                        <IconButton label="Edit limits" size="sm" onClick={() => setEditing(u)}>
                          <IconSliders />
                        </IconButton>
                        <IconButton label="Reset usage" size="sm" onClick={() => void resetUsage(u)} disabled={u.limits.generationsUsed === 0}>
                          <IconRetry />
                        </IconButton>
                      </RowActions>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <Empty>{users.length === 0 ? 'No users yet' : 'No users match these filters'}</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableWrap>

      {rows.length > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Mono>
            Showing {limit} of {rows.length}
          </Mono>
          <Button size="sm" variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
            Show more
          </Button>
        </div>
      )}

      <LimitsModal
        user={editing}
        defaults={roleLimits.find((r) => r.role === editing?.role) ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => void refresh()}
      />
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={() => void refresh()} />
    </Card>
  );
}

const LIMIT_FIELDS = [
  { key: 'maxGenerations', label: 'Generations', format: (n: number) => formatInt(n) },
  { key: 'maxTiles', label: 'Max tiles per job', format: (n: number) => formatInt(n) },
  { key: 'maxAreaKm2', label: 'Max area per job (km²)', format: (n: number) => formatArea(n) },
] as const;

type LimitKey = (typeof LIMIT_FIELDS)[number]['key'];

function LimitsModal({
  user,
  defaults,
  onClose,
  onSaved,
}: {
  user: AdminUserRow | null;
  defaults: RoleLimits | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [draft, setDraft] = useState<Record<LimitKey, string>>({ maxGenerations: '', maxTiles: '', maxAreaKm2: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const str = (v: number | null) => (v == null ? '' : String(v));
    setDraft({
      maxGenerations: str(user.overrides.maxGenerations),
      maxTiles: str(user.overrides.maxTiles),
      maxAreaKm2: str(user.overrides.maxAreaKm2),
    });
  }, [user]);

  if (!user) return null;

  const save = async (body: UpdateUserLimitsRequest) => {
    setSaving(true);
    try {
      await api.admin.updateUserLimits(user.id, body);
      pushToast({ tone: 'success', title: 'Limits updated', message: displayName(user) });
      onSaved();
      onClose();
    } catch (e) {
      toastError('Could not update limits', e);
    } finally {
      setSaving(false);
    }
  };

  const parsed = (key: LimitKey): number | null => {
    const raw = draft[key].trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? (key === 'maxAreaKm2' ? n : Math.round(n)) : null;
  };

  return (
    <Modal
      open
      title={`Limits · ${displayName(user)}`}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={() => void save({ maxGenerations: null, maxTiles: null, maxAreaKm2: null })}>
            Use role defaults
          </Button>
          <Spacer />
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={() =>
              void save({ maxGenerations: parsed('maxGenerations'), maxTiles: parsed('maxTiles'), maxAreaKm2: parsed('maxAreaKm2') })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 16px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
        Leave a field empty to inherit the <RoleBadge $role={user.role}>{user.role}</RoleBadge> default.
      </p>
      {LIMIT_FIELDS.map((f) => (
        <Field key={f.key}>
          <span>
            {f.label}
            {defaults && <em>default {f.format(defaults[f.key])}</em>}
          </span>
          <Input
            mono
            type="number"
            min={0}
            value={draft[f.key]}
            placeholder={defaults ? `${defaults[f.key]} (inherited)` : 'inherited'}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        </Field>
      ))}
    </Modal>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLogin('');
    setPassword('');
    setName('');
  }, [open]);

  const loginTrimmed = login.trim();
  const loginError =
    loginTrimmed && (loginTrimmed.length < 2 || !LOGIN_PATTERN.test(loginTrimmed))
      ? 'At least 2 characters: letters, digits, dots, underscores, hyphens'
      : null;
  const passwordError = password && password.length < 8 ? 'At least 8 characters' : null;
  const valid = loginTrimmed.length >= 2 && !loginError && password.length >= 8;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await api.admin.createUser({ login: loginTrimmed, password, displayName: name.trim() || undefined, role: 'user' });
      pushToast({ tone: 'success', title: 'User created', message: loginTrimmed });
      onCreated();
      onClose();
    } catch (err) {
      toastError('Could not create user', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="New user"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={() => void submit()}>
            Create user
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field>
          <span>Login</span>
          <Input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} placeholder="jane.doe" invalid={!!loginError} autoComplete="off" />
          {loginError && <FieldError>{loginError}</FieldError>}
        </Field>
        <Field>
          <span>Password</span>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" invalid={!!passwordError} autoComplete="new-password" />
          {passwordError && <FieldError>{passwordError}</FieldError>}
        </Field>
        <Field>
          <span>
            Display name <em>optional</em>
          </span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
