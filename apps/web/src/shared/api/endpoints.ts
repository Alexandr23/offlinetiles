import type {
  AdminQueueResponse,
  AdminUsersResponse,
  AuthSessionResponse,
  AuthUser,
  CreateInterestRequest,
  CreateStyleRequest,
  CreateUserRequest,
  DatasetInfo,
  Generation,
  GenerationDetail,
  GenerationEstimate,
  GenerationEstimateRequest,
  GenerationListResponse,
  GenerationRequest,
  InterestListResponse,
  LoginRequest,
  MapStyle,
  RoleLimits,
  UpdateRoleLimitsRequest,
  UpdateStyleRequest,
  UpdateUserLimitsRequest,
} from '@map-exporter/contracts';
import { API_BASE, getAuthToken, http } from './client';

export const api = {
  auth: {
    guest: () => http.post<AuthSessionResponse>('/api/auth/guest'),
    login: (body: LoginRequest) => http.post<AuthSessionResponse>('/api/auth/login', body),
    logout: () => http.post<void>('/api/auth/logout'),
    me: (signal?: AbortSignal) => http.get<AuthUser>('/api/auth/me', signal),
  },
  admin: {
    users: () => http.get<AdminUsersResponse>('/api/admin/users'),
    createUser: (body: CreateUserRequest) => http.post<AuthUser>('/api/admin/users', body),
    updateUserLimits: (id: string, body: UpdateUserLimitsRequest) =>
      http.patch<AuthUser>(`/api/admin/users/${id}/limits`, body),
    resetUsage: (id: string) => http.post<AuthUser>(`/api/admin/users/${id}/reset-usage`),
    updateRoleLimits: (role: 'guest' | 'user', body: UpdateRoleLimitsRequest) =>
      http.patch<RoleLimits>(`/api/admin/role-limits/${role}`, body),
    queue: () => http.get<AdminQueueResponse>('/api/admin/queue'),
    interest: (limit = 200) => http.get<InterestListResponse>(`/api/admin/interest?limit=${limit}`),
    deleteInterest: (id: string) => http.delete(`/api/admin/interest/${id}`),
  },
  interest: {
    submit: (body: CreateInterestRequest) => http.post<{ id: string }>('/api/interest', body),
  },
  dataset: {
    get: (signal?: AbortSignal) => http.get<DatasetInfo>('/api/dataset', signal),
  },
  styles: {
    list: () => http.get<{ styles: MapStyle[] }>('/api/styles').then((r) => r.styles),
    get: (id: string) => http.get<MapStyle>(`/api/styles/${id}`),
    create: (body: CreateStyleRequest) => http.post<MapStyle>('/api/styles', body),
    update: (id: string, body: UpdateStyleRequest) => http.put<MapStyle>(`/api/styles/${id}`, body),
    delete: (id: string) => http.delete(`/api/styles/${id}`),
    duplicate: (id: string, name?: string) => http.post<MapStyle>(`/api/styles/${id}/duplicate`, { name }),
    validate: (style: unknown) => http.post<{ valid: boolean; issues: { message: string }[] }>('/api/styles/validate', style),
  },
  generations: {
    list: (signal?: AbortSignal) => http.get<GenerationListResponse>('/api/generations?historyLimit=100', signal),
    get: (id: string) => http.get<GenerationDetail>(`/api/generations/${id}`),
    estimate: (body: GenerationEstimateRequest, signal?: AbortSignal) =>
      http.post<GenerationEstimate>('/api/generations/estimate', body, signal),
    create: (body: GenerationRequest) => http.post<Generation>('/api/generations', body),
    delete: (id: string) => http.delete(`/api/generations/${id}`),
    retry: (id: string) => http.post<Generation>(`/api/generations/${id}/retry`),
    cancel: (id: string) => http.post<Generation>(`/api/generations/${id}/cancel`),
    downloadUrl: (id: string) => {
      const token = getAuthToken();
      const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
      return `${API_BASE}/api/generations/${id}/download${q}`;
    },
  },
  events: {
    url: () => `${API_BASE}/api/events`,
  },
};
