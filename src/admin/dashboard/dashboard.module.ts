import { Module } from '@nestjs/common'
import { DashboardController } from './dashboard.controller'
import { AcademicSnapshotService } from './academic-snapshot.service'
import { IcfesResultsModule } from '../icfes-results/icfes-results.module'

@Module({
  imports: [IcfesResultsModule],
  controllers: [DashboardController],
  providers: [AcademicSnapshotService],
})
export class DashboardModule {}
