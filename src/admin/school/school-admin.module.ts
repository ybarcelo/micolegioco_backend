import { Module } from '@nestjs/common'
import { SchoolAdminController } from './school-admin.controller'

@Module({
  controllers: [SchoolAdminController],
})
export class SchoolAdminModule {}
