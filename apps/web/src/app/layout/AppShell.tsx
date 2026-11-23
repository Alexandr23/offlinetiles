import { useEffect } from 'react';
import styled from 'styled-components';
import { LoginModal } from '@/modules/auth/LoginModal';
import { useAuthStore } from '@/modules/auth/auth.store';
import { useDatasetStore } from '@/modules/dataset/dataset.store';
import { InitRequiredScreen } from '@/modules/dataset/InitRequiredScreen';
import { DrawingToolbar } from '@/modules/drawing/DrawingToolbar';
import { useTerraDraw } from '@/modules/drawing/useTerraDraw';
import { useEstimate } from '@/modules/generate/useEstimate';
import { MapView } from '@/modules/map/MapView';
import { useEventStream } from '@/modules/queue/useEventStream';
import { useQueueStore } from '@/modules/queue/queue.store';
import { RenameStyleDialog, SaveStyleDialog } from '@/modules/style-editor/components/StyleDialogs';
import { useStyleStore } from '@/modules/style-editor/style.store';
import { ToastStack } from '@/shared/components/Toast';
import { mapOverlayRadius, mapOverlaySurface } from '@/shared/styles/overlay';
import { AccountBar, Header } from './Header';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';

const PANEL_GAP = '12px';

const Grid = styled.div`
  position: relative;
  height: 100%;
  background: var(--color-background);
`;

const MapArea = styled.main`
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
`;

const Right = styled.aside`
  position: absolute;
  top: ${PANEL_GAP};
  right: ${PANEL_GAP};
  bottom: ${PANEL_GAP};
  width: var(--layout-right-panel-width);
  z-index: var(--z-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: ${mapOverlayRadius};
  ${mapOverlaySurface}

  > * {
    flex: 1;
    min-height: 0;
    width: 100%;
    background: transparent;
    border-color: transparent;
  }
`;

export function AppShell() {
  const datasetStatus = useDatasetStore((s) => s.status);
  const info = useDatasetStore((s) => s.info);
  const error = useDatasetStore((s) => s.error);
  const load = useDatasetStore((s) => s.load);
  const ready = info?.ready === true;
  const authStatus = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Refresh own jobs/styles when the signed-in identity changes (guest → user/admin).
  useEffect(() => {
    if (!userId) return;
    void useQueueStore.getState().refresh();
    void useStyleStore.getState().loadSaved();
  }, [userId]);

  // The event stream is independent of the dataset: styles, queue and history
  // are live even before a master dataset exists.
  useEventStream(authStatus === 'ready');
  useTerraDraw();
  useEstimate();

  return (
    <Grid>
      <MapArea>
        {ready && <MapView />}
        {ready && <DrawingToolbar />}
        <Header />
        <AccountBar />
        <StatusBar />
        {!ready && (
          <InitRequiredScreen
            info={info}
            error={error}
            onRetry={() => void load()}
            loading={datasetStatus === 'idle' || datasetStatus === 'loading'}
          />
        )}
      </MapArea>
      <Right>
        <RightPanel />
      </Right>
      <ToastStack />
      <SaveStyleDialog />
      <RenameStyleDialog />
      <LoginModal />
    </Grid>
  );
}
