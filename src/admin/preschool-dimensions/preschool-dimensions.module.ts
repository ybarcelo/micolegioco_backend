import { Module } from '@nestjs/common'
import { PreschoolDimensionsController } from './preschool-dimensions.controller'

@Module({
  controllers: [PreschoolDimensionsController],
})
export class PreschoolDimensionsModule {}
