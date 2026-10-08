import * as fs from 'fs'
import * as path from 'path'
import { StorageDriver } from '../storage-driver'

export class LocalDiskDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  async write(key: string, buffer: Buffer): Promise<void> {
    const fullPath = path.join(this.root, key)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, buffer)
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.root, key))
  }

  async delete(key: string): Promise<void> {
    try {
      fs.unlinkSync(path.join(this.root, key))
    } catch {
      // ignore if not found
    }
  }
}
