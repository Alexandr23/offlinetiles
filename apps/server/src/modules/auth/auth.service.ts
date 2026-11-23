import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AuthSessionResponse,
  AuthUser,
  CreateUserRequest,
  EffectiveLimits,
  LoginRequest,
  RoleLimits,
  UpdateRoleLimitsRequest,
  UpdateUserLimitsRequest,
} from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logging/logger.js';
import { hashPassword, hashToken, verifyPassword } from './password.js';
import { rowToAuthUser, type UserRow, type UsersRepository } from './users.repository.js';

export interface AuthContext {
  user: AuthUser;
  userRow: UserRow;
  token: string | null;
}

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersRepository,
    private readonly logger: Logger,
  ) {}

  async ensureAdmin(): Promise<void> {
    const existing = await this.users.findByLogin(this.config.adminLogin);
    const passwordHash = await hashPassword(this.config.adminPassword);
    if (!existing) {
      await this.users.insertCredentialed({
        id: randomUUID(),
        role: 'admin',
        login: this.config.adminLogin,
        passwordHash,
        displayName: 'Administrator',
      });
      this.logger.info({ login: this.config.adminLogin }, 'admin user created');
      return;
    }
    if (existing.role !== 'admin') {
      throw new Error(`Configured admin login "${this.config.adminLogin}" is already taken by a non-admin user`);
    }
    // Keep admin password in sync with env on startup (local/dev convenience).
    await this.users.updatePassword(existing.id, passwordHash);
  }

  async createGuestSession(): Promise<AuthSessionResponse> {
    const id = randomUUID();
    const row = await this.users.insertGuest(id);
    const roleLimits = await this.users.roleLimitsMap();
    const user = rowToAuthUser(row, roleLimits);
    const token = await this.issueToken(row.id);
    return { token, user };
  }

  async login(input: LoginRequest): Promise<AuthSessionResponse> {
    const row = await this.users.findByLogin(input.login);
    if (!row || !row.password_hash || row.role === 'guest') {
      throw AppError.unauthorized('Invalid login or password');
    }
    const ok = await verifyPassword(input.password, row.password_hash);
    if (!ok) throw AppError.unauthorized('Invalid login or password');
    await this.users.touch(row.id);
    const roleLimits = await this.users.roleLimitsMap();
    const user = rowToAuthUser(row, roleLimits);
    const token = await this.issueToken(row.id);
    return { token, user };
  }

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await this.users.deleteSessionByTokenHash(hashToken(token));
  }

  async resolveToken(token: string | null | undefined): Promise<AuthContext | null> {
    if (!token) return null;
    const session = await this.users.findSessionByTokenHash(hashToken(token));
    if (!session) return null;
    await this.users.touch(session.user.id);
    const roleLimits = await this.users.roleLimitsMap();
    return {
      user: rowToAuthUser(session.user, roleLimits),
      userRow: session.user,
      token,
    };
  }

  async me(ctx: AuthContext): Promise<AuthUser> {
    const fresh = await this.users.findById(ctx.user.id);
    if (!fresh) throw AppError.unauthorized('Session expired');
    const roleLimits = await this.users.roleLimitsMap();
    return rowToAuthUser(fresh, roleLimits);
  }

  async createUser(input: CreateUserRequest): Promise<AuthUser> {
    const existing = await this.users.findByLogin(input.login);
    if (existing) throw AppError.conflict(`Login "${input.login}" is already taken`);
    const passwordHash = await hashPassword(input.password);
    const row = await this.users.insertCredentialed({
      id: randomUUID(),
      role: 'user',
      login: input.login,
      passwordHash,
      displayName: input.displayName ?? input.login,
    });
    const roleLimits = await this.users.roleLimitsMap();
    return rowToAuthUser(row, roleLimits);
  }

  async listUsers() {
    const users = await this.users.listAdminUsers();
    const roleLimits = await this.users.listRoleLimits();
    return { users, roleLimits };
  }

  async updateRoleLimits(role: 'guest' | 'user', patch: UpdateRoleLimitsRequest): Promise<RoleLimits> {
    return this.users.updateRoleLimits(role, patch);
  }

  async updateUserLimits(userId: string, patch: UpdateUserLimitsRequest): Promise<AuthUser> {
    const row = await this.users.updateUserLimits(userId, patch);
    if (!row) throw AppError.notFound('User', userId);
    const roleLimits = await this.users.roleLimitsMap();
    return rowToAuthUser(row, roleLimits);
  }

  async resetUserUsage(userId: string): Promise<AuthUser> {
    const existing = await this.users.findById(userId);
    if (!existing) throw AppError.notFound('User', userId);
    if (existing.role === 'admin') throw AppError.conflict('Admin usage is always unlimited');
    const row = await this.users.resetUsage(userId);
    if (!row) throw AppError.notFound('User', userId);
    const roleLimits = await this.users.roleLimitsMap();
    return rowToAuthUser(row, roleLimits);
  }

  async consumeGeneration(userId: string): Promise<EffectiveLimits> {
    const row = await this.users.incrementGenerationsUsed(userId);
    if (!row) throw AppError.notFound('User', userId);
    const roleLimits = await this.users.roleLimitsMap();
    return rowToAuthUser(row, roleLimits).limits;
  }

  async assertCanGenerate(user: AuthUser, tiles: number, areaKm2: number): Promise<void> {
    if (user.limits.unlimited) return;

    if (user.limits.generationsRemaining !== null && user.limits.generationsRemaining <= 0) {
      throw new AppError(
        'GENERATION_LIMIT_EXCEEDED',
        `Generation limit reached (${user.limits.maxGenerations}). Sign in or wait for an admin reset.`,
        403,
        { limits: user.limits },
      );
    }

    if (user.limits.maxTiles !== null && tiles > user.limits.maxTiles) {
      throw new AppError(
        'TILE_LIMIT_EXCEEDED',
        `Generation of ${tiles.toLocaleString()} tiles exceeds your limit of ${user.limits.maxTiles.toLocaleString()}`,
        400,
        { tiles, maxTiles: user.limits.maxTiles, limits: user.limits },
      );
    }

    if (user.limits.maxAreaKm2 !== null && areaKm2 > user.limits.maxAreaKm2) {
      throw new AppError(
        'AREA_LIMIT_EXCEEDED',
        `Selected area of ${areaKm2.toFixed(2)} km² exceeds your limit of ${user.limits.maxAreaKm2.toFixed(2)} km²`,
        400,
        { areaKm2, maxAreaKm2: user.limits.maxAreaKm2, limits: user.limits },
      );
    }
  }

  private async issueToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000);
    await this.users.createSession({
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    });
    return token;
  }
}

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}
