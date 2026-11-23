import type {
  AdminUserRow,
  Generation,
  RoleLimits,
  UpdateRoleLimitsRequest,
} from '@map-exporter/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { selectIsAdmin, useAuthStore } from '@/modules/auth/auth.store';
import { LoginModal } from '@/modules/auth/LoginModal';
import { JobCard } from '@/modules/queue/components/JobCard';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { Button } from '@/shared/components/Button';
import { Input, NumberInput } from '@/shared/components/Input';
import { ToastStack } from '@/shared/components/Toast';
import { formatApprox, formatBytes, formatInt, formatRelative } from '@/shared/utils/format';

const Page = styled.div`
  min-height: 100%;
  background:
    radial-gradient(ellipse 70% 40% at 10% -10%, rgba(79, 209, 255, 0.14), transparent 50%),
    #06080c;
  color: var(--color-text-primary);
`;

const Top = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--color-border-strong);
  background: #0e131a;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
`;

const Brand = styled(Link)`
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #f2f6fb;
  text-decoration: none !important;
`;

const TopActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const EditorLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-3);
  color: #f2f6fb;
  font-size: var(--font-size-md);
  text-decoration: none !important;
  &:hover {
    background: var(--color-surface-hover);
    border-color: rgba(148, 176, 204, 0.4);
  }
`;

const Main = styled.main`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
  gap: 20px;
  padding: 20px 28px 40px;
  max-width: 1400px;
  margin: 0 auto;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const Section = styled.section`
  background: #131a23;
  border: 1px solid rgba(148, 176, 204, 0.22);
  border-radius: 14px;
  padding: 16px 18px 18px;
  min-width: 0;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
`;

const SectionTitle = styled.h2`
  margin: 0 0 4px;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #e8eef5;
`;

const SectionHint = styled.p`
  margin: 0 0 14px;
  font-size: var(--font-size-sm);
  color: #9eb0c4;
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TableWrap = styled.div`
  overflow-x: auto;
  border: 1px solid rgba(148, 176, 204, 0.22);
  border-radius: 10px;
  background: #0a0e14;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
  th,
  td {
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid rgba(148, 176, 204, 0.14);
    white-space: nowrap;
  }
  td {
    color: #d7e1ec;
  }
  th {
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c2d0e0;
    background: #19222d;
    border-bottom-color: rgba(148, 176, 204, 0.24);
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr:hover td {
    background: rgba(79, 209, 255, 0.04);
  }
  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: #e8eef5;
  }
`;

const RoleBadge = styled.span<{ $role: string }>`
  display: inline-flex;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid
    ${({ $role }) =>
      $role === 'admin' ? 'rgba(168, 180, 255, 0.35)' : $role === 'user' ? 'rgba(79, 209, 255, 0.35)' : 'rgba(148, 176, 204, 0.28)'};
  background: ${({ $role }) =>
    $role === 'admin' ? 'rgba(143, 156, 255, 0.22)' : $role === 'user' ? 'var(--color-accent-muted)' : 'rgba(148, 176, 204, 0.16)'};
  color: ${({ $role }) => ($role === 'admin' ? '#c4ccff' : $role === 'user' ? '#7fdfff' : '#c2d0e0')};
`;

const LimitsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const LimitCard = styled.div`
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(148, 176, 204, 0.22);
  background: #0a0e14;
  h3 {
    margin: 0 0 10px;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #e8eef5;
  }
`;

const FieldRow = styled.label`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--font-size-xs);
  color: #b6c4d4;
`;

const CreateRow = styled.form`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  margin-top: 12px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const JobList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow-y: auto;
`;

const Meta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: #9eb0c4;
`;

const Empty = styled.div`
  padding: 20px 8px;
  text-align: center;
  color: #9eb0c4;
  font-size: var(--font-size-sm);
`;

const ActionCell = styled.div`
  display: flex;
  gap: 6px;
