import { Module } from '@nestjs/common'
import { EscalafonTypesController } from './escalafon-types.controller'
import { TeachersController } from './teachers.controller'
import { TeacherContractsController } from './teacher-contracts.controller'
import { TeacherHoursController } from './teacher-hours.controller'

@Module({
  controllers: [EscalafonTypesController, TeachersController, TeacherContractsController, TeacherHoursController],
})
export class TeachersModule {}
