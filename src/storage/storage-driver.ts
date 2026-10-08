export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER')

export interface StorageDriver {
  write(key: string, buffer: Buffer): Promise<void>
  read(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}
