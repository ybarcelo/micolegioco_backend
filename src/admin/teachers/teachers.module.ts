import { Module } from '@nestjs/common'
import { EscalafonTypesController } from './escalafon-types.controller'
import { TeachersController } from './teachers.controller'
import { TeacherContractsController } from './teacher-contracts.controller'
import { TeacherHoursController } from './teacher-hours.controller'
import { PayrollCalcService } from './payroll-calc.service'

@Module({
  controllers: [EscalafonTypesController, TeachersController, TeacherContractsController, TeacherHoursController],
  providers: [PayrollCalcService],
  exports: [PayrollCalcService],
})
export class TeachersModule {}
