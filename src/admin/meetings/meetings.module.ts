import { Module } from '@nestjs/common'
import { MeetingsController } from './meetings.controller'

@Module({
  controllers: [MeetingsController],
})
export class MeetingsModule {}
