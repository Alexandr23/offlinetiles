import type { Generation } from '@map-exporter/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import { selectIsAdmin, useAuthStore } from '@/modules/auth/auth.store';
import { LoginModal } from '@/modules/auth/LoginModal';
import { LogoMark, Wordmark } from '@/modules/landing/Logo';
import { toastError, useUiStore } from '@/modules/ui/ui.store';
import { api } from '@/shared/api/endpoints';
import { Button } from '@/shared/components/Button';
import { IconButton } from '@/shared/components/IconButton';
import {
  IconChevronRight,
  IconDashboard,
  IconLogout,
  IconMail,
  IconQueue,
  IconRetry,
  IconSliders,
  IconUser,
} from '@/shared/components/Icons';
import { Skeleton } from '@/shared/components/Skeleton';
import { Spinner } from '@/shared/components/Spinner';
import { ToastStack } from '@/shared/components/Toast';
import { formatRelative } from '@/shared/utils/format';
import { displayName } from './admin.stats';
import { ADMIN_VIEWS, type AdminView, type AdminViewProps } from './admin.types';
import { Avatar, Card } from './admin.ui';
import { useAdminData } from './useAdminData';
import { ContactsView } from './views/ContactsView';
import { LimitsView } from './views/LimitsView';
import { OverviewView } from './views/OverviewView';
import { QueueView } from './views/QueueView';
import { UsersView } from './views/UsersView';

const NAV: Record<AdminView, { label: string; icon: ReactNode; view: ComponentType<AdminViewProps> }> = {
  overview: { label: 'Overview', icon: <IconDashboard />, view: OverviewView },
  queue: { label: 'Queue', icon: <IconQueue />, view: QueueView },
  users: { label: 'Users', icon: <IconUser />, view: UsersView },
  limits: { label: 'Limits', icon: <IconSliders />, view: LimitsView },
  contacts: { label: 'Contacts', icon: <IconMail />, view: ContactsView },
};

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const ping = keyframes`
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(2.2); opacity: 0; }
`;

/* The shell is pinned to the viewport and <Main> owns scrolling, so the page scrolls no matter
   how the global body overflow is configured for other routes. */
const Shell = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  color: var(--color-text-primary);
  background:
    radial-gradient(ellipse 60% 45% at 85% -10%, rgba(79, 209, 255, 0.12), transparent 60%),
    radial-gradient(ellipse 50% 40% at 0% 100%, rgba(255, 133, 179, 0.06), transparent 60%),
    #06080c;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(148, 176, 204, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 176, 204, 0.035) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: radial-gradient(ellipse 90% 70% at 60% 0%, #000 20%, transparent 75%);
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
`;

const Sidebar = styled.aside`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 20px 14px 16px;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  background: rgba(11, 15, 21, 0.72);
  backdrop-filter: blur(12px);

  @media (max-width: 900px) {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
`;

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  color: var(--color-text-primary);
  text-decoration: none;
  small {
    display: block;
    margin-top: 3px;
    font-size: 9px;
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--color-accent);
  }
  @media (max-width: 900px) {
    padding: 0;
    > div {
      display: none;
    }
  }
`;

const Nav = styled.nav`
  display: grid;
  gap: 2px;
  @media (max-width: 900px) {
    display: flex;
    gap: 4px;
  }
`;

const NavLabel = styled.div`
  padding: 0 10px 8px;
  font-size: 9.5px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  @media (max-width: 900px) {
    display: none;
  }
`;

const NavItem = styled.button<{ $active: boolean }>`
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
  text-align: left;
  transition:
    background var(--duration-fast) var(--easing-standard),
    color var(--duration-fast) var(--easing-standard);
  svg {
    width: 16px;
    height: 16px;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--color-text-muted);
    opacity: 0;
    transition: opacity var(--duration-fast);
  }
  &:hover {
    background: rgba(148, 176, 204, 0.07);
    color: var(--color-text-primary);
    kbd {
      opacity: 1;
    }
  }
  ${({ $active }) =>
    $active &&
    css`
      background: linear-gradient(90deg, rgba(79, 209, 255, 0.16), rgba(79, 209, 255, 0.04));
      color: #f2f6fb;
      svg {
        color: var(--color-accent);
      }
      &::before {
        content: '';
        position: absolute;
        left: -14px;
        top: 8px;
        bottom: 8px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--color-accent);
        box-shadow: 0 0 12px var(--color-accent);
      }
      &:hover {
        background: linear-gradient(90deg, rgba(79, 209, 255, 0.2), rgba(79, 209, 255, 0.06));
      }
    `}

  @media (max-width: 900px) {
    grid-template-columns: 16px auto auto;
    flex: none;
    height: 32px;
    kbd {
      display: none;
    }
    &::before {
      display: none;
    }
  }
`;

