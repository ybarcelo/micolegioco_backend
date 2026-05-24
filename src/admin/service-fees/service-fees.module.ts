import { Module } from '@nestjs/common'
import { ServiceFeesController } from './service-fees.controller'

@Module({
  controllers: [ServiceFeesController],
})
export class ServiceFeesModule {}
