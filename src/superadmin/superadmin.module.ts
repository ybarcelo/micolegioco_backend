import { Module } from '@nestjs/common'
import { SuperadminController } from './superadmin.controller'

@Module({ controllers: [SuperadminController] })
export class SuperadminModule {}
