import { Inject, Injectable } from '@nestjs/common'
import * as path from 'path'
import { STORAGE_DRIVER, StorageDriver } from './storage-driver'

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async save(schoolId: string, filename: string, buffer: Buffer): Promise<string> {
    const ext = path.extname(filename)
    const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    const timestamp = Date.now()
    const key = `${schoolId}/${base}_${timestamp}${ext}`

    await this.driver.write(key, buffer)

    return key
  }

  async delete(storedPath: string): Promise<void> {
    await this.driver.delete(storedPath)
  }

  async read(storedPath: string): Promise<Buffer> {
    return this.driver.read(storedPath)
  }

  publicPath(storedPath: string): string {
    return `/api/admin/documents/${storedPath}`
  }
}
