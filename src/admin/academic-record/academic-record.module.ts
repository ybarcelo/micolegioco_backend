import { Module } from '@nestjs/common'
import { AcademicRecordController } from './academic-record.controller'

@Module({
  controllers: [AcademicRecordController],
})
export class AcademicRecordModule {}
