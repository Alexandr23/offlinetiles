import fs from 'node:fs/promises';
import type { RangeResponse, Source } from 'pmtiles';

/**
 * pmtiles `Source` backed by a local file descriptor using positional reads.
 * Never loads the archive into memory – only requested byte ranges.
 */
export class FsSource implements Source {
  private handle: fs.FileHandle | null = null;
  private opening: Promise<fs.FileHandle> | null = null;

  constructor(private readonly filePath: string) {}

  getKey(): string {
    return this.filePath;
  }

  private open(): Promise<fs.FileHandle> {
    if (this.handle) return Promise.resolve(this.handle);
    if (!this.opening) {
      this.opening = fs.open(this.filePath, 'r').then((h) => {
        this.handle = h;
        return h;
      });
    }
    return this.opening;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const handle = await this.open();
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    const view = buffer.subarray(0, bytesRead);
    const data = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    return { data };
  }

  async size(): Promise<number> {
    const handle = await this.open();
    const stat = await handle.stat();
    return stat.size;
  }

  async close(): Promise<void> {
    const h = this.handle;
    this.handle = null;
    this.opening = null;
    await h?.close();
  }
}
