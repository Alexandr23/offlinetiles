import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

export type RightTab = 'generate' | 'history';
/** Sub-view of the Generate tab: generation form vs style editor. */
export type GenerateView = 'generate' | 'style';

interface UiState {
  toasts: Toast[];
  rightTab: RightTab;
  generateView: GenerateView;
  rightPanelOpen: boolean;
  saveStyleDialogOpen: boolean;
  renameStyleId: string | null;
  sseConnected: boolean;
  apiReachable: boolean;

  pushToast: (toast: Omit<Toast, 'id'>, ttlMs?: number) => void;
  dismissToast: (id: number) => void;
  setRightTab: (tab: RightTab) => void;
  setGenerateView: (view: GenerateView) => void;
  toggleRightPanel: () => void;
  setSaveStyleDialogOpen: (open: boolean) => void;
  setRenameStyleId: (id: string | null) => void;
  setSseConnected: (connected: boolean) => void;
  setApiReachable: (reachable: boolean) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  rightTab: 'generate',
  generateView: 'generate',
  rightPanelOpen: true,
  saveStyleDialogOpen: false,
  renameStyleId: null,
  sseConnected: false,
  apiReachable: true,

  pushToast: (toast, ttlMs = 5000) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...toast, id }] }));
    if (ttlMs > 0) {
      globalThis.setTimeout(() => get().dismissToast(id), ttlMs);
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setRightTab: (rightTab) => set({ rightTab, rightPanelOpen: true }),
  setGenerateView: (generateView) => set({ generateView, rightTab: 'generate', rightPanelOpen: true }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSaveStyleDialogOpen: (saveStyleDialogOpen) => set({ saveStyleDialogOpen }),
  setRenameStyleId: (renameStyleId) => set({ renameStyleId }),
  setSseConnected: (sseConnected) => set({ sseConnected }),
  setApiReachable: (apiReachable) => set({ apiReachable }),
}));

export function toastError(title: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  useUiStore.getState().pushToast({ tone: 'error', title, message }, 7000);
}
