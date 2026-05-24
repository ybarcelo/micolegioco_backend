import { Module } from '@nestjs/common'
import { EnrollmentsController } from './enrollments.controller'
import { EnrollmentBenefitsController } from './enrollment-benefits.controller'

@Module({
  controllers: [EnrollmentsController, EnrollmentBenefitsController],
})
export class EnrollmentsModule {}
