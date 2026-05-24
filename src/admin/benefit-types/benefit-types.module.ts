import { Module } from '@nestjs/common'
import { BenefitTypesController } from './benefit-types.controller'

@Module({
  controllers: [BenefitTypesController],
})
export class BenefitTypesModule {}
