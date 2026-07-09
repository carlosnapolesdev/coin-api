export abstract class StorageService {
  abstract save(key: string, bytes: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}
