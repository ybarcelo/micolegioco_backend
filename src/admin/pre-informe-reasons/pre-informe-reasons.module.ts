import { Module } from '@nestjs/common'
import { PreInformeReasonsController } from './pre-informe-reasons.controller'

@Module({
  controllers: [PreInformeReasonsController],
})
export class PreInformeReasonsModule {}
