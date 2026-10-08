import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { StorageDriver } from '../storage-driver'

export interface S3DriverConfig {
  bucket: string
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  endpoint?: string
  forcePathStyle?: boolean
  prefix?: string
}

export class S3Driver implements StorageDriver {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly prefix: string

  constructor(config: S3DriverConfig) {
    this.bucket = config.bucket
    this.prefix = config.prefix ? `${config.prefix.replace(/\/+$/, '')}/` : ''
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    })
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async write(key: string, buffer: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key), Body: buffer }),
    )
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
    )
    const stream = res.Body as Readable
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }),
    )
  }
}
