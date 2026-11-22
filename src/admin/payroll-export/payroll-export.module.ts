import { Module } from '@nestjs/common'
import { PayrollExportController } from './payroll-export.controller'
import { TeachersModule } from '../teachers/teachers.module'

@Module({
  imports: [TeachersModule],
  controllers: [PayrollExportController],
})
export class PayrollExportModule {}
