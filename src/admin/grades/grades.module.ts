import { Module } from '@nestjs/common'
import { GradesController } from './grades.controller'

@Module({
  controllers: [GradesController],
})
export class GradesModule {}
