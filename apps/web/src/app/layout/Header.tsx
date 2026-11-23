import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { selectIsAdmin, useAuthStore } from '@/modules/auth/auth.store';
import { IconButton } from '@/shared/components/IconButton';
import { IconDashboard, IconLogout, IconUser } from '@/shared/components/Icons';
import {
  mapOverlayRadius,
  mapOverlaySurface,
  mapOverlayText,
} from '@/shared/styles/overlay';

const Brand = styled(Link)`
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: var(--z-map-overlay);
  display: inline-flex;
  text-decoration: none !important;
  transition: opacity var(--duration-fast) var(--easing-standard);
  &:hover {
    opacity: 0.8;
  }
`;

const Wordmark = styled.span`
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.2em;
  line-height: 1;
  color: #0b1220;
  user-select: none;
  white-space: nowrap;
  text-shadow:
    -1.5px -1.5px 0 rgba(255, 255, 255, 0.95),
    1.5px -1.5px 0 rgba(255, 255, 255, 0.95),
    -1.5px 1.5px 0 rgba(255, 255, 255, 0.95),
    1.5px 1.5px 0 rgba(255, 255, 255, 0.95),
    -2px 0 0 rgba(255, 255, 255, 0.95),
    2px 0 0 rgba(255, 255, 255, 0.95),
    0 -2px 0 rgba(255, 255, 255, 0.95),
    0 2px 0 rgba(255, 255, 255, 0.95),
    0 0 10px rgba(255, 255, 255, 0.85),
    0 0 18px rgba(255, 255, 255, 0.55);
`;

const Dock = styled.div`
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: var(--z-map-overlay);
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Root = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 30px;
  padding: 2px;
  box-sizing: border-box;
  border-radius: ${mapOverlayRadius};
  ${mapOverlaySurface}

  button,
  a {
    width: 24px !important;
    height: 24px !important;
    flex-shrink: 0;
    border-radius: 4px;
    color: ${mapOverlayText};
  }
  button:hover:not(:disabled),
  a:hover {
    color: ${mapOverlayText};
  }
  button svg,
  a svg {
    width: 14px !important;
    height: 14px !important;
  }
`;

const DashBtn = styled(Link)`
  display: inline-grid;
  place-items: center;
  text-decoration: none !important;
  background: transparent;
  border: 1px solid transparent;
  transition: background var(--duration-fast) var(--easing-standard);
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`;

/** Floating brand mark over the map. */
export function Header() {
  return (
    <Brand to="/" aria-label="Offline Tiles home">
      <Wordmark>OFFLINE TILES</Wordmark>
    </Brand>
  );
}

/** Bottom-left account dock: dashboard (admin) above user actions. */
export function AccountBar() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore(selectIsAdmin);
  const setLoginOpen = useAuthStore((s) => s.setLoginOpen);
  const logout = useAuthStore((s) => s.logout);
  const role = user?.role ?? 'guest';
  const label = user?.login ?? (role === 'guest' ? 'Guest' : role);

  return (
    <Dock>
      {isAdmin && (
        <Root role="toolbar" aria-label="Admin">
          <DashBtn to="/admin" aria-label="Dashboard" title="Dashboard">
            <IconDashboard size={14} />
          </DashBtn>
        </Root>
      )}
      <Root role="toolbar" aria-label="Account">
        {role === 'guest' ? (
          <IconButton size="sm" label="Sign in" tooltipSide="right" onClick={() => setLoginOpen(true)}>
            <IconUser />
          </IconButton>
        ) : (
          <>
            <IconButton size="sm" label={label} tooltipSide="right" aria-label={`Signed in as ${label}`}>
              <IconUser />
            </IconButton>
            <IconButton size="sm" label="Sign out" tooltipSide="right" onClick={() => void logout()}>
              <IconLogout />
            </IconButton>
          </>
        )}
      </Root>
    </Dock>
  );
}
