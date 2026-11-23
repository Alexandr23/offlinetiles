import { randomUUID } from 'node:crypto';
import type { AuthUser, CreateStyleRequest, MapStyle, UpdateStyleRequest } from '@map-exporter/contracts';
import type { EventBus } from '../../events/event-bus.js';
import { AppError } from '../../shared/errors/app-error.js';
import { assertValidStyle } from './style-validation.js';
import type { StyleRepository } from './styles.repository.js';

export class StyleService {
  constructor(
    private readonly repo: StyleRepository,
    private readonly bus: EventBus,
  ) {}

  listForUser(userId: string): Promise<MapStyle[]> {
    return this.repo.listForUser(userId);
  }

  async get(id: string, actor: AuthUser): Promise<MapStyle> {
    const style = await this.repo.findById(id);
    if (!style) throw AppError.notFound('Style', id);
    this.assertOwns(style, actor);
    return style;
  }

  async create(input: CreateStyleRequest, user: AuthUser): Promise<MapStyle> {
    assertValidStyle(input.style);
    const created = await this.repo.insert({
      id: randomUUID(),
      name: input.name,
      basePreset: input.basePreset ?? null,
      style: { ...input.style, name: input.name },
      userId: user.id,
    });
    await this.bus.publish({ type: 'style.created', data: created });
    return created;
  }

  async update(id: string, patch: UpdateStyleRequest, actor: AuthUser): Promise<MapStyle> {
    await this.get(id, actor);
    if (patch.style) assertValidStyle(patch.style);
    const style = patch.style ? { ...patch.style, name: patch.name ?? patch.style.name } : undefined;
    const updated = await this.repo.update(id, { name: patch.name, style });
    if (!updated) throw AppError.notFound('Style', id);
    await this.bus.publish({ type: 'style.updated', data: updated });
    return updated;
  }

  async duplicate(id: string, actor: AuthUser, name?: string): Promise<MapStyle> {
    const source = await this.get(id, actor);
    const newName = name ?? `${source.name} copy`;
    const created = await this.repo.insert({
      id: randomUUID(),
      name: newName,
      basePreset: source.basePreset,
      style: { ...source.style, name: newName },
      userId: actor.id,
    });
    await this.bus.publish({ type: 'style.created', data: created });
    return created;
  }

  async delete(id: string, actor: AuthUser): Promise<void> {
    await this.get(id, actor);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw AppError.notFound('Style', id);
    await this.bus.publish({ type: 'style.deleted', data: { id } });
  }

  private assertOwns(style: MapStyle, actor: AuthUser): void {
    if (actor.role === 'admin') return;
    if (style.userId !== actor.id) {
      throw AppError.forbidden('You do not own this style');
    }
  }
}
