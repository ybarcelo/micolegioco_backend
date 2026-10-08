import { Logger } from '@nestjs/common'
import * as path from 'path'
import { StorageDriver } from '../storage-driver'
import { LocalDiskDriver } from './local-disk.driver'
import { S3Driver } from './s3.driver'
import { AzureBlobDriver } from './azure-blob.driver'
import { VercelBlobDriver } from './vercel-blob.driver'

const logger = new Logger('StorageDriverFactory')

export function createStorageDriver(): StorageDriver {
  const kind = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase()

  if (kind === 's3') {
    const bucket = process.env.S3_BUCKET
    const region = process.env.S3_REGION
    if (!bucket || !region) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION to be set')
    }
    logger.log(`Using S3 storage driver (bucket: ${bucket}, region: ${region})`)
    return new S3Driver({
      bucket,
      region,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      prefix: process.env.S3_PREFIX ?? 'enrollment',
    })
  }

  if (kind === 'azure') {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    const container = process.env.AZURE_STORAGE_CONTAINER
    if (!connectionString || !container) {
      throw new Error(
        'STORAGE_DRIVER=azure requires AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER to be set',
      )
    }
    logger.log(`Using Azure Blob storage driver (container: ${container})`)
    return new AzureBlobDriver({
      connectionString,
      container,
      prefix: process.env.AZURE_STORAGE_PREFIX ?? 'enrollment',
    })
  }

  if (kind === 'vercel-blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    const hasOidc = !!process.env.VERCEL_OIDC_TOKEN && !!process.env.BLOB_STORE_ID
    if (!token && !hasOidc) {
      throw new Error(
        'STORAGE_DRIVER=vercel-blob requires BLOB_READ_WRITE_TOKEN (or VERCEL_OIDC_TOKEN + BLOB_STORE_ID) to be set',
      )
    }
    logger.log('Using Vercel Blob storage driver (private access)')
    return new VercelBlobDriver({
      token,
      prefix: process.env.VERCEL_BLOB_PREFIX ?? 'enrollment',
    })
  }

  if (kind !== 'local') {
    logger.warn(`Unknown STORAGE_DRIVER "${kind}", falling back to local disk storage`)
  }

  const root = process.env.LOCAL_STORAGE_PATH
    ? path.resolve(process.env.LOCAL_STORAGE_PATH)
    : path.join(process.cwd(), 'uploads', 'enrollment')
  logger.log(`Using local disk storage driver (root: ${root})`)
  return new LocalDiskDriver(root)
}
