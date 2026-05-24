import { Module } from '@nestjs/common'
import { FeeDefinitionsController } from './fee-definitions.controller'

@Module({
  controllers: [FeeDefinitionsController],
})
export class FeeDefinitionsModule {}
