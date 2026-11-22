import { Module } from '@nestjs/common'
import { IcfesResultsController } from './icfes-results.controller'
import { IcfesResultsService } from './icfes-results.service'

@Module({
  controllers: [IcfesResultsController],
  providers: [IcfesResultsService],
  exports: [IcfesResultsService],
})
export class IcfesResultsModule {}
