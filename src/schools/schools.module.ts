import { Module } from '@nestjs/common'
import { SchoolsController } from './schools.controller'

@Module({
  controllers: [SchoolsController],
})
export class SchoolsModule {}
