import type { AuthUser } from '@map-exporter/contracts';
import { create } from 'zustand';
import { api } from '@/shared/api/endpoints';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/shared/api/client';

interface AuthState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  user: AuthUser | null;
  loginOpen: boolean;

  /** Restore session from a stored token only — never creates a guest. */
  hydrate: () => Promise<void>;
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  ensureGuest: () => Promise<void>;
  setLoginOpen: (open: boolean) => void;
}

/**
 * Session lives in localStorage (`me_auth_token`). Guests are created lazily on
 * editor bootstrap so remaining-generation counts are available before first generation.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,
  loginOpen: false,

  hydrate: async () => {
    if (!getAuthToken()) {
      if (get().status === 'idle') set({ status: 'ready', user: null });
      return;
    }
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const user = await api.auth.me();
      set({ user, status: 'ready' });
    } catch {
      clearAuthToken();
      set({ user: null, status: 'ready' });
    }
  },

  bootstrap: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      if (getAuthToken()) {
        const user = await api.auth.me();
        set({ user, status: 'ready' });
        return;
      }
      await get().ensureGuest();
    } catch {
      clearAuthToken();
      try {
        await get().ensureGuest();
      } catch {
        set({ user: null, status: 'error' });
      }
    }
  },

  refresh: async () => {
    if (!getAuthToken()) return;
    try {
      const user = await api.auth.me();
      set({ user, status: 'ready' });
    } catch {
      // keep existing user snapshot on transient failures
    }
  },

  ensureGuest: async () => {
    const session = await api.auth.guest();
    setAuthToken(session.token);
    set({ user: session.user, status: 'ready' });
  },

  login: async (login, password) => {
    const session = await api.auth.login({ login, password });
    setAuthToken(session.token);
    set({ user: session.user, status: 'ready', loginOpen: false });
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore – local session is cleared regardless
    }
    clearAuthToken();
    set({ user: null, status: 'loading' });
    await get().ensureGuest();
  },

  setLoginOpen: (loginOpen) => set({ loginOpen }),
}));

export const selectGenerationsRemaining = (s: AuthState): number | null =>
  s.user?.limits.generationsRemaining ?? null;

export const selectIsAdmin = (s: AuthState): boolean => s.user?.role === 'admin';

/** True for dedicated user / admin sessions (not anonymous guests). */
export const selectIsSignedIn = (s: AuthState): boolean =>
  s.user?.role === 'user' || s.user?.role === 'admin';

export const selectCanGenerate = (s: AuthState): boolean => {
  const limits = s.user?.limits;
  if (!limits) return false;
  if (limits.unlimited) return true;
  return (limits.generationsRemaining ?? 0) > 0;
};
