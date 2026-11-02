import { Controller, Get } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/meetings')
export class MeetingsController {
  constructor(private prisma: PrismaService) {}

  /** Citaciones programadas de hoy y de lo que resta de esta semana (lunes a domingo), para el ícono de notificaciones */
  @Get('upcoming')
  @Roles('RECTOR', 'SECRETARIO')
  async getUpcoming(@CurrentUser() user: JwtPayload) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd    = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)

    const mondayIndex = (todayStart.getDay() + 6) % 7 // 0=lunes … 6=domingo
    const weekEnd = new Date(todayStart)
    weekEnd.setDate(weekEnd.getDate() + (7 - mondayIndex)) // próximo lunes 00:00 (límite exclusivo)

    const meetings = await this.prisma.parent_meetings.findMany({
      where: {
        school_id: user.school_id,
        status: 'SCHEDULED',
        scheduled_datetime: { gte: todayStart, lt: weekEnd },
      },
      include: {
        students:  { select: { id: true, first_name: true, last_name: true } },
        guardians: { select: { first_name: true, last_name: true } },
      },
      orderBy: { scheduled_datetime: 'asc' },
    })

    return meetings.map(m => ({
      id:                 m.id,
      student_id:         m.student_id,
      student_name:       m.students  ? `${m.students.first_name} ${m.students.last_name}`  : '',
      guardian_name:      m.guardians ? `${m.guardians.first_name} ${m.guardians.last_name}` : null,
      meeting_reason:     m.meeting_reason,
      scheduled_datetime: m.scheduled_datetime,
      location:           m.location,
      is_today:           m.scheduled_datetime < todayEnd,
    }))
  }
}
