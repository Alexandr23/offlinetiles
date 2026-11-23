import type {
  AdminUserRow,
  AuthUser,
  EffectiveLimits,
  RoleLimits,
  UserRole,
} from '@map-exporter/contracts';
import type { Db } from '../../db/client.js';

export interface UserRow {
  id: string;
  role: UserRole;
  login: string | null;
  password_hash: string | null;
  display_name: string | null;
  max_generations: number | null;
  max_tiles: number | string | null;
  max_area_km2: number | null;
  generations_used: number;
  created_at: Date;
  last_seen_at: Date;
}

export interface RoleLimitsRow {
  role: 'guest' | 'user';
  max_generations: number;
  max_tiles: number | string;
  max_area_km2: number;
  updated_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

export function resolveLimits(
  role: UserRole,
  used: number,
  overrides: { maxGenerations: number | null; maxTiles: number | null; maxAreaKm2: number | null },
  roleLimits: Map<'guest' | 'user', RoleLimits>,
): EffectiveLimits {
  if (role === 'admin') {
    return {
      maxGenerations: null,
      maxTiles: null,
      maxAreaKm2: null,
      generationsUsed: used,
      generationsRemaining: null,
      unlimited: true,
    };
  }
  const defaults = roleLimits.get(role)!;
  const maxGenerations = overrides.maxGenerations ?? defaults.maxGenerations;
  const maxTiles = overrides.maxTiles ?? defaults.maxTiles;
  const maxAreaKm2 = overrides.maxAreaKm2 ?? defaults.maxAreaKm2;
  return {
    maxGenerations,
    maxTiles,
    maxAreaKm2,
    generationsUsed: used,
    generationsRemaining: Math.max(0, maxGenerations - used),
    unlimited: false,
  };
}

export function rowToAuthUser(row: UserRow, roleLimits: Map<'guest' | 'user', RoleLimits>): AuthUser {
  const overrides = {
    maxGenerations: row.max_generations,
    maxTiles: num(row.max_tiles),
    maxAreaKm2: row.max_area_km2,
  };
  return {
    id: row.id,
    role: row.role,
    login: row.login,
    displayName: row.display_name,
    limits: resolveLimits(row.role, row.generations_used, overrides, roleLimits),
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

export class UsersRepository {
  constructor(private readonly db: Db) {}

  async listRoleLimits(): Promise<RoleLimits[]> {
    const rows = await this.db<RoleLimitsRow[]>`
      SELECT role, max_generations, max_tiles, max_area_km2, updated_at
      FROM role_limits
      ORDER BY role ASC
    `;
    return rows.map((r) => ({
      role: r.role,
      maxGenerations: r.max_generations,
      maxTiles: Number(r.max_tiles),
      maxAreaKm2: r.max_area_km2,
    }));
  }

  async roleLimitsMap(): Promise<Map<'guest' | 'user', RoleLimits>> {
    const list = await this.listRoleLimits();
    return new Map(list.map((l) => [l.role, l]));
  }

  async updateRoleLimits(
    role: 'guest' | 'user',
    patch: { maxGenerations?: number; maxTiles?: number; maxAreaKm2?: number },
  ): Promise<RoleLimits> {
    const rows = await this.db<RoleLimitsRow[]>`
      UPDATE role_limits
      SET
        max_generations = ${patch.maxGenerations === undefined ? this.db`max_generations` : patch.maxGenerations},
        max_tiles = ${patch.maxTiles === undefined ? this.db`max_tiles` : patch.maxTiles},
        max_area_km2 = ${patch.maxAreaKm2 === undefined ? this.db`max_area_km2` : patch.maxAreaKm2},
        updated_at = NOW()
      WHERE role = ${role}
      RETURNING role, max_generations, max_tiles, max_area_km2, updated_at
    `;
    const row = rows[0]!;
    return {
      role: row.role,
      maxGenerations: row.max_generations,
      maxTiles: Number(row.max_tiles),
      maxAreaKm2: row.max_area_km2,
    };
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.db<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
    return rows[0] ?? null;
  }

  async findByLogin(login: string): Promise<UserRow | null> {
    const rows = await this.db<UserRow[]>`SELECT * FROM users WHERE lower(login) = lower(${login})`;
    return rows[0] ?? null;
  }

  async insertGuest(id: string): Promise<UserRow> {
    const rows = await this.db<UserRow[]>`
      INSERT INTO users (id, role, login, password_hash, display_name)
      VALUES (${id}, 'guest', NULL, NULL, NULL)
      RETURNING *
    `;
    return rows[0]!;
  }

  async insertCredentialed(input: {
    id: string;
    role: 'user' | 'admin';
    login: string;
    passwordHash: string;
    displayName: string | null;
  }): Promise<UserRow> {
    const rows = await this.db<UserRow[]>`
      INSERT INTO users (id, role, login, password_hash, display_name)
      VALUES (${input.id}, ${input.role}, ${input.login}, ${input.passwordHash}, ${input.displayName})
      RETURNING *
    `;
    return rows[0]!;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}`;
  }

  async touch(id: string): Promise<void> {
    await this.db`UPDATE users SET last_seen_at = NOW() WHERE id = ${id}`;
  }

  async incrementGenerationsUsed(id: string): Promise<UserRow | null> {
    const rows = await this.db<UserRow[]>`
      UPDATE users SET generations_used = generations_used + 1, last_seen_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async resetUsage(id: string): Promise<UserRow | null> {
    const rows = await this.db<UserRow[]>`
      UPDATE users SET generations_used = 0, last_seen_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async updateUserLimits(
    id: string,
    patch: {
      maxGenerations?: number | null;
      maxTiles?: number | null;
      maxAreaKm2?: number | null;
    },
  ): Promise<UserRow | null> {
    const rows = await this.db<UserRow[]>`
      UPDATE users
      SET
        max_generations = ${
          patch.maxGenerations === undefined ? this.db`max_generations` : patch.maxGenerations
        },
        max_tiles = ${patch.maxTiles === undefined ? this.db`max_tiles` : patch.maxTiles},
        max_area_km2 = ${patch.maxAreaKm2 === undefined ? this.db`max_area_km2` : patch.maxAreaKm2},
        last_seen_at = NOW()
      WHERE id = ${id} AND role <> 'admin'
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async listAdminUsers(): Promise<AdminUserRow[]> {
    const roleLimits = await this.roleLimitsMap();
    const rows = await this.db<(UserRow & { generation_count: number | string })[]>`
      SELECT u.*,
        (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id) AS generation_count
      FROM users u
      ORDER BY
        CASE u.role WHEN 'admin' THEN 0 WHEN 'user' THEN 1 ELSE 2 END,
        u.created_at DESC
    `;
    return rows.map((row) => {
      const overrides = {
        maxGenerations: row.max_generations,
        maxTiles: num(row.max_tiles),
        maxAreaKm2: row.max_area_km2,
      };
      return {
        id: row.id,
        role: row.role,
        login: row.login,
        displayName: row.display_name,
        generationsUsed: row.generations_used,
        generationCount: Number(row.generation_count),
        limits: resolveLimits(row.role, row.generations_used, overrides, roleLimits),
        overrides,
        createdAt: row.created_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
      };
    });
  }

  async createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: Date }): Promise<SessionRow> {
    const rows = await this.db<SessionRow[]>`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES (${input.id}, ${input.userId}, ${input.tokenHash}, ${input.expiresAt})
      RETURNING *
    `;
    return rows[0]!;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<(SessionRow & { user: UserRow }) | null> {
    const rows = await this.db<(SessionRow & { user_id: string })[]>`
      SELECT s.* FROM sessions s
      WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW()
    `;
    const session = rows[0];
    if (!session) return null;
    const user = await this.findById(session.user_id);
    if (!user) return null;
    return { ...session, user };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.db`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.db`DELETE FROM sessions WHERE expires_at <= NOW()`;
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db`DELETE FROM sessions WHERE user_id = ${userId}`;
  }
}