const Badge = styled.span<{ $tone?: 'accent' | 'warning' }>`
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: ${({ $tone }) => ($tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-secondary)')};
  background: ${({ $tone }) => ($tone === 'warning' ? 'var(--color-warning-muted)' : 'rgba(148, 176, 204, 0.1)')};
`;

const SideFoot = styled.div`
  margin-top: auto;
  display: grid;
  gap: 10px;
  @media (max-width: 900px) {
    margin: 0 0 0 auto;
    display: flex;
    align-items: center;
  }
`;

const Me = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(9, 12, 17, 0.5);
  > div {
    flex: 1;
    min-width: 0;
  }
  strong {
    display: block;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }
  @media (max-width: 900px) {
    padding: 0;
    border: 0;
    background: none;
    > div {
      display: none;
    }
  }
`;

const EditorLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  border-radius: 9px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
  text-decoration: none;
  &:hover {
    background: rgba(148, 176, 204, 0.07);
    color: var(--color-text-primary);
  }
  @media (max-width: 900px) {
    display: none;
  }
`;

const Main = styled.main`
  position: relative;
  z-index: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
`;

const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 32px 18px;
  background: linear-gradient(180deg, rgba(6, 8, 12, 0.92) 0%, rgba(6, 8, 12, 0.78) 100%);
  backdrop-filter: blur(14px) saturate(1.2);
  border-bottom: 1px solid rgba(148, 176, 204, 0.08);
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: var(--font-weight-bold);
    letter-spacing: -0.01em;
    color: #f2f6fb;
  }
  p {
    margin: 4px 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-md);
  }
  @media (max-width: 900px) {
    padding: 14px 16px 12px;
    h1 {
      font-size: 18px;
    }
  }
`;

const TopActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
`;

