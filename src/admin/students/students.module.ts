import { Module } from '@nestjs/common'
import { StudentsController } from './students.controller'
import { StudentDocumentsController } from './student-documents.controller'
import { StudentGuardiansController } from './student-guardians.controller'
import { StudentLedgerController } from './student-ledger.controller'
import { StudentMeetingsController } from './student-meetings.controller'
import { StudentAvailableFeesController } from './student-available-fees.controller'

@Module({
  controllers: [
    StudentsController,
    StudentDocumentsController,
    StudentGuardiansController,
    StudentLedgerController,
    StudentMeetingsController,
    StudentAvailableFeesController,
  ],
})
export class StudentsModule {}
