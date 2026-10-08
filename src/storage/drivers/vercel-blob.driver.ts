import { put, get, del } from '@vercel/blob'
import { StorageDriver } from '../storage-driver'

export interface VercelBlobDriverConfig {
  token?: string
  prefix?: string
}

export class VercelBlobDriver implements StorageDriver {
  private readonly token?: string
  private readonly prefix: string

  constructor(config: VercelBlobDriverConfig) {
    this.token = config.token
    this.prefix = config.prefix ? `${config.prefix.replace(/\/+$/, '')}/` : ''
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async write(key: string, buffer: Buffer): Promise<void> {
    await put(this.fullKey(key), buffer, {
      access: 'private',
      addRandomSuffix: false,
      token: this.token,
    })
  }

  async read(key: string): Promise<Buffer> {
    const result = await get(this.fullKey(key), { access: 'private', token: this.token })
    if (!result || !result.stream) {
      throw new Error(`Blob not found: ${key}`)
    }

    const chunks: Buffer[] = []
    const reader = result.stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    try {
      await del(this.fullKey(key), { token: this.token })
    } catch {
      // ignore if not found
    }
  }
}
