import { z } from 'zod';

export const UserRoleSchema = z.enum(['guest', 'user', 'admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const LoginRequestSchema = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateUserRequestSchema = z.object({
  login: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'login must be alphanumeric (dots, underscores, hyphens allowed)'),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.literal('user').default('user'),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const RoleLimitsSchema = z.object({
  role: z.enum(['guest', 'user']),
  maxGenerations: z.number().int().min(0),
  maxTiles: z.number().int().min(0),
  maxAreaKm2: z.number().min(0),
});
export type RoleLimits = z.infer<typeof RoleLimitsSchema>;

export const UpdateRoleLimitsRequestSchema = z.object({
  maxGenerations: z.number().int().min(0).optional(),
  maxTiles: z.number().int().min(0).optional(),
  maxAreaKm2: z.number().min(0).optional(),
});
export type UpdateRoleLimitsRequest = z.infer<typeof UpdateRoleLimitsRequestSchema>;

export const UpdateUserLimitsRequestSchema = z.object({
  maxGenerations: z.number().int().min(0).nullable().optional(),
  maxTiles: z.number().int().min(0).nullable().optional(),
  maxAreaKm2: z.number().min(0).nullable().optional(),
});
export type UpdateUserLimitsRequest = z.infer<typeof UpdateUserLimitsRequestSchema>;

/** Effective limits after resolving role defaults + per-user overrides. */
export interface EffectiveLimits {
  maxGenerations: number | null;
  maxTiles: number | null;
  maxAreaKm2: number | null;
  generationsUsed: number;
  generationsRemaining: number | null;
  unlimited: boolean;
}

export interface AuthUser {
  id: string;
  role: UserRole;
  login: string | null;
  displayName: string | null;
  limits: EffectiveLimits;
  createdAt: string;
  lastSeenAt: string;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
}

export interface AdminUserRow {
  id: string;
  role: UserRole;
  login: string | null;
  displayName: string | null;
  generationsUsed: number;
  generationCount: number;
  limits: EffectiveLimits;
  /** Per-user overrides (null = inherit role default). */
  overrides: {
    maxGenerations: number | null;
    maxTiles: number | null;
    maxAreaKm2: number | null;
  };
  createdAt: string;
  lastSeenAt: string;
}

export interface AdminUsersResponse {
  users: AdminUserRow[];
  roleLimits: RoleLimits[];
}

export interface AdminQueueResponse {
  current: import('./generation.js').Generation | null;
  queue: import('./generation.js').Generation[];
  history: import('./generation.js').Generation[];
}
