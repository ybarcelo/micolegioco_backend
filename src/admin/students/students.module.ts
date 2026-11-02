import { Module } from '@nestjs/common'
import { StudentsController } from './students.controller'
import { StudentDocumentsController } from './student-documents.controller'
import { StudentPhotoController } from './student-photo.controller'
import { StudentGuardiansController } from './student-guardians.controller'
import { StudentLedgerController } from './student-ledger.controller'
import { StudentMeetingsController } from './student-meetings.controller'
import { StudentFollowUpController } from './student-follow-up.controller'
import { StudentAvailableFeesController } from './student-available-fees.controller'

@Module({
  controllers: [
    StudentsController,
    StudentDocumentsController,
    StudentPhotoController,
    StudentGuardiansController,
    StudentLedgerController,
    StudentMeetingsController,
    StudentFollowUpController,
    StudentAvailableFeesController,
  ],
})
export class StudentsModule {}
