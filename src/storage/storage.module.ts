import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
