import { Module } from '@nestjs/common'
import { AchievementsController } from './achievements.controller'

@Module({ controllers: [AchievementsController] })
export class AchievementsModule {}
