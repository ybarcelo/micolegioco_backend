import { BlobServiceClient, ContainerClient } from '@azure/storage-blob'
import { StorageDriver } from '../storage-driver'

export interface AzureBlobDriverConfig {
  connectionString: string
  container: string
  prefix?: string
}

export class AzureBlobDriver implements StorageDriver {
  private readonly containerClient: ContainerClient
  private readonly prefix: string

  constructor(config: AzureBlobDriverConfig) {
    const service = BlobServiceClient.fromConnectionString(config.connectionString)
    this.containerClient = service.getContainerClient(config.container)
    this.prefix = config.prefix ? `${config.prefix.replace(/\/+$/, '')}/` : ''
  }

  private fullKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async write(key: string, buffer: Buffer): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(this.fullKey(key))
    await blockBlobClient.uploadData(buffer)
  }

  async read(key: string): Promise<Buffer> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(this.fullKey(key))
    return blockBlobClient.downloadToBuffer()
  }

  async delete(key: string): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(this.fullKey(key))
    try {
      await blockBlobClient.deleteIfExists()
    } catch {
      // ignore if not found
    }
  }
}
