import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/academic-record')
export class AcademicRecordController {
  constructor(private prisma: PrismaService) {}

  /** Retorna la config de escala del colegio; crea una fila default si no existe */
  @Get('config')
  @Roles('RECTOR', 'SECRETARIO')
  async getConfig(@CurrentUser() user: JwtPayload) {
    const existing = await this.prisma.grading_scale_config.findUnique({
      where:  { school_id: user.school_id },
      select: {
        id: true, school_id: true, scale_type: true, cumulative: true,
        bulletin_header: true, include_achievements: true, secondary_logo: true,
        include_convivencia: true, convivencia_scale: true,
        bulletin_header_html: true,
        created_at: true, updated_at: true,
      },
    })
    if (existing) return existing

    return this.prisma.grading_scale_config.create({
      data: {
        school_id:            user.school_id,
        scale_type:           'NUMERIC',
        cumulative:           true,
        bulletin_header:      'LOGO_LEFT',
        include_achievements: true,
      },
    })
  }

  /** Elimina etiquetas script y atributos on* del HTML del encabezado */
  private sanitizeHeaderHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s+on\w+="[^"]*"/gi, '')
      .replace(/\s+on\w+='[^']*'/gi, '')
  }

  /** Actualiza la configuración de calificaciones y boletines */
  @Put('config')
  @Roles('RECTOR', 'SECRETARIO')
  async updateConfig(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      scale_type?:            string
      cumulative?:            boolean
      bulletin_header?:       string
      include_achievements?:  boolean
      secondary_logo?:        string | null
      include_convivencia?:   boolean
      convivencia_scale?:     string
      bulletin_header_html?:  string | null
    },
  ) {
    if (body.scale_type && !['NUMERIC', 'QUALITATIVE', 'POINTS'].includes(body.scale_type))
      throw new BadRequestException('scale_type must be NUMERIC, QUALITATIVE or POINTS')

    if (body.bulletin_header && !['LOGO_LEFT', 'LOGO_RIGHT', 'LOGO_BOTH'].includes(body.bulletin_header))
      throw new BadRequestException('bulletin_header must be LOGO_LEFT, LOGO_RIGHT or LOGO_BOTH')

    if (body.convivencia_scale && !['QUALITATIVE', 'NUMERIC'].includes(body.convivencia_scale))
      throw new BadRequestException('convivencia_scale must be QUALITATIVE or NUMERIC')

    const sanitizedHeaderHtml = body.bulletin_header_html != null
      ? this.sanitizeHeaderHtml(body.bulletin_header_html)
      : body.bulletin_header_html  // null or undefined → pass through

    return this.prisma.grading_scale_config.upsert({
      where:  { school_id: user.school_id },
      create: {
        school_id:            user.school_id,
        scale_type:           body.scale_type            ?? 'NUMERIC',
        cumulative:           body.cumulative            ?? true,
        bulletin_header:      body.bulletin_header       ?? 'LOGO_LEFT',
        include_achievements: body.include_achievements  ?? true,
        secondary_logo:       body.secondary_logo        ?? null,
        include_convivencia:  body.include_convivencia   ?? false,
        convivencia_scale:    body.convivencia_scale     ?? 'QUALITATIVE',
        bulletin_header_html: sanitizedHeaderHtml        ?? null,
        updated_at:           new Date(),
      },
      update: {
        ...(body.scale_type            !== undefined ? { scale_type:            body.scale_type            } : {}),
        ...(body.cumulative            !== undefined ? { cumulative:            body.cumulative            } : {}),
        ...(body.bulletin_header       !== undefined ? { bulletin_header:       body.bulletin_header       } : {}),
        ...(body.include_achievements  !== undefined ? { include_achievements:  body.include_achievements  } : {}),
        ...(body.secondary_logo        !== undefined ? { secondary_logo:        body.secondary_logo        } : {}),
        ...(body.include_convivencia   !== undefined ? { include_convivencia:   body.include_convivencia   } : {}),
        ...(body.convivencia_scale     !== undefined ? { convivencia_scale:     body.convivencia_scale     } : {}),
        ...(body.bulletin_header_html  !== undefined ? { bulletin_header_html:  sanitizedHeaderHtml ?? null } : {}),
        updated_at: new Date(),
      },
    })
  }

  /**
   * Metadatos para el boletín: colegio, config, director del grupo y logros del período.
   */
  @Get('bulletin-meta')
  @Roles('RECTOR', 'SECRETARIO')
  async getBulletinMeta(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId) throw new BadRequestException('section_id is required')
    if (!periodId)  throw new BadRequestException('period_id is required')

    const [school, config, section] = await Promise.all([
      this.prisma.schools.findUnique({
        where:  { id: user.school_id },
        select: { name: true, logo: true, city: true, nit: true, dane_code: true, resolution_number: true, rector_name: true },
      }),
      this.prisma.grading_scale_config.findUnique({
        where:  { school_id: user.school_id },
        select: { bulletin_header: true, secondary_logo: true, include_achievements: true, include_convivencia: true, convivencia_scale: true, bulletin_header_html: true },
      }),
      this.prisma.sections.findFirst({
        where:  { id: sectionId, grades: { school_id: user.school_id } },
        select: {
          name:     true,
          director_id: true,
          grades:   { select: { name: true } },
          academic_years: { select: { label: true } },
        },
      }),
    ])

    if (!section) throw new BadRequestException('Sección no encontrada')

    let directorName: string | null = null
    if (section.director_id) {
      const teacher = await this.prisma.teachers.findFirst({
        where:  { id: section.director_id },
        select: { first_name: true, last_name: true },
      })
      if (teacher) directorName = `${teacher.first_name} ${teacher.last_name}`
    }

    let achievements: { subject_id: string; description: string; code: string }[] = []
    if (config?.include_achievements) {
      const rows = await this.prisma.period_achievements.findMany({
        where:   { school_id: user.school_id, academic_period_id: periodId },
        include: { subject_achievements: { select: { subject_id: true, description: true, code: true } } },
      })
      achievements = rows.map(r => ({
        subject_id:  r.subject_achievements.subject_id,
        description: r.subject_achievements.description,
        code:        r.subject_achievements.code,
      }))
    }

    return {
      school: {
        name:              school?.name              ?? '',
        logo:              school?.logo              ?? null,
        city:              school?.city              ?? '',
        nit:               school?.nit               ?? '',
        dane_code:         school?.dane_code         ?? null,
        resolution_number: school?.resolution_number ?? null,
        rector_name:       school?.rector_name       ?? null,
      },
      config: {
        bulletin_header:      config?.bulletin_header      ?? 'LOGO_LEFT',
        secondary_logo:       config?.secondary_logo       ?? null,
        include_achievements: config?.include_achievements ?? true,
        include_convivencia:  config?.include_convivencia  ?? false,
        convivencia_scale:    config?.convivencia_scale    ?? 'QUALITATIVE',
        bulletin_header_html: config?.bulletin_header_html ?? null,
      },
      director_name:  directorName,
      section_name:   section.name,
      grade_name:     section.grades?.name    ?? '',
      year_label:     section.academic_years?.label ?? '',
      achievements,
    }
  }

  /**
   * Retorna todo lo necesario para renderizar el grid de calificaciones:
   * - Configuración de escala del colegio
   * - Datos del período seleccionado
   * - Estudiantes matriculados en la sección (ordenados por apellido)
   * - Asignaturas asignadas al grado de la sección
   * - Calificaciones existentes
   */
  @Get('grades')
  @Roles('RECTOR', 'SECRETARIO')
  async getGrades(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId) throw new BadRequestException('section_id is required')
    if (!periodId)  throw new BadRequestException('period_id is required')

    // Primero obtenemos la sección para conocer grade_id y academic_year_id
    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new BadRequestException('Sección no encontrada')

    const [config, period, enrollments, gradeSubjects, existingGrades, existingAbsences, existingConvivencia] =
      await Promise.all([
        this.prisma.grading_scale_config.findUnique({
          where: { school_id: user.school_id },
        }),
        this.prisma.academic_periods.findFirst({
          where: { id: periodId, school_id: user.school_id },
          select: { id: true, name: true, period_number: true, weight_percentage: true },
        }),
        this.prisma.enrollments.findMany({
          where: {
            section_id: sectionId,
            status: 'ACTIVE',
            sections: { grades: { school_id: user.school_id } },
          },
          select: {
            id: true,
            students: { select: { id: true, first_name: true, last_name: true } },
          },
          orderBy: { students: { last_name: 'asc' } },
        }),
        this.prisma.grade_subjects.findMany({
          where: {
            school_id:        user.school_id,
            grade_id:         section.grade_id,
            academic_year_id: section.academic_year_id,
          },
          select: {
            subject_id:  true,
            weekly_hours: true,
            subjects: {
              select: {
                id: true,
                name: true,
                sort_order: true,
                subject_areas: { select: { id: true, name: true, sort_order: true } },
              },
            },
          },
          orderBy: [
            { subjects: { subject_areas: { sort_order: 'asc' } } },
            { subjects: { sort_order: 'asc' } },
          ],
        }),
        this.prisma.student_grades.findMany({
          where: {
            school_id:          user.school_id,
            academic_period_id: periodId,
            enrollments:        { section_id: sectionId },
          },
          select: {
            enrollment_id:     true,
            subject_id:        true,
            numeric_grade:     true,
            qualitative_grade: true,
            notes:             true,
          },
        }),
        this.prisma.student_period_absences.findMany({
          where: {
            school_id:          user.school_id,
            academic_period_id: periodId,
            enrollments:        { section_id: sectionId },
          },
          select: { enrollment_id: true, absences: true },
        }),
        this.prisma.student_convivencia_grades.findMany({
          where: {
            school_id:          user.school_id,
            academic_period_id: periodId,
            enrollments:        { section_id: sectionId },
          },
          select: { enrollment_id: true, qualitative_grade: true, numeric_grade: true },
        }),
      ])

    const resolvedConfig = config ?? { scale_type: 'NUMERIC', cumulative: true, include_convivencia: false, convivencia_scale: 'QUALITATIVE' }

    // ── Datos adicionales para escala por puntos ──────────────────────────────
    let areas: { id: string; name: string; sort_order: number }[] = []
    let area_grades: { enrollment_id: string; subject_area_id: string; points: number; cumulative_points: number }[] = []

    if (resolvedConfig.scale_type === 'POINTS' && period) {
      // Extraer áreas únicas del plan de estudios del grado
      const areaMap = new Map<string, { id: string; name: string; sort_order: number }>()
      for (const gs of gradeSubjects) {
        const a = gs.subjects.subject_areas
        if (a?.id && !areaMap.has(a.id))
          areaMap.set(a.id, { id: a.id, name: a.name, sort_order: a.sort_order ?? 0 })
      }
      areas = [...areaMap.values()].sort((a, b) => a.sort_order - b.sort_order)

      // Períodos del mismo año académico con period_number <= actual (para acumulado)
      const priorPeriods = await this.prisma.academic_periods.findMany({
        where: {
          academic_year_id: section.academic_year_id,
          school_id:        user.school_id,
          period_number:    { lte: period.period_number },
        },
        select: { id: true },
      })

      // Calificaciones del período actual
      const currentAreaGrades = await this.prisma.student_area_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, subject_area_id: true, points: true },
      })

      // Calificaciones acumuladas (períodos anteriores + actual)
      const cumulativeRaw = await this.prisma.student_area_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: { in: priorPeriods.map(p => p.id) },
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, subject_area_id: true, points: true },
      })

      const cumulativeMap = new Map<string, number>()
      for (const g of cumulativeRaw) {
        const key = `${g.enrollment_id}:${g.subject_area_id}`
        cumulativeMap.set(key, (cumulativeMap.get(key) ?? 0) + g.points)
      }

      area_grades = currentAreaGrades.map(g => ({
        enrollment_id:    g.enrollment_id,
        subject_area_id:  g.subject_area_id,
        points:           g.points,
        cumulative_points: cumulativeMap.get(`${g.enrollment_id}:${g.subject_area_id}`) ?? g.points,
      }))
    }

    return {
      config: {
        scale_type:          resolvedConfig.scale_type,
        cumulative:          resolvedConfig.cumulative,
        include_convivencia: resolvedConfig.include_convivencia ?? false,
        convivencia_scale:   resolvedConfig.convivencia_scale   ?? 'QUALITATIVE',
      },
      period: period ? {
        id:               period.id,
        name:             period.name,
        period_number:    period.period_number,
        weight_percentage: period.weight_percentage ? Number(period.weight_percentage) : null,
      } : null,
      students: enrollments.map(e => ({
        enrollment_id: e.id,
        first_name:    e.students?.first_name ?? '',
        last_name:     e.students?.last_name  ?? '',
      })),
      subjects: gradeSubjects.map(gs => ({
        id:         gs.subjects.id,
        name:       gs.subjects.name,
        area_name:  gs.subjects.subject_areas?.name ?? '',
        sort_order: gs.subjects.sort_order,
      })),
      grades: existingGrades.map(g => ({
        enrollment_id:     g.enrollment_id,
        subject_id:        g.subject_id,
        numeric_grade:     g.numeric_grade     ? Number(g.numeric_grade)  : null,
        qualitative_grade: g.qualitative_grade ?? null,
        notes:             g.notes             ?? null,
      })),
      absences: existingAbsences.map(a => ({
        enrollment_id: a.enrollment_id,
        absences:      a.absences,
      })),
      convivencia_grades: existingConvivencia.map(cg => ({
        enrollment_id:     cg.enrollment_id,
        qualitative_grade: cg.qualitative_grade ?? null,
        numeric_grade:     cg.numeric_grade     ? Number(cg.numeric_grade) : null,
      })),
      areas,
      area_grades,
    }
  }

  /** Upsert masivo de calificaciones e inasistencias (todas las de una sección + período) */
  @Post('grades/sync')
  @Roles('RECTOR', 'SECRETARIO')
  async syncGrades(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      section_id:          string
      period_id:           string
      grades:              Array<{
        enrollment_id:      string
        subject_id:         string
        numeric_grade?:     number | null
        qualitative_grade?: string | null
        notes?:             string | null
      }>
      area_grades?:        Array<{
        enrollment_id:   string
        subject_area_id: string
        points:          number
      }>
      absences?:           Array<{
        enrollment_id: string
        absences:      number
      }>
      convivencia_grades?: Array<{
        enrollment_id:      string
        qualitative_grade?: string | null
        numeric_grade?:     number | null
      }>
    },
  ) {
    if (!body.section_id)            throw new BadRequestException('section_id is required')
    if (!body.period_id)             throw new BadRequestException('period_id is required')
    if (!Array.isArray(body.grades)) throw new BadRequestException('grades must be an array')

    const validQual = new Set(['I', 'A', 'S', 'E'])
    for (const g of body.grades) {
      if (g.qualitative_grade && !validQual.has(g.qualitative_grade)) {
        throw new BadRequestException(`Invalid qualitative_grade: "${g.qualitative_grade}". Must be I, A, S or E`)
      }
      if (g.numeric_grade !== undefined && g.numeric_grade !== null) {
        if (g.numeric_grade < 0 || g.numeric_grade > 5.0) {
          throw new BadRequestException('numeric_grade must be between 0.0 and 5.0')
        }
      }
    }

    for (const ag of body.area_grades ?? []) {
      if (!Number.isInteger(ag.points) || ag.points < 0 || ag.points > 25)
        throw new BadRequestException('points must be an integer between 0 and 25')
    }

    const absenceRows = (body.absences ?? []).filter(a => a.absences > 0)
    for (const a of absenceRows) {
      if (!Number.isInteger(a.absences) || a.absences < 0)
        throw new BadRequestException('absences must be a non-negative integer')
    }

    const validConvQual = new Set(['NS', 'A', 'S', 'MS'])
    for (const cg of body.convivencia_grades ?? []) {
      if (cg.qualitative_grade && !validConvQual.has(cg.qualitative_grade))
        throw new BadRequestException(`qualitative_grade de convivencia inválido: "${cg.qualitative_grade}". Debe ser NS, A, S o MS`)
      if (cg.numeric_grade !== undefined && cg.numeric_grade !== null) {
        if (cg.numeric_grade < 0 || cg.numeric_grade > 5.0)
          throw new BadRequestException('numeric_grade de convivencia debe estar entre 0.0 y 5.0')
      }
    }

    const gradeOps = body.grades.map(g =>
      this.prisma.student_grades.upsert({
        where: {
          enrollment_id_subject_id_academic_period_id: {
            enrollment_id:      g.enrollment_id,
            subject_id:         g.subject_id,
            academic_period_id: body.period_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      g.enrollment_id,
          subject_id:         g.subject_id,
          academic_period_id: body.period_id,
          numeric_grade:      g.numeric_grade     ?? null,
          qualitative_grade:  g.qualitative_grade ?? null,
          notes:              g.notes             ?? null,
          updated_at:         new Date(),
        },
        update: {
          numeric_grade:      g.numeric_grade     ?? null,
          qualitative_grade:  g.qualitative_grade ?? null,
          notes:              g.notes             ?? null,
          updated_at:         new Date(),
        },
      })
    )

    const areaGradeOps = (body.area_grades ?? []).map(ag =>
      this.prisma.student_area_grades.upsert({
        where: {
          enrollment_id_subject_area_id_academic_period_id: {
            enrollment_id:      ag.enrollment_id,
            subject_area_id:    ag.subject_area_id,
            academic_period_id: body.period_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      ag.enrollment_id,
          subject_area_id:    ag.subject_area_id,
          academic_period_id: body.period_id,
          points:             ag.points,
          updated_at:         new Date(),
        },
        update: {
          points:     ag.points,
          updated_at: new Date(),
        },
      })
    )

    const absenceOps = absenceRows.map(a =>
      this.prisma.student_period_absences.upsert({
        where: {
          enrollment_id_academic_period_id: {
            enrollment_id:      a.enrollment_id,
            academic_period_id: body.period_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      a.enrollment_id,
          academic_period_id: body.period_id,
          absences:           a.absences,
          updated_at:         new Date(),
        },
        update: {
          absences:   a.absences,
          updated_at: new Date(),
        },
      })
    )

    const convivenciaOps = (body.convivencia_grades ?? []).map(cg =>
      this.prisma.student_convivencia_grades.upsert({
        where: {
          enrollment_id_academic_period_id: {
            enrollment_id:      cg.enrollment_id,
            academic_period_id: body.period_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      cg.enrollment_id,
          academic_period_id: body.period_id,
          qualitative_grade:  cg.qualitative_grade ?? null,
          numeric_grade:      cg.numeric_grade     ?? null,
          updated_at:         new Date(),
        },
        update: {
          qualitative_grade:  cg.qualitative_grade ?? null,
          numeric_grade:      cg.numeric_grade     ?? null,
          updated_at:         new Date(),
        },
      })
    )

    if (gradeOps.length > 0 || areaGradeOps.length > 0 || absenceOps.length > 0 || convivenciaOps.length > 0) {
      await this.prisma.$transaction([...gradeOps, ...areaGradeOps, ...absenceOps, ...convivenciaOps])
    }

    return {
      synced:             body.grades.length,
      area_synced:        (body.area_grades ?? []).length,
      absences_synced:    absenceRows.length,
      convivencia_synced: (body.convivencia_grades ?? []).length,
    }
  }
}
