import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/period-achievements')
export class PeriodAchievementsController {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna todos los logros de una asignatura+grado con flag `assigned`
   * indicando si están asociados al período seleccionado.
   */
  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('period_id')  periodId:  string,
    @Query('subject_id') subjectId: string,
    @Query('grade_id')   gradeId:   string,
  ) {
    if (!periodId)  throw new BadRequestException('period_id is required')
    if (!subjectId) throw new BadRequestException('subject_id is required')
    if (!gradeId)   throw new BadRequestException('grade_id is required')

    const [achievements, assigned] = await Promise.all([
      this.prisma.subject_achievements.findMany({
        where: { school_id: user.school_id, subject_id: subjectId, grade_id: gradeId },
        orderBy: { code: 'asc' },
      }),
      this.prisma.period_achievements.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          subject_achievements: { subject_id: subjectId, grade_id: gradeId },
        },
        select: { achievement_id: true },
      }),
    ])

    const assignedSet = new Set(assigned.map(a => a.achievement_id))

    return achievements.map(a => ({
      id:          a.id,
      code:        a.code,
      description: a.description,
      assigned:    assignedSet.has(a.id),
    }))
  }

  /**
   * Sincroniza los logros asignados a un período para una asignatura+grado.
   * Elimina las asignaciones previas del scope y crea las nuevas.
   */
  @Post('sync')
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async sync(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      period_id:       string
      subject_id:      string
      grade_id:        string
      achievement_ids: string[]
    },
  ) {
    if (!body.period_id)             throw new BadRequestException('period_id is required')
    if (!body.subject_id)            throw new BadRequestException('subject_id is required')
    if (!body.grade_id)              throw new BadRequestException('grade_id is required')
    if (!Array.isArray(body.achievement_ids)) throw new BadRequestException('achievement_ids must be an array')

    if (user.role === 'DOCENTE') {
      await this.checkTeacherAccess(user, body.subject_id, body.grade_id)
    }

    // IDs de logros válidos para este scope (evita asignar logros de otra asignatura/grado)
    const validAchievements = await this.prisma.subject_achievements.findMany({
      where: {
        school_id:  user.school_id,
        subject_id: body.subject_id,
        grade_id:   body.grade_id,
        id:         { in: body.achievement_ids },
      },
      select: { id: true },
    })
    const validIds = new Set(validAchievements.map(a => a.id))

    // IDs a asignar, filtrados a solo los válidos del scope
    const achievementsToAssign = body.achievement_ids.filter(id => validIds.has(id))

    // IDs de todos los logros del scope (para saber qué eliminar)
    const scopeAchievements = await this.prisma.subject_achievements.findMany({
      where: { school_id: user.school_id, subject_id: body.subject_id, grade_id: body.grade_id },
      select: { id: true },
    })
    const scopeIds = scopeAchievements.map(a => a.id)

    await this.prisma.$transaction(async tx => {
      // Eliminar asignaciones previas del scope para este período
      await tx.period_achievements.deleteMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: body.period_id,
          achievement_id:     { in: scopeIds },
        },
      })

      if (achievementsToAssign.length === 0) return

      await tx.period_achievements.createMany({
        data: achievementsToAssign.map(achievementId => ({
          school_id:          user.school_id,
          academic_period_id: body.period_id,
          achievement_id:     achievementId,
        })),
      })
    })

    return { synced: achievementsToAssign.length }
  }

  private async checkTeacherAccess(user: JwtPayload, subjectId: string, gradeId: string) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')
    const assigned = await this.prisma.grade_subjects.findFirst({
      where: { subject_id: subjectId, grade_id: gradeId, teacher_id: user.teacher_id },
    })
    if (!assigned) throw new ForbiddenException('Solo puedes gestionar logros de tus asignaturas asignadas')
  }
}
