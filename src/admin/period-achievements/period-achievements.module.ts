import { Module } from '@nestjs/common'
import { PeriodAchievementsController } from './period-achievements.controller'

@Module({ controllers: [PeriodAchievementsController] })
export class PeriodAchievementsModule {}
