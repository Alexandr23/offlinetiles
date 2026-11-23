import { GeneratePanel } from '@/modules/generate/components/GeneratePanel';
import { HistoryPanel } from '@/modules/history/HistoryPanel';
import { useQueueStore } from '@/modules/queue/queue.store';
import { StyleForm } from '@/modules/style-editor/components/StyleForm';
import { useUiStore } from '@/modules/ui/ui.store';
import { Panel } from '@/shared/components/Panel';
import { Tabs } from '@/shared/components/Tabs';

export function RightPanel() {
  const tab = useUiStore((s) => s.rightTab);
  const generateView = useUiStore((s) => s.generateView);
  const setTab = useUiStore((s) => s.setRightTab);
  const historyCount = useQueueStore((s) => s.history.length);

  return (
    <Panel aria-label="Generate">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'generate', label: 'Generate' },
          { value: 'history', label: 'History', count: historyCount },
        ]}
      />
      {tab === 'generate' && (generateView === 'style' ? <StyleForm /> : <GeneratePanel />)}
      {tab === 'history' && <HistoryPanel />}
    </Panel>
  );
}
