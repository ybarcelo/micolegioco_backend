import { Module } from '@nestjs/common'
import { TeacherLoansController } from './teacher-loans.controller'

@Module({ controllers: [TeacherLoansController] })
export class TeacherLoansModule {}
