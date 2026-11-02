import {
  Controller,
  Get,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/reports')
@Roles('RECTOR', 'SECRETARIO')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('simat')
  async getSimatReport(@CurrentUser() user: JwtPayload) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        v.codigo_dane_colegio,
        v.document_type,
        v.document_number,
        v.nombre_completo,
        v.birth_date,
        v.gender,
        v.grado_actual,
        v.grupo
      FROM view_simat_report v
      JOIN schools sc ON sc.dane_code = v.codigo_dane_colegio
      WHERE sc.id = ${user.school_id}::uuid
      ORDER BY v.grado_actual, v.grupo, v.nombre_completo
    `
    return rows
  }

  /** Secciones del colegio con sus períodos, selector compartido por los reportes de notas y asistencia */
  @Get('sections')
  async getSections(@CurrentUser() user: JwtPayload) {
    const sections = await this.prisma.sections.findMany({
      where: { grades: { school_id: user.school_id } },
      include: {
        grades: { select: { id: true, name: true, level: true } },
        academic_years: {
          select: {
            id: true, label: true,
            academic_periods: {
              orderBy: { sort_order: 'asc' },
              select: { id: true, name: true, period_number: true },
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
      grade_name:       s.grades?.name  ?? '',
      grade_level:      s.grades?.level ?? 0,
      academic_year_id: s.academic_year_id,
      year_label:       s.academic_years?.label ?? '',
      periods:          (s.academic_years?.academic_periods ?? []).map(p => ({
        id: p.id, name: p.name, period_number: p.period_number,
      })),
    }))
  }

  /**
   * Reporte consolidado de notas por sección + período (y, opcionalmente del lado del
   * cliente, por materia). Mismo shape que el grid de boletines (academic-record/grades),
   * de solo lectura.
   */
  @Get('academic-grades')
  async getAcademicGradesReport(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId) throw new BadRequestException('section_id is required')
    if (!periodId)  throw new BadRequestException('period_id is required')

    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, grades: { school_id: user.school_id } },
      select: { grade_id: true, academic_year_id: true },
    })
    if (!section) throw new NotFoundException('Sección no encontrada')

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
            students: { select: { id: true, first_name: true, last_name: true, photo_path: true } },
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

    let areas: { id: string; name: string; sort_order: number }[] = []
    let area_grades: { enrollment_id: string; subject_area_id: string; points: number; cumulative_points: number }[] = []

    if (resolvedConfig.scale_type === 'POINTS' && period) {
      const areaMap = new Map<string, { id: string; name: string; sort_order: number }>()
      for (const gs of gradeSubjects) {
        const a = gs.subjects.subject_areas
        if (a?.id && !areaMap.has(a.id))
          areaMap.set(a.id, { id: a.id, name: a.name, sort_order: a.sort_order ?? 0 })
      }
      areas = [...areaMap.values()].sort((a, b) => a.sort_order - b.sort_order)

      const priorPeriods = await this.prisma.academic_periods.findMany({
        where: {
          academic_year_id: section.academic_year_id,
          school_id:        user.school_id,
          period_number:    { lte: period.period_number },
        },
        select: { id: true },
      })

      const currentAreaGrades = await this.prisma.student_area_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, subject_area_id: true, points: true },
      })

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
        student_id:    e.students?.id ?? '',
        first_name:    e.students?.first_name ?? '',
        last_name:     e.students?.last_name  ?? '',
        photo_path:    e.students?.photo_path ?? null,
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

  /** Asistencia agregada por estudiante en una sección y período, sin restringir por profesor/materia */
  @Get('attendance')
  async getAttendanceReport(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId || !periodId) throw new BadRequestException('section_id and period_id are required')

    const section = await this.prisma.sections.findFirst({
      where:  { id: sectionId, grades: { school_id: user.school_id } },
      select: { id: true },
    })
    if (!section) throw new NotFoundException('Sección no encontrada')

    const [enrollments, records, absences] = await Promise.all([
      this.prisma.enrollments.findMany({
        where:   { section_id: sectionId, status: 'ACTIVE' },
        select:  { id: true, students: { select: { first_name: true, last_name: true } } },
        orderBy: { students: { last_name: 'asc' } },
      }),
      this.prisma.attendances.findMany({
        where: { academic_period_id: periodId, enrollments: { section_id: sectionId } },
        select: {
          enrollment_id: true,
          present:       true,
          grade_subjects: { select: { subjects: { select: { name: true } } } },
        },
      }),
      this.prisma.student_period_absences.findMany({
        where:  { academic_period_id: periodId, enrollments: { section_id: sectionId } },
        select: { enrollment_id: true, absences: true },
      }),
    ])

    const absenceMap = new Map(absences.map(a => [a.enrollment_id, a.absences]))

    return enrollments.map(e => {
      const studentRecords = records.filter(r => r.enrollment_id === e.id)

      const bySubject = new Map<string, { present: number; absent: number }>()
      for (const r of studentRecords) {
        const name  = r.grade_subjects.subjects.name
        const entry = bySubject.get(name) ?? { present: 0, absent: 0 }
        if (r.present) entry.present++; else entry.absent++
        bySubject.set(name, entry)
      }

      return {
        enrollment_id:        e.id,
        first_name:           e.students?.first_name ?? '',
        last_name:            e.students?.last_name  ?? '',
        total_classes:        studentRecords.length,
        total_absent_records: studentRecords.filter(r => !r.present).length,
        period_absence_days:  absenceMap.get(e.id) ?? 0,
        by_subject: [...bySubject.entries()].map(([subject_name, v]) => ({ subject_name, ...v })),
      }
    })
  }

  /** Consolidado de estudiantes reportados (pre-informes) en un período, para todo el colegio */
  @Get('pre-informe')
  async getPreInformeReport(
    @CurrentUser() user: JwtPayload,
    @Query('period_id') periodId: string,
  ) {
    if (!periodId) throw new BadRequestException('period_id is required')

    const rows = await this.prisma.pre_informes.findMany({
      where: { school_id: user.school_id, academic_period_id: periodId },
      select: {
        id:         true,
        reason_1:   true,
        reason_2:   true,
        reason_3:   true,
        created_at: true,
        enrollments: {
          select: {
            students: { select: { first_name: true, last_name: true } },
            sections: {
              select: {
                name:   true,
                grades: { select: { name: true, level: true } },
              },
            },
          },
        },
        subjects: { select: { name: true } },
        teachers: { select: { first_name: true, last_name: true } },
      },
      orderBy: [
        { enrollments: { sections: { grades: { level: 'asc' } } } },
        { enrollments: { students: { last_name: 'asc' } } },
      ],
    })

    return rows.map(r => ({
      id:           r.id,
      student_name: `${r.enrollments?.students?.last_name ?? ''}, ${r.enrollments?.students?.first_name ?? ''}`,
      grade_name:   r.enrollments?.sections?.grades?.name  ?? '',
      grade_level:  r.enrollments?.sections?.grades?.level ?? 0,
      section_name: r.enrollments?.sections?.name ?? '',
      subject_name: r.subjects?.name ?? '',
      teacher_name: r.teachers ? `${r.teachers.first_name} ${r.teachers.last_name}` : '',
      reason_1:     r.reason_1,
      reason_2:     r.reason_2,
      reason_3:     r.reason_3,
      created_at:   r.created_at,
    }))
  }
}
