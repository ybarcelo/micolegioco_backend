import { Module } from '@nestjs/common'
import { CertificatesController } from './certificates.controller'

@Module({
  controllers: [CertificatesController],
})
export class CertificatesModule {}
