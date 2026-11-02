import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Controller('teacher')
@Roles('DOCENTE')
export class TeacherController {
  constructor(private prisma: PrismaService) {}

  /** Perfil del docente: datos personales + email de acceso */
  @Get('me')
  async getMe(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const teacher = await this.prisma.teachers.findFirst({
      where: { id: user.teacher_id, school_id: user.school_id },
      include: {
        escalafon_types: { select: { id: true, name: true } },
        users:           { select: { email: true } },
      },
    })
    if (!teacher) throw new NotFoundException('Perfil de docente no encontrado')

    return {
      id:              teacher.id,
      first_name:      teacher.first_name,
      last_name:       teacher.last_name,
      document_type:   teacher.document_type,
      document_number: teacher.document_number,
      address:         teacher.address,
      phone_mobile:    teacher.phone_mobile,
      profession:      teacher.profession,
      escalafon:       teacher.escalafon_types?.name ?? null,
      email:           teacher.users?.email ?? null,
    }
  }

  /** Asignaturas asignadas al docente (vía grade_subjects), con área y año */
  @Get('subjects')
  async getSubjects(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) return []
    const gs = await this.prisma.grade_subjects.findMany({
      where: { teacher_id: user.teacher_id, school_id: user.school_id },
      include: {
        subjects:       { select: { id: true, name: true, subject_areas: { select: { id: true, name: true } } } },
        grades:         { select: { id: true, name: true, level: true } },
        academic_years: { select: { id: true, label: true } },
      },
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades:         { level: 'asc' } },
        { subjects:       { subject_areas: { sort_order: 'asc' } } },
        { subjects:       { name: 'asc' } },
      ],
    })
    return gs.map(g => ({
      subject_id:       g.subject_id,
      subject_name:     g.subjects.name,
      area_id:          g.subjects.subject_areas?.id   ?? null,
      area_name:        g.subjects.subject_areas?.name ?? null,
      grade_id:         g.grade_id,
      grade_name:       g.grades?.name  ?? '',
      grade_level:      g.grades?.level ?? 0,
      academic_year_id: g.academic_year_id,
      year_label:       g.academic_years?.label ?? '',
    }))
  }

  /**
   * Secciones asignadas al docente.
   * sections.teacher_id = users.id (titular de grupo)
   * Incluye períodos del año académico para el selector de período.
   */
  @Get('sections')
  async getSections(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) return []
    const sections = await this.prisma.sections.findMany({
      where: { director_id: user.teacher_id },
      include: {
        grades:         { select: { id: true, name: true, level: true } },
        academic_years: {
          select: {
            id:   true,
            label: true,
            academic_periods: {
              orderBy: { sort_order: 'asc' },
              select: {
                id:               true,
                name:             true,
                period_number:    true,
                weight_percentage: true,
              },
            },
          },
        },
      },
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades: { level: 'asc' } },
        { name: 'asc' },
      ],
    })

    return sections.map(s => ({
      id:              s.id,
      name:            s.name,
      grade_id:        s.grade_id,
      grade_name:      s.grades?.name ?? '',
      grade_level:     s.grades?.level ?? 0,
      academic_year_id: s.academic_year_id,
      year_label:      s.academic_years?.label ?? '',
      periods:         (s.academic_years?.academic_periods ?? []).map(p => ({
        id:               p.id,
        name:             p.name,
        period_number:    p.period_number,
        weight_percentage: p.weight_percentage ? Number(p.weight_percentage) : null,
      })),
    }))
  }

  /** Estudiantes matriculados en una sección (solo las del docente) */
  @Get('sections/:id/students')
  async getSectionStudents(
    @CurrentUser() user: JwtPayload,
    @Param('id') sectionId: string,
  ) {
    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, director_id: user.teacher_id ?? undefined },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada o no asignada a este docente')

    const enrollments = await this.prisma.enrollments.findMany({
      where: { section_id: sectionId, status: 'ACTIVE' },
      include: {
        students: {
          select: {
            id: true, first_name: true, last_name: true,
            document_type: true, document_number: true,
          },
        },
      },
      orderBy: { students: { last_name: 'asc' } },
    })

    return enrollments.map(e => ({
      enrollment_id:   e.id,
      first_name:      e.students?.first_name  ?? '',
      last_name:       e.students?.last_name   ?? '',
      document_type:   e.students?.document_type ?? '',
      document_number: e.students?.document_number ?? '',
    }))
  }

  /**
   * Secciones donde el docente tiene asignaturas asignadas en grade_subjects.
   * Usado por el registro académico (distinto de /sections que filtra por director_id).
   */
  @Get('academic-record/sections')
  async getAcademicRecordSections(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) return []

    const teacherGrades = await this.prisma.grade_subjects.findMany({
      where:    { teacher_id: user.teacher_id, school_id: user.school_id },
      select:   { grade_id: true, academic_year_id: true },
      distinct: ['grade_id', 'academic_year_id'],
    })
    if (teacherGrades.length === 0) return []

    const sections = await this.prisma.sections.findMany({
      where: {
        OR: teacherGrades.map(tg => ({
          grade_id:         tg.grade_id,
          academic_year_id: tg.academic_year_id,
        })),
        grades: { school_id: user.school_id },
      },
      include: {
        grades:         { select: { id: true, name: true, level: true } },
        academic_years: {
          select: {
            id: true, label: true,
            academic_periods: {
              orderBy: { sort_order: 'asc' },
              select: {
                id: true, name: true, period_number: true, weight_percentage: true,
              },
            },
          },
        },
      },
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades: { level: 'asc' } },
        { name: 'asc' },
      ],
    })

    return sections.map(s => ({
      id:               s.id,
      name:             s.name,
      grade_id:         s.grade_id,
      grade_name:       s.grades?.name ?? '',
      grade_level:      s.grades?.level ?? 0,
      academic_year_id: s.academic_year_id,
      year_label:       s.academic_years?.label ?? '',
      periods:          (s.academic_years?.academic_periods ?? []).map(p => ({
        id:                p.id,
        name:              p.name,
        period_number:     p.period_number,
        weight_percentage: p.weight_percentage ? Number(p.weight_percentage) : null,
      })),
    }))
  }

  /**
   * Grid de calificaciones — solo muestra las asignaturas/áreas asignadas al docente.
   * En modo POINTS retorna áreas + ítems de calificación en lugar de asignaturas.
   */
  @Get('academic-record')
  async getGrades(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId)        throw new BadRequestException('section_id is required')
    if (!periodId)         throw new BadRequestException('period_id is required')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const [config, period, enrollments, gradeSubjects, existingGrades, existingAbsences] =
      await Promise.all([
        this.prisma.grading_scale_config.findUnique({
          where: { school_id: user.school_id },
        }),
        this.prisma.academic_periods.findFirst({
          where: { id: periodId, school_id: user.school_id },
          select: { id: true, name: true, period_number: true, weight_percentage: true },
        }),
        this.prisma.enrollments.findMany({
          where: { section_id: sectionId, status: 'ACTIVE' },
          select: {
            id:      true,
            students: { select: { id: true, first_name: true, last_name: true } },
          },
          orderBy: { students: { last_name: 'asc' } },
        }),
        this.prisma.grade_subjects.findMany({
          where: {
            school_id:        user.school_id,
            grade_id:         section.grade_id,
            academic_year_id: section.academic_year_id,
            teacher_id:       user.teacher_id,
          },
          select: {
            subject_id:   true,
            weekly_hours: true,
            subjects: {
              select: {
                id: true, name: true, sort_order: true,
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
      ])

    if (gradeSubjects.length === 0)
      throw new ForbiddenException('No tienes asignaturas asignadas en esta sección para el año seleccionado')

    const resolvedConfig = config ?? { scale_type: 'NUMERIC', cumulative: true }

    // ── Modo POINTS: retornar áreas + ítems de calificación ──────────────────
    if (resolvedConfig.scale_type === 'POINTS' && period) {
      // Áreas únicas asignadas a este docente
      const areaMap = new Map<string, { id: string; name: string; sort_order: number }>()
      for (const gs of gradeSubjects) {
        const a = gs.subjects.subject_areas
        if (a?.id && !areaMap.has(a.id))
          areaMap.set(a.id, { id: a.id, name: a.name, sort_order: a.sort_order ?? 0 })
      }
      const areas = [...areaMap.values()].sort((a, b) => a.sort_order - b.sort_order)

      const enrollmentIds = enrollments.map(e => e.id)
      const areaIds       = areas.map(a => a.id)

      const [existingItems, existingAreaGrades] = await Promise.all([
        this.prisma.student_area_grade_items.findMany({
          where: {
            school_id:          user.school_id,
            academic_period_id: periodId,
            enrollment_id:      { in: enrollmentIds },
            subject_area_id:    { in: areaIds },
          },
          select: { enrollment_id: true, subject_area_id: true, item_key: true, points: true },
        }),
        this.prisma.student_area_grades.findMany({
          where: {
            school_id:          user.school_id,
            academic_period_id: periodId,
            enrollment_id:      { in: enrollmentIds },
            subject_area_id:    { in: areaIds },
          },
          select: { enrollment_id: true, subject_area_id: true, points: true },
        }),
      ])

      return {
        config:  { scale_type: 'POINTS', cumulative: resolvedConfig.cumulative },
        period:  period ? {
          id: period.id, name: period.name,
          period_number: period.period_number,
          weight_percentage: period.weight_percentage ? Number(period.weight_percentage) : null,
        } : null,
        students: enrollments.map(e => ({
          enrollment_id: e.id,
          first_name:    e.students?.first_name ?? '',
          last_name:     e.students?.last_name  ?? '',
        })),
        areas,
        area_grade_items: existingItems,
        area_grades:      existingAreaGrades,
        subjects:  [],
        grades:    [],
        absences:  existingAbsences.map(a => ({ enrollment_id: a.enrollment_id, absences: a.absences })),
      }
    }

    return {
      config: {
        scale_type: resolvedConfig.scale_type,
        cumulative: resolvedConfig.cumulative,
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
        sort_order: gs.subjects.sort_order,
      })),
      grades: existingGrades.map(g => ({
        enrollment_id:     g.enrollment_id,
        subject_id:        g.subject_id,
        numeric_grade:     g.numeric_grade     ? Number(g.numeric_grade) : null,
        qualitative_grade: g.qualitative_grade ?? null,
        notes:             g.notes             ?? null,
      })),
      absences: existingAbsences.map(a => ({
        enrollment_id: a.enrollment_id,
        absences:      a.absences,
      })),
      areas:            [],
      area_grade_items: [],
      area_grades:      [],
    }
  }

  /** Guardar calificaciones e inasistencias (upsert masivo) */
  @Post('academic-record/sync')
  async syncGrades(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      section_id: string
      period_id:  string
      grades: Array<{
        enrollment_id:      string
        subject_id:         string
        numeric_grade?:     number | null
        qualitative_grade?: string | null
        notes?:             string | null
      }>
      area_grade_items?: Array<{
        enrollment_id:   string
        subject_area_id: string
        item_key:        string
        points:          number
      }>
      absences?: Array<{
        enrollment_id: string
        absences:      number
      }>
    },
  ) {
    if (!body.section_id)            throw new BadRequestException('section_id is required')
    if (!body.period_id)             throw new BadRequestException('period_id is required')
    if (!Array.isArray(body.grades)) throw new BadRequestException('grades must be an array')
    if (!user.teacher_id)            throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where: { id: body.section_id, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const teacherSubjectRows = await this.prisma.grade_subjects.findMany({
      where: {
        teacher_id:       user.teacher_id,
        school_id:        user.school_id,
        grade_id:         section.grade_id,
        academic_year_id: section.academic_year_id,
      },
      select: {
        subject_id: true,
        subjects:   { select: { area_id: true } },
      },
    })
    if (teacherSubjectRows.length === 0)
      throw new ForbiddenException('No tienes asignaturas asignadas en esta sección')

    // ── Modo POINTS ───────────────────────────────────────────────────────────
    const areaItems = body.area_grade_items ?? []
    if (areaItems.length > 0) {
      // Áreas autorizadas para este docente
      const allowedAreaIds = new Set(
        teacherSubjectRows.map(r => r.subjects?.area_id).filter(Boolean) as string[]
      )
      for (const item of areaItems) {
        if (!allowedAreaIds.has(item.subject_area_id))
          throw new ForbiddenException(`No tienes permiso para registrar notas del área ${item.subject_area_id}`)
        if (!Number.isInteger(item.points) || item.points < 0 || item.points > 15)
          throw new BadRequestException(`points para ítem "${item.item_key}" debe ser entero entre 0 y 15`)
      }

      // Upsert de ítems
      const itemOps = areaItems.map(item =>
        this.prisma.student_area_grade_items.upsert({
          where: {
            enrollment_id_subject_area_id_academic_period_id_item_key: {
              enrollment_id:      item.enrollment_id,
              subject_area_id:    item.subject_area_id,
              academic_period_id: body.period_id,
              item_key:           item.item_key,
            },
          },
          create: {
            school_id:          user.school_id,
            enrollment_id:      item.enrollment_id,
            subject_area_id:    item.subject_area_id,
            academic_period_id: body.period_id,
            item_key:           item.item_key,
            points:             item.points,
            updated_at:         new Date(),
          },
          update: { points: item.points, updated_at: new Date() },
        })
      )

      // Calcular total por (enrollment, area) sumando todos los ítems enviados
      const totalMap = new Map<string, number>()
      for (const item of areaItems) {
        const key = `${item.enrollment_id}:${item.subject_area_id}`
        totalMap.set(key, (totalMap.get(key) ?? 0) + item.points)
      }
      const areaOps = [...totalMap.entries()].map(([key, total]) => {
        const [enrollment_id, subject_area_id] = key.split(':')
        return this.prisma.student_area_grades.upsert({
          where: {
            enrollment_id_subject_area_id_academic_period_id: {
              enrollment_id,
              subject_area_id,
              academic_period_id: body.period_id,
            },
          },
          create: {
            school_id:          user.school_id,
            enrollment_id,
            subject_area_id,
            academic_period_id: body.period_id,
            points:             total,
            updated_at:         new Date(),
          },
          update: { points: total, updated_at: new Date() },
        })
      })

      const absenceRows = (body.absences ?? []).filter(a => a.absences > 0)
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
          update: { absences: a.absences, updated_at: new Date() },
        })
      )

      await this.prisma.$transaction([...itemOps, ...areaOps, ...absenceOps])
      return {
        items_synced:    areaItems.length,
        areas_synced:    areaOps.length,
        absences_synced: absenceRows.length,
      }
    }

    // ── Modo NUMERIC / QUALITATIVE ────────────────────────────────────────────
    const allowedSubjectIds = new Set(teacherSubjectRows.map(r => r.subject_id))
    const forbidden = body.grades.find(g => !allowedSubjectIds.has(g.subject_id))
    if (forbidden) throw new ForbiddenException(`No tienes permiso para registrar notas de la asignatura ${forbidden.subject_id}`)

    const validQual = new Set(['I', 'A', 'S', 'E'])
    for (const g of body.grades) {
      if (g.qualitative_grade && !validQual.has(g.qualitative_grade))
        throw new BadRequestException(`Invalid qualitative_grade: "${g.qualitative_grade}"`)
      if (g.numeric_grade !== undefined && g.numeric_grade !== null) {
        if (g.numeric_grade < 0 || g.numeric_grade > 5.0)
          throw new BadRequestException('numeric_grade must be between 0.0 and 5.0')
      }
    }

    const absenceRows = (body.absences ?? []).filter(a => a.absences > 0)
    for (const a of absenceRows) {
      if (!Number.isInteger(a.absences) || a.absences < 0)
        throw new BadRequestException('absences must be a non-negative integer')
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
      }),
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
        update: { absences: a.absences, updated_at: new Date() },
      })
    )

    if (gradeOps.length > 0 || absenceOps.length > 0) {
      await this.prisma.$transaction([...gradeOps, ...absenceOps])
    }

    return { synced: body.grades.length, absences_synced: absenceRows.length }
  }

  // ── Registro de asistencia ──────────────────────────────────────────────

  /**
   * "Clases" disponibles para tomar asistencia en una fecha: cruce entre las
   * asignaturas del docente (grade_subjects) y las secciones de ese grado/año.
   */
  @Get('attendance/classes')
  async getAttendanceClasses(
    @CurrentUser() user: JwtPayload,
    @Query('date') date: string,
  ) {
    if (!date) throw new BadRequestException('date is required')
    if (!user.teacher_id) return []

    const gradeSubjects = await this.prisma.grade_subjects.findMany({
      where: { teacher_id: user.teacher_id, school_id: user.school_id },
      select: {
        id: true, grade_id: true, academic_year_id: true,
        subjects: { select: { id: true, name: true } },
      },
    })
    if (gradeSubjects.length === 0) return []

    const sections = await this.prisma.sections.findMany({
      where: {
        OR: gradeSubjects.map(gs => ({ grade_id: gs.grade_id, academic_year_id: gs.academic_year_id })),
        grades: { school_id: user.school_id },
      },
      select: { id: true, name: true, grade_id: true, academic_year_id: true },
    })

    const dateObj = new Date(date)
    const existing = await this.prisma.attendances.findMany({
      where: {
        grade_subject_id: { in: gradeSubjects.map(gs => gs.id) },
        date: dateObj,
      },
      select: { grade_subject_id: true, enrollments: { select: { section_id: true } } },
    })
    const takenKeys = new Set(existing.map(e => `${e.grade_subject_id}:${e.enrollments?.section_id}`))

    const classes: Array<{
      section_id: string; section_name: string
      grade_subject_id: string; subject_id: string; subject_name: string
      already_taken: boolean
    }> = []
    for (const gs of gradeSubjects) {
      const matchingSections = sections.filter(
        s => s.grade_id === gs.grade_id && s.academic_year_id === gs.academic_year_id,
      )
      for (const s of matchingSections) {
        classes.push({
          section_id:       s.id,
          section_name:     s.name,
          grade_subject_id: gs.id,
          subject_id:       gs.subjects.id,
          subject_name:     gs.subjects.name,
          already_taken:    takenKeys.has(`${gs.id}:${s.id}`),
        })
      }
    }
    return classes
  }

  /** Roster de una sección con la asistencia ya registrada (si existe) para esa materia/fecha */
  @Get('attendance')
  async getAttendance(
    @CurrentUser() user: JwtPayload,
    @Query('section_id')      sectionId:      string,
    @Query('grade_subject_id') gradeSubjectId: string,
    @Query('date')             date:           string,
  ) {
    if (!sectionId || !gradeSubjectId || !date)
      throw new BadRequestException('section_id, grade_subject_id and date are required')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where:  { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const gradeSubject = await this.prisma.grade_subjects.findFirst({
      where: {
        id: gradeSubjectId, teacher_id: user.teacher_id, school_id: user.school_id,
        grade_id: section.grade_id, academic_year_id: section.academic_year_id,
      },
    })
    if (!gradeSubject) throw new ForbiddenException('No tienes esta asignatura asignada en esta sección')

    const dateObj = new Date(date)
    const [enrollments, existing] = await Promise.all([
      this.prisma.enrollments.findMany({
        where:   { section_id: sectionId, status: 'ACTIVE' },
        select:  { id: true, students: { select: { first_name: true, last_name: true } } },
        orderBy: { students: { last_name: 'asc' } },
      }),
      this.prisma.attendances.findMany({
        where:  { grade_subject_id: gradeSubjectId, date: dateObj, enrollments: { section_id: sectionId } },
        select: { enrollment_id: true, present: true },
      }),
    ])

    const presentMap = new Map(existing.map(e => [e.enrollment_id, e.present]))

    return enrollments.map(e => ({
      enrollment_id: e.id,
      first_name:    e.students?.first_name ?? '',
      last_name:     e.students?.last_name  ?? '',
      present:       presentMap.has(e.id) ? presentMap.get(e.id) : null,
    }))
  }

  /** Guarda la asistencia de una clase (sección+materia+fecha) y recalcula inasistencias del período */
  @Post('attendance')
  async saveAttendance(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      section_id:        string
      grade_subject_id:  string
      date:              string
      records: Array<{ enrollment_id: string; present: boolean }>
    },
  ) {
    if (!body.section_id || !body.grade_subject_id || !body.date)
      throw new BadRequestException('section_id, grade_subject_id and date are required')
    if (!Array.isArray(body.records) || body.records.length === 0)
      throw new BadRequestException('records must be a non-empty array')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where:  { id: body.section_id, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const gradeSubject = await this.prisma.grade_subjects.findFirst({
      where: {
        id: body.grade_subject_id, teacher_id: user.teacher_id, school_id: user.school_id,
        grade_id: section.grade_id, academic_year_id: section.academic_year_id,
      },
    })
    if (!gradeSubject) throw new ForbiddenException('No tienes esta asignatura asignada en esta sección')

    const validEnrollments = await this.prisma.enrollments.findMany({
      where:  { id: { in: body.records.map(r => r.enrollment_id) }, section_id: body.section_id, status: 'ACTIVE' },
      select: { id: true },
    })
    const validIds = new Set(validEnrollments.map(e => e.id))
    const invalid = body.records.find(r => !validIds.has(r.enrollment_id))
    if (invalid) throw new BadRequestException(`enrollment_id ${invalid.enrollment_id} no pertenece a esta sección`)

    const dateObj = new Date(body.date)
    const academicPeriod = await this.prisma.academic_periods.findFirst({
      where: {
        school_id: user.school_id,
        academic_year_id: section.academic_year_id,
        start_date: { lte: dateObj },
        end_date:   { gte: dateObj },
      },
    })
    if (!academicPeriod)
      throw new BadRequestException('La fecha no cae dentro de ningún período académico')

    const attendanceOps = body.records.map(r =>
      this.prisma.attendances.upsert({
        where: {
          enrollment_id_grade_subject_id_date: {
            enrollment_id:    r.enrollment_id,
            grade_subject_id: body.grade_subject_id,
            date:             dateObj,
          },
        },
        create: {
          school_id:          user.school_id!,
          enrollment_id:      r.enrollment_id,
          grade_subject_id:   body.grade_subject_id,
          academic_period_id: academicPeriod.id,
          date:               dateObj,
          present:            r.present,
          recorded_by:        user.sub,
        },
        update: {
          present:     r.present,
          recorded_by: user.sub,
          updated_at:  new Date(),
        },
      }),
    )
    await this.prisma.$transaction(attendanceOps)

    // Recalcular inasistencias del período: días distintos con al menos una falta (no la suma de faltas por materia)
    const affectedEnrollmentIds = [...new Set(body.records.map(r => r.enrollment_id))]
    const absenceUpserts = []
    for (const enrollmentId of affectedEnrollmentIds) {
      const absentDates = await this.prisma.attendances.findMany({
        where:    { enrollment_id: enrollmentId, academic_period_id: academicPeriod.id, present: false },
        select:   { date: true },
        distinct: ['date'],
      })
      absenceUpserts.push(
        this.prisma.student_period_absences.upsert({
          where: {
            enrollment_id_academic_period_id: {
              enrollment_id:      enrollmentId,
              academic_period_id: academicPeriod.id,
            },
          },
          create: {
            school_id:          user.school_id!,
            enrollment_id:      enrollmentId,
            academic_period_id: academicPeriod.id,
            absences:           absentDates.length,
            updated_at:         new Date(),
          },
          update: { absences: absentDates.length, updated_at: new Date() },
        }),
      )
    }
    if (absenceUpserts.length > 0) await this.prisma.$transaction(absenceUpserts)

    return { synced: body.records.length }
  }

  /** Reporte de asistencia por sección/materia/período — solo las asignaturas del docente */
  @Get('attendance/report')
  async getAttendanceReport(
    @CurrentUser() user: JwtPayload,
    @Query('section_id')       sectionId:      string,
    @Query('grade_subject_id') gradeSubjectId: string,
    @Query('period_id')        periodId:       string,
  ) {
    if (!sectionId || !periodId) throw new BadRequestException('section_id and period_id are required')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where:  { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const teacherSubjects = await this.prisma.grade_subjects.findMany({
      where: {
        teacher_id: user.teacher_id, school_id: user.school_id,
        grade_id: section.grade_id, academic_year_id: section.academic_year_id,
        ...(gradeSubjectId ? { id: gradeSubjectId } : {}),
      },
      select: { id: true },
    })
    if (teacherSubjects.length === 0)
      throw new ForbiddenException('No tienes asignaturas asignadas en esta sección')

    const gsIds = teacherSubjects.map(g => g.id)

    const [enrollments, records, absences] = await Promise.all([
      this.prisma.enrollments.findMany({
        where:   { section_id: sectionId, status: 'ACTIVE' },
        select:  { id: true, students: { select: { first_name: true, last_name: true } } },
        orderBy: { students: { last_name: 'asc' } },
      }),
      this.prisma.attendances.findMany({
        where:  { grade_subject_id: { in: gsIds }, academic_period_id: periodId },
        select: { enrollment_id: true, present: true },
      }),
      this.prisma.student_period_absences.findMany({
        where:  { academic_period_id: periodId, enrollments: { section_id: sectionId } },
        select: { enrollment_id: true, absences: true },
      }),
    ])

    const absenceMap = new Map(absences.map(a => [a.enrollment_id, a.absences]))

    return enrollments.map(e => {
      const studentRecords = records.filter(r => r.enrollment_id === e.id)
      return {
        enrollment_id:         e.id,
        first_name:            e.students?.first_name ?? '',
        last_name:             e.students?.last_name  ?? '',
        total_classes:         studentRecords.length,
        total_absent_records:  studentRecords.filter(r => !r.present).length,
        period_absence_days:   absenceMap.get(e.id) ?? 0,
      }
    })
  }

  /**
   * Secciones donde el docente tiene asignaturas asignadas en grade_subjects.
   * Mismo query que /academic-record/sections, reutilizado para el selector de pre-informes.
   */
  @Get('pre-informe/sections')
  async getPreInformeSections(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) return []

    const teacherGrades = await this.prisma.grade_subjects.findMany({
      where:    { teacher_id: user.teacher_id, school_id: user.school_id },
      select:   { grade_id: true, academic_year_id: true },
      distinct: ['grade_id', 'academic_year_id'],
    })
    if (teacherGrades.length === 0) return []

    const sections = await this.prisma.sections.findMany({
      where: {
        OR: teacherGrades.map(tg => ({
          grade_id:         tg.grade_id,
          academic_year_id: tg.academic_year_id,
        })),
        grades: { school_id: user.school_id },
      },
      include: {
        grades:         { select: { id: true, name: true, level: true } },
        academic_years: {
          select: {
            id: true, label: true,
            academic_periods: {
              orderBy: { sort_order: 'asc' },
              select: { id: true, name: true, period_number: true, weight_percentage: true },
            },
          },
        },
      },
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades: { level: 'asc' } },
        { name: 'asc' },
      ],
    })

    return sections.map(s => ({
      id:               s.id,
      name:             s.name,
      grade_id:         s.grade_id,
      grade_name:       s.grades?.name ?? '',
      grade_level:      s.grades?.level ?? 0,
      academic_year_id: s.academic_year_id,
      year_label:       s.academic_years?.label ?? '',
      periods:          (s.academic_years?.academic_periods ?? []).map(p => ({
        id:                p.id,
        name:              p.name,
        period_number:     p.period_number,
        weight_percentage: p.weight_percentage ? Number(p.weight_percentage) : null,
      })),
    }))
  }

  /** Roster de la sección + asignaturas del docente + pre-informes ya registrados en el período */
  @Get('pre-informe')
  async getPreInforme(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId)       throw new BadRequestException('section_id is required')
    if (!periodId)        throw new BadRequestException('period_id is required')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const [period, enrollments, gradeSubjects, existingPreInformes] = await Promise.all([
      this.prisma.academic_periods.findFirst({
        where: { id: periodId, school_id: user.school_id },
        select: { id: true, name: true, period_number: true },
      }),
      this.prisma.enrollments.findMany({
        where: { section_id: sectionId, status: 'ACTIVE' },
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
          teacher_id:       user.teacher_id,
        },
        select: {
          subject_id: true,
          subjects:   { select: { id: true, name: true, sort_order: true } },
        },
        orderBy: { subjects: { sort_order: 'asc' } },
      }),
      this.prisma.pre_informes.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: {
          id: true, enrollment_id: true, subject_id: true,
          reason_1: true, reason_2: true, reason_3: true,
        },
      }),
    ])

    if (gradeSubjects.length === 0)
      throw new ForbiddenException('No tienes asignaturas asignadas en esta sección para el año seleccionado')

    return {
      period: period ? { id: period.id, name: period.name, period_number: period.period_number } : null,
      students: enrollments.map(e => ({
        enrollment_id: e.id,
        first_name:    e.students?.first_name ?? '',
        last_name:     e.students?.last_name  ?? '',
      })),
      subjects: gradeSubjects.map(gs => ({
        id:         gs.subjects.id,
        name:       gs.subjects.name,
        sort_order: gs.subjects.sort_order,
      })),
      pre_informes: existingPreInformes,
    }
  }

  /** Crear o actualizar un pre-informe (una vez por estudiante + asignatura + período) */
  @Post('pre-informe')
  async savePreInforme(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      section_id:    string
      period_id:     string
      subject_id:    string
      enrollment_id: string
      reason_1:      string
      reason_2:      string
      reason_3:      string
    },
  ) {
    if (!body.section_id || !body.period_id || !body.subject_id || !body.enrollment_id)
      throw new BadRequestException('section_id, period_id, subject_id and enrollment_id are required')
    if (!body.reason_1?.trim() || !body.reason_2?.trim() || !body.reason_3?.trim())
      throw new BadRequestException('Los 3 motivos son obligatorios')
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const section = await this.prisma.sections.findFirst({
      where: { id: body.section_id, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new ForbiddenException('Sección no encontrada')

    const allowedSubject = await this.prisma.grade_subjects.findFirst({
      where: {
        school_id:        user.school_id,
        grade_id:         section.grade_id,
        academic_year_id: section.academic_year_id,
        teacher_id:       user.teacher_id,
        subject_id:       body.subject_id,
      },
      select: { subject_id: true },
    })
    if (!allowedSubject) throw new ForbiddenException('No tienes permiso para reportar esta asignatura')

    const enrollment = await this.prisma.enrollments.findFirst({
      where: { id: body.enrollment_id, section_id: body.section_id },
      select: { id: true },
    })
    if (!enrollment) throw new BadRequestException('El estudiante no pertenece a esta sección')

    return this.prisma.pre_informes.upsert({
      where: {
        enrollment_id_subject_id_academic_period_id: {
          enrollment_id:      body.enrollment_id,
          subject_id:         body.subject_id,
          academic_period_id: body.period_id,
        },
      },
      create: {
        school_id:          user.school_id,
        enrollment_id:      body.enrollment_id,
        subject_id:         body.subject_id,
        academic_period_id: body.period_id,
        teacher_id:         user.teacher_id,
        reason_1:           body.reason_1.trim(),
        reason_2:           body.reason_2.trim(),
        reason_3:           body.reason_3.trim(),
      },
      update: {
        reason_1:   body.reason_1.trim(),
        reason_2:   body.reason_2.trim(),
        reason_3:   body.reason_3.trim(),
        updated_at: new Date(),
      },
    })
  }

  /** Quitar un pre-informe (solo el docente que lo creó) */
  @Delete('pre-informe/:id')
  async deletePreInforme(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')

    const existing = await this.prisma.pre_informes.findFirst({
      where: { id, teacher_id: user.teacher_id, school_id: user.school_id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Pre-informe no encontrado')

    await this.prisma.pre_informes.delete({ where: { id } })
    return { ok: true }
  }
}
