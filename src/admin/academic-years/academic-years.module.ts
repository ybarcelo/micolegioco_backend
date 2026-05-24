import { Module } from '@nestjs/common'
import { AcademicYearsController } from './academic-years.controller'

@Module({
  controllers: [AcademicYearsController],
})
export class AcademicYearsModule {}