`;

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore(selectIsAdmin);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const authStatus = useAuthStore((s) => s.status);
  const setLoginOpen = useAuthStore((s) => s.setLoginOpen);
  const logout = useAuthStore((s) => s.logout);
  const pushToast = useUiStore((s) => s.pushToast);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roleLimits, setRoleLimits] = useState<RoleLimits[]>([]);
  const [current, setCurrent] = useState<Generation | null>(null);
  const [queue, setQueue] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    document.title = 'Admin · OfflineTiles';
    void bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [usersRes, queueRes] = await Promise.all([api.admin.users(), api.admin.queue()]);
      setUsers(usersRes.users);
      setRoleLimits(usersRes.roleLimits);
      setCurrent(queueRes.current);
      setQueue(queueRes.queue);
    } catch (e) {
      toastError('Failed to load admin data', e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (authStatus === 'ready' && isAdmin) void refresh();
  }, [authStatus, isAdmin, refresh]);

  if (authStatus === 'ready' && user && !isAdmin) {
    return <Navigate to="/editor" replace />;
  }

  const saveRoleLimits = async (role: 'guest' | 'user', draft: UpdateRoleLimitsRequest) => {
    try {
      const updated = await api.admin.updateRoleLimits(role, draft);
      setRoleLimits((prev) => prev.map((r) => (r.role === role ? updated : r)));
      pushToast({ tone: 'success', title: `${role} limits updated` });
      await refresh();
    } catch (e) {
      toastError('Could not update role limits', e);
    }
  };

  const resetUsage = async (row: AdminUserRow) => {
    try {
      await api.admin.resetUsage(row.id);
      pushToast({ tone: 'success', title: 'Usage reset', message: row.login ?? row.id.slice(0, 8) });
      await refresh();
    } catch (e) {
      toastError('Reset failed', e);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.createUser({
        login: newLogin.trim(),
        password: newPassword,
        displayName: newName.trim() || undefined,
        role: 'user',
      });
      setNewLogin('');
      setNewPassword('');
      setNewName('');
      pushToast({ tone: 'success', title: 'User created', message: newLogin.trim() });
      await refresh();
    } catch (err) {
      toastError('Could not create user', err);
    }
  };

  return (
    <Page>
      <Top>
        <Brand to="/">OFFLINE TILES · ADMIN</Brand>
        <TopActions>
          <EditorLink to="/editor">Editor</EditorLink>
          {isAdmin ? (
            <Button size="sm" variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setLoginOpen(true)}>
              Sign in as admin
            </Button>
          )}
        </TopActions>
      </Top>

      {!isAdmin ? (
        <Main style={{ display: 'block', maxWidth: 560 }}>
          <Section>
            <SectionTitle>Admin access</SectionTitle>
            <SectionHint>Sign in with the admin account to manage users, limits, and the generation queue.</SectionHint>
            <Button variant="primary" onClick={() => setLoginOpen(true)}>
              Sign in
            </Button>
          </Section>
        </Main>
      ) : (
        <Main>
          <Stack>
            <Section>
              <SectionTitle>Users</SectionTitle>
              <SectionHint>All guests, dedicated users, and the admin. Reset clears an individual's generation usage counter.</SectionHint>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <th>Identity</th>
                      <th>Role</th>
                      <th>Used</th>
                      <th>Remaining</th>
                      <th>Jobs</th>
                      <th>Seen</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div>{u.login ?? u.displayName ?? 'Guest'}</div>
                          <code>{u.id.slice(0, 8)}</code>
                        </td>
                        <td>
                          <RoleBadge $role={u.role}>{u.role}</RoleBadge>
                        </td>
                        <td>{u.limits.unlimited ? '—' : u.generationsUsed}</td>
                        <td>{u.limits.unlimited ? '∞' : (u.limits.generationsRemaining ?? '—')}</td>
                        <td>{u.generationCount}</td>
                        <td>{formatRelative(u.lastSeenAt)}</td>
                        <td>
                          {u.role !== 'admin' && (
                            <ActionCell>
                              <Button size="sm" variant="ghost" onClick={() => void resetUsage(u)}>
                                Reset
                              </Button>
                            </ActionCell>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!loading && users.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <Empty>No users yet</Empty>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </TableWrap>

              <CreateRow onSubmit={createUser}>
                <Input value={newLogin} onChange={(e) => setNewLogin(e.target.value)} placeholder="login" required />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="password (8+)"
                  required
                  minLength={8}
                />
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="display name" />
                <Button type="submit" variant="secondary" disabled={!newLogin.trim() || newPassword.length < 8}>
                  Create user
                </Button>
              </CreateRow>
            </Section>

            <Section>
              <SectionTitle>Role limits</SectionTitle>
              <SectionHint>Defaults for guest and user roles. Admin is always unlimited.</SectionHint>
              <LimitsGrid>
                {roleLimits.map((limits) => (
                  <RoleLimitsEditor key={limits.role} limits={limits} onSave={(patch) => saveRoleLimits(limits.role, patch)} />
                ))}
              </LimitsGrid>
            </Section>
          </Stack>

          <Section>
            <SectionTitle>Generation queue</SectionTitle>
            <SectionHint>Global FIFO — visible only on this dashboard.</SectionHint>

            <SectionTitle style={{ marginTop: 8, fontSize: 11 }}>Current</SectionTitle>
            {current ? (
              <JobCard job={current} highlight>
                <Meta>
                  <span>{formatInt(current.tileCount)} tiles</span>
                  <span>{current.userId ? current.userId.slice(0, 8) : '—'}</span>
                  <span>{current.estimatedDurationMs ? formatApprox(current.estimatedDurationMs) : '—'}</span>
                </Meta>
              </JobCard>
            ) : (
              <Empty>Idle</Empty>
            )}

            <SectionTitle style={{ marginTop: 16, fontSize: 11 }}>
              Queued · {queue.length}
            </SectionTitle>
            <JobList>
              {queue.length === 0 ? (
                <Empty>Queue empty</Empty>
              ) : (
                queue.map((job) => (
                  <JobCard key={job.id} job={job} position={job.queuePosition}>
                    <Meta>
                      <span>{formatInt(job.tileCount)} tiles</span>
                      <span>{job.estimatedSize != null ? formatBytes(job.estimatedSize, 1) : '—'}</span>
                      <span>{job.userId ? job.userId.slice(0, 8) : '—'}</span>
                    </Meta>
                  </JobCard>
                ))
              )}
            </JobList>
          </Section>
        </Main>
      )}

      <LoginModal />
      <ToastStack />
    </Page>
  );
}

function RoleLimitsEditor({
  limits,
  onSave,
}: {
  limits: RoleLimits;
  onSave: (patch: UpdateRoleLimitsRequest) => Promise<void>;
}) {
  const [maxGenerations, setMaxGenerations] = useState(limits.maxGenerations);
  const [maxTiles, setMaxTiles] = useState(limits.maxTiles);
  const [maxAreaKm2, setMaxAreaKm2] = useState(Math.round(limits.maxAreaKm2));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMaxGenerations(limits.maxGenerations);
    setMaxTiles(limits.maxTiles);
    setMaxAreaKm2(Math.round(limits.maxAreaKm2));
  }, [limits]);

  const dirty =
    maxGenerations !== limits.maxGenerations ||
    maxTiles !== limits.maxTiles ||
    maxAreaKm2 !== Math.round(limits.maxAreaKm2);

  return (
    <LimitCard>
      <h3>{limits.role}</h3>
      <FieldRow>
        Generations
        <NumberInput value={maxGenerations} min={0} max={1_000_000} onChange={setMaxGenerations} />
      </FieldRow>
      <FieldRow>
        Max tiles
        <Input
          mono
          type="number"
          value={maxTiles}
          min={0}
          onChange={(e) => setMaxTiles(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 110, height: 28 }}
        />
      </FieldRow>
      <FieldRow>
        Max area km²
        <Input
          mono
          type="number"
          value={maxAreaKm2}
          min={0}
          onChange={(e) => setMaxAreaKm2(Math.max(0, Number(e.target.value) || 0))}
          style={{ width: 110, height: 28 }}
        />
      </FieldRow>
      <Button
        size="sm"
        variant="primary"
        disabled={!dirty || saving}
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({ maxGenerations, maxTiles, maxAreaKm2 });
          } finally {
            setSaving(false);
          }
        }}
      >
        Save
      </Button>
    </LimitCard>
  );
}
