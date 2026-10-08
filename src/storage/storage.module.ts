import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'
import { STORAGE_DRIVER } from './storage-driver'
import { createStorageDriver } from './drivers/storage-driver.factory'

@Global()
@Module({
  providers: [
    StorageService,
    { provide: STORAGE_DRIVER, useFactory: createStorageDriver },
  ],
  exports: [StorageService],
})
export class StorageModule {}
