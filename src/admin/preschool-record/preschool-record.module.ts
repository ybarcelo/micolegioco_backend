import { Module } from '@nestjs/common'
import { PreschoolRecordController } from './preschool-record.controller'

@Module({
  controllers: [PreschoolRecordController],
})
export class PreschoolRecordModule {}