const LiveDot = styled.span<{ $live: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(9, 12, 17, 0.6);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $live }) => ($live ? 'var(--color-success)' : 'var(--color-text-muted)')};
  i {
    position: relative;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  ${({ $live }) =>
    $live &&
    css`
      i::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 1px solid currentColor;
        animation: ${ping} 1.6s var(--easing-standard) infinite;
      }
    `}
  @media (max-width: 600px) {
    b {
      display: none;
    }
  }
`;

const Updated = styled.span`
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  @media (max-width: 700px) {
    display: none;
  }
`;

const Spinning = styled.span<{ $on: boolean }>`
  display: inline-grid;
  ${({ $on }) =>
    $on &&
    css`
      animation: ${spin} 900ms linear infinite;
    `}
`;

const Content = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px 32px 56px;
  @media (max-width: 900px) {
    padding: 14px 16px 40px;
  }
`;

const Gate = styled.div`
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, rgba(79, 209, 255, 0.14), transparent 60%),
    #06080c;
`;

const GateCard = styled(Card)`
  width: min(400px, 100%);
  padding: 28px;
  text-align: center;
  h1 {
    margin: 16px 0 6px;
    font-size: 20px;
    color: #f2f6fb;
  }
  p {
    margin: 0 0 22px;
    color: var(--color-text-muted);
    line-height: 1.55;
  }
`;

const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
`;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function useTicker(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore(selectIsAdmin);
  const hydrate = useAuthStore((s) => s.hydrate);
  const authStatus = useAuthStore((s) => s.status);
  const setLoginOpen = useAuthStore((s) => s.setLoginOpen);
  const logout = useAuthStore((s) => s.logout);
  const pushToast = useUiStore((s) => s.pushToast);

  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.slice(1);
  const view: AdminView = (ADMIN_VIEWS as readonly string[]).includes(hash) ? (hash as AdminView) : 'overview';
  const mainRef = useRef<HTMLElement>(null);

  const { data, setData, loaded, refreshing, updatedAt, live, progress, refresh } = useAdminData(isAdmin);
  const now = useTicker(15_000);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.title = `${NAV[view].label} · Admin · OfflineTiles`;
  }, [view]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  const go = useCallback((next: AdminView) => navigate({ hash: next === 'overview' ? '' : next }), [navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const index = Number(e.key) - 1;
      const target = ADMIN_VIEWS[index];
      if (target) {
        e.preventDefault();
        go(target);
      } else if (e.key === 'r') {
        e.preventDefault();
        void refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin, go, refresh]);

  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);

  const cancelJob = useCallback(
    async (job: Generation) => {
      if (!window.confirm(`Cancel "${job.name}"?`)) return;
      try {
        await api.generations.cancel(job.id);
        pushToast({ tone: 'info', title: 'Cancellation requested', message: job.name });
        await refresh();
      } catch (e) {
        toastError('Could not cancel', e);
      }
    },
    [pushToast, refresh],
  );

  if (authStatus === 'idle' || authStatus === 'loading') {
    return (
      <Gate>
        <Spinner size={22} />
      </Gate>
    );
  }

  if (!isAdmin) {
    return (
      <Gate>
        <GateCard>
          <LogoMark size={40} />
          <h1>Admin console</h1>
          <p>
            {user && user.role !== 'guest'
              ? `You're signed in as ${displayName(user)}, which isn't an admin account.`
              : 'Sign in with the admin account to manage users, limits, the render queue and contact submissions.'}
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <Button variant="primary" size="lg" block onClick={() => setLoginOpen(true)}>
              Sign in as admin
            </Button>
            <Button variant="ghost" block onClick={() => navigate('/editor')}>
              Back to editor
            </Button>
          </div>
        </GateCard>
        <LoginModal />
        <ToastStack />
      </Gate>
    );
  }

  const accounts = data.users.filter((u) => u.role !== 'guest').length;
  const subtitle: Record<AdminView, string> = {
    overview: `${greeting()}, ${user ? displayName(user) : 'admin'}. ${
      data.current ? `1 job rendering, ${data.queue.length} waiting.` : data.queue.length ? `${data.queue.length} jobs waiting.` : 'The renderer is idle.'
    }`,
    queue: `${data.current ? '1 rendering' : 'Renderer idle'} · ${data.queue.length} waiting · ${data.history.length} recent`,
    users: `${data.users.length} people · ${accounts} accounts · ${data.users.length - accounts} guests`,
    limits: 'Default quotas for guests and dedicated users.',
    contacts: `${data.interestTotal} submissions from the landing page contact form.`,
  };
  const badges: Partial<Record<AdminView, ReactNode>> = {
    queue: data.queue.length + (data.current ? 1 : 0) > 0 && (
      <Badge $tone="warning">{data.queue.length + (data.current ? 1 : 0)}</Badge>
    ),
    users: data.users.length > 0 && <Badge>{data.users.length}</Badge>,
    contacts: data.interestTotal > 0 && <Badge>{data.interestTotal}</Badge>,
  };
  const View = NAV[view].view;

  return (
    <Shell>
      <Sidebar>
        <Brand to="/" aria-label="OfflineTiles home">
          <LogoMark size={26} />
          <div>
            <Wordmark height={10} />
            <small>Admin console</small>
          </div>
        </Brand>

        <div>
          <NavLabel>Manage</NavLabel>
          <Nav aria-label="Admin sections">
            {ADMIN_VIEWS.map((key, i) => (
              <NavItem key={key} $active={view === key} onClick={() => go(key)} aria-current={view === key ? 'page' : undefined}>
                {NAV[key].icon}
                <span>{NAV[key].label}</span>
                {badges[key] || <kbd>{i + 1}</kbd>}
              </NavItem>
            ))}
          </Nav>
        </div>

        <SideFoot>
          <EditorLink to="/editor">
            Open editor <IconChevronRight size={14} />
          </EditorLink>
          <Me>
            {user && <Avatar name={displayName(user)} role={user.role} size={32} />}
            <div>
              <strong>{user ? displayName(user) : 'Admin'}</strong>
              <small>Administrator</small>
            </div>
            <IconButton label="Sign out" size="sm" tooltipSide="top" onClick={() => void logout()}>
              <IconLogout />
            </IconButton>
          </Me>
        </SideFoot>
      </Sidebar>

      <Main ref={mainRef}>
        <TopBar>
          <div style={{ minWidth: 0 }}>
            <h1>{NAV[view].label}</h1>
            <p>{subtitle[view]}</p>
          </div>
          <TopActions>
            <Updated title="Data refreshes automatically">{updatedAt ? `updated ${formatRelative(new Date(updatedAt).toISOString(), now)}` : ''}</Updated>
            <LiveDot $live={live} title={live ? 'Receiving live updates' : 'Live updates disconnected — polling every 30s'}>
              <i />
              <b>{live ? 'Live' : 'Offline'}</b>
            </LiveDot>
            <IconButton label="Refresh (R)" onClick={() => void refresh()} disabled={refreshing}>
              <Spinning $on={refreshing}>
                <IconRetry />
              </Spinning>
            </IconButton>
          </TopActions>
        </TopBar>

        <Content key={view}>
          {loaded ? (
            <View
              data={data}
              setData={setData}
              loaded={loaded}
              progress={progress}
              refresh={refresh}
              go={go}
              userById={userById}
              cancelJob={cancelJob}
            />
          ) : (
            <SkeletonGrid>
              {Array.from({ length: 6 }, (_, i) => (
                <Card key={i} $delay={i * 40}>
                  <Skeleton $w="40%" $h="10px" />
                  <Skeleton $w="60%" $h="26px" style={{ marginTop: 14 }} />
                  <Skeleton $w="80%" $h="10px" style={{ marginTop: 12 }} />
                </Card>
              ))}
            </SkeletonGrid>
          )}
        </Content>
      </Main>

      <LoginModal />
      <ToastStack />
    </Shell>
  );
}
