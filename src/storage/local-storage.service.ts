import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StorageService } from './storage.service';

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly baseDir: string;

  constructor() {
    super();
    const raw = process.env.UPLOAD_DIR ?? path.resolve('./uploads');
    this.baseDir = path.resolve(raw);
  }

  private resolve(key: string): string {
    const resolved = path.resolve(this.baseDir, key);
    if (resolved === this.baseDir) return resolved;
    if (resolved.startsWith(this.baseDir + path.sep)) return resolved;
    return path.join(this.baseDir, path.basename(key));
  }

  async save(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(target, bytes);
  }

  async read(key: string): Promise<Buffer> {
    const target = this.resolve(key);
    return fs.readFile(target);
  }

  async remove(key: string): Promise<void> {
    const target = this.resolve(key);
    try {
      await fs.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
