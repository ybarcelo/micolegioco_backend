import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'enrollment')

@Injectable()
export class StorageService {
  async save(schoolId: string, filename: string, buffer: Buffer): Promise<string> {
    const dir = path.join(UPLOAD_ROOT, schoolId)
    fs.mkdirSync(dir, { recursive: true })

    const ext = path.extname(filename)
    const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    const timestamp = Date.now()
    const storedFilename = `${base}_${timestamp}${ext}`
    const fullPath = path.join(dir, storedFilename)

    fs.writeFileSync(fullPath, buffer)

    return `${schoolId}/${storedFilename}`
  }

  async delete(storedPath: string): Promise<void> {
    const fullPath = path.join(UPLOAD_ROOT, storedPath)
    try {
      fs.unlinkSync(fullPath)
    } catch {
      // ignore if not found
    }
  }

  async read(storedPath: string): Promise<Buffer> {
    const fullPath = path.join(UPLOAD_ROOT, storedPath)
    return fs.readFileSync(fullPath)
  }

  publicPath(storedPath: string): string {
    return `/api/admin/documents/${storedPath}`
  }
}
