import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'

import { PrismaModule } from './prisma/prisma.module'
import { StorageModule } from './storage/storage.module'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { RolesGuard } from './common/guards/roles.guard'

import { SchoolsModule } from './schools/schools.module'
import { PublicModule } from './public/public.module'
import { SchoolAdminModule } from './admin/school/school-admin.module'
import { StudentsModule } from './admin/students/students.module'
import { DocumentsModule } from './admin/documents/documents.module'
import { GradesModule } from './admin/grades/grades.module'
import { SectionsModule } from './admin/sections/sections.module'
import { AcademicYearsModule } from './admin/academic-years/academic-years.module'
import { BenefitTypesModule } from './admin/benefit-types/benefit-types.module'
import { EnrollmentsModule } from './admin/enrollments/enrollments.module'
import { FeeDefinitionsModule } from './admin/fee-definitions/fee-definitions.module'
import { ServiceFeesModule } from './admin/service-fees/service-fees.module'
import { ExpensesModule } from './admin/expenses/expenses.module'
import { ReportsModule } from './admin/reports/reports.module'
import { TeachersModule } from './admin/teachers/teachers.module'
import { CurriculumModule } from './admin/curriculum/curriculum.module'
import { AcademicRecordModule } from './admin/academic-record/academic-record.module'
import { AchievementsModule } from './admin/achievements/achievements.module'
import { PeriodAchievementsModule } from './admin/period-achievements/period-achievements.module'
import { TeacherModule } from './teacher/teacher.module'
import { SuperadminModule } from './superadmin/superadmin.module'
import { DashboardModule } from './admin/dashboard/dashboard.module'
import { DiagnosticsModule } from './admin/diagnostics/diagnostics.module'
import { PreschoolRecordModule } from './admin/preschool-record/preschool-record.module'

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } }
          : undefined,
        redact: [
          'req.headers.authorization',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
        ],
        autoLogging: true,
        quietReqLogger: true,
      },
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    SchoolsModule,
    PublicModule,
    SchoolAdminModule,
    StudentsModule,
    DocumentsModule,
    GradesModule,
    SectionsModule,
    AcademicYearsModule,
    BenefitTypesModule,
    EnrollmentsModule,
    FeeDefinitionsModule,
    ServiceFeesModule,
    ExpensesModule,
    ReportsModule,
    TeachersModule,
    CurriculumModule,
    AcademicRecordModule,
    AchievementsModule,
    PeriodAchievementsModule,
    TeacherModule,
    SuperadminModule,
    DashboardModule,
    DiagnosticsModule,
    PreschoolRecordModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
