import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from './ui.store';

describe('ui store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.setState({
      toasts: [],
      rightTab: 'generate',
      generateView: 'generate',
      rightPanelOpen: true,
      saveStyleDialogOpen: false,
      renameStyleId: null,
      sseConnected: false,
      apiReachable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the right panel when switching tabs', () => {
    useUiStore.setState({ rightPanelOpen: false });
    useUiStore.getState().setRightTab('history');
    expect(useUiStore.getState()).toMatchObject({ rightTab: 'history', rightPanelOpen: true });
  });

  it('opens style view on the generate tab', () => {
    useUiStore.setState({ rightPanelOpen: false, rightTab: 'history', generateView: 'generate' });
    useUiStore.getState().setGenerateView('style');
    expect(useUiStore.getState()).toMatchObject({
      generateView: 'style',
      rightTab: 'generate',
      rightPanelOpen: true,
    });
  });

  it('caps the toast stack and dismisses after ttl', () => {
    const { pushToast } = useUiStore.getState();
    for (let i = 0; i < 6; i++) pushToast({ tone: 'info', title: `t${i}` }, 1000);
    expect(useUiStore.getState().toasts).toHaveLength(5);
    expect(useUiStore.getState().toasts[0]?.title).toBe('t1');
    vi.advanceTimersByTime(1000);
    expect(useUiStore.getState().toasts).toEqual([]);
  });
});
