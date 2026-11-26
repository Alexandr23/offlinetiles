import type { AdminUserRow, Generation, GenerationProgress } from '@map-exporter/contracts';
import type { Dispatch, SetStateAction } from 'react';
import type { AdminData } from './useAdminData';

export const ADMIN_VIEWS = ['overview', 'queue', 'users', 'limits', 'contacts'] as const;
export type AdminView = (typeof ADMIN_VIEWS)[number];

export interface AdminViewProps {
  data: AdminData;
  setData: Dispatch<SetStateAction<AdminData>>;
  loaded: boolean;
  progress: GenerationProgress | null;
  refresh: () => Promise<void>;
  go: (view: AdminView) => void;
  userById: ReadonlyMap<string, AdminUserRow>;
  cancelJob: (job: Generation) => Promise<void>;
}
