import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let tmpDir: string;
  let service: LocalStorageService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coinflow-storage-'));
    process.env.UPLOAD_DIR = tmpDir;
    service = new LocalStorageService();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  it('save then read returns identical bytes', async () => {
    const buf = Buffer.from('hello world');
    await service.save('abc.pdf', buf);
    const out = await service.read('abc.pdf');
    expect(out.equals(buf)).toBe(true);
  });

  it('exists returns false before save and true after', async () => {
    expect(await service.exists('missing.pdf')).toBe(false);
    await service.save('present.pdf', Buffer.from('x'));
    expect(await service.exists('present.pdf')).toBe(true);
  });

  it('remove deletes the file', async () => {
    await service.save('gone.pdf', Buffer.from('x'));
    await service.remove('gone.pdf');
    expect(await service.exists('gone.pdf')).toBe(false);
  });

  it('remove is idempotent on missing key', async () => {
    await expect(service.remove('never-existed.pdf')).resolves.toBeUndefined();
  });

  it('path traversal attempts stay inside UPLOAD_DIR', async () => {
    await service.save('../escape.bin', Buffer.from('nope'));
    // File must NOT be created outside tmpDir.
    const escape = path.join(path.dirname(tmpDir), 'escape.bin');
    expect(await fileExists(escape)).toBe(false);
    // Note: because baseDir itself is tmpDir, traversal is resolved to tmpDir/escape.bin
    // after path.join normalization — confirm the resolved path is INSIDE tmpDir.
    const resolved = path.resolve(tmpDir, 'escape.bin');
    expect(resolved.startsWith(tmpDir)).toBe(true);
  });
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
