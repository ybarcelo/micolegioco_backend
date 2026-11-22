import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  isFailingNumeric, isFailingPoints,
  performanceLevelNumeric, pointsLevel, type PerformanceLevel,
} from '../../common/utils/grade-level.util'

export interface SnapshotStudentEntry {
  student_id:       string
  first_name:       string
  second_name:      string | null
  last_name:        string
  second_last_name: string | null
  grade_name:       string
  section_name:     string
  overall_average:  number
  graded_columns:   number
  total_columns:    number
  failing_count:    number
  performance_level: PerformanceLevel
}

export interface PerformanceBucket { level: PerformanceLevel; count: number; pct: number }

export interface AcademicSnapshot {
  scale_type:              string
  top_best:                SnapshotStudentEntry[]
  top_at_risk:             SnapshotStudentEntry[]
  school_average:          number | null
  performance_distribution: PerformanceBucket[]
  completion_rate:         number | null
}

export interface LiveAcademicCounts {
  total_students: number
  by_grade: { grade_id: string; grade_name: string; level: number; count: number }[]
}

/** Entrada intermedia por MATRÍCULA (antes de deduplicar por estudiante) */
interface EnrollmentEntry extends SnapshotStudentEntry {
  enrollment_id:   string
  enrollment_date: Date | null
}

@Injectable()
export class AcademicSnapshotService {
  constructor(private prisma: PrismaService) {}

  async getActiveAcademicYear(schoolId: string) {
    const years = await this.prisma.academic_years.findMany({
      where: { school_id: schoolId, is_active: true },
      orderBy: { start_date: 'desc' },
    })
    return years[0] ?? null
  }

  /** Conteos baratos (COUNT/GROUP BY), se recalculan en cada carga del dashboard. */
  async getLiveCounts(schoolId: string): Promise<LiveAcademicCounts> {
    const year = await this.getActiveAcademicYear(schoolId)

    if (year) {
      const rows = await this.prisma.enrollments.findMany({
        where: { status: 'ACTIVE', sections: { academic_year_id: year.id, grades: { school_id: schoolId } } },
        select: {
          student_id: true,
          sections: { select: { grades: { select: { id: true, name: true, level: true } } } },
        },
      })
      return this.tallyByGrade(rows.map(r => ({ student_id: r.student_id, grade: r.sections?.grades ?? null })))
    }

    // Sin año marcado como activo (dato de configuración faltante): no mostramos "0
    // estudiantes" en un colegio real, caemos a un conteo año-agnóstico por students.status.
    const students = await this.prisma.students.findMany({
      where: { school_id: schoolId, status: 'ACTIVE' },
      select: { id: true, grades: { select: { id: true, name: true, level: true } } },
    })
    return this.tallyByGrade(students.map(s => ({ student_id: s.id, grade: s.grades })))
  }

  private tallyByGrade(rows: { student_id: string | null; grade: { id: string; name: string; level: number } | null }[]): LiveAcademicCounts {
    const seen = new Set<string>()
    const counts = new Map<string, { grade_id: string; grade_name: string; level: number; count: number }>()
    for (const r of rows) {
      if (!r.student_id || seen.has(r.student_id)) continue
      seen.add(r.student_id)
      if (!r.grade) continue
      const entry = counts.get(r.grade.id) ?? { grade_id: r.grade.id, grade_name: r.grade.name, level: r.grade.level, count: 0 }
      entry.count++
      counts.set(r.grade.id, entry)
    }
    return {
      total_students: seen.size,
      by_grade: [...counts.values()].sort((a, b) => a.level - b.level),
    }
  }

  /**
   * El cálculo caro: promedio general de CADA estudiante del colegio (misma fórmula que
   * ReportsController.getGeneralAverageReport, pero agrupado por grado en vez de por sección
   * y para todo el colegio a la vez). Solo se invoca desde el DashboardController cuando el
   * snapshot nunca se ha calculado o cuando el rector pide "Recalcular ahora" — nunca en
   * cada GET del dashboard.
   */
  async computeSnapshot(schoolId: string): Promise<AcademicSnapshot> {
    const config = await this.prisma.grading_scale_config.findUnique({ where: { school_id: schoolId } })
    const resolvedConfig = config ?? { scale_type: 'NUMERIC', cumulative: true }
    const isPoints      = resolvedConfig.scale_type === 'POINTS'
    const isQualitative = resolvedConfig.scale_type === 'QUALITATIVE'

    const year = await this.getActiveAcademicYear(schoolId)

    // Igual que en el reporte de Promedio General: la escala cualitativa no guarda
    // numeric_grade, así que hoy no produce columnas aquí tampoco — nos ahorramos las
    // consultas y devolvemos listas vacías con la escala, para que el frontend lo explique.
    if (!year || isQualitative) {
      return {
        scale_type: resolvedConfig.scale_type, top_best: [], top_at_risk: [],
        school_average: null, performance_distribution: [], completion_rate: null,
      }
    }

    const periods = await this.prisma.academic_periods.findMany({
      where: { school_id: schoolId, academic_year_id: year.id },
      orderBy: { period_number: 'asc' },
      select: { id: true, period_number: true },
    })
    const periodIds = periods.map(p => p.id)
    const periodNumberById = new Map(periods.map(p => [p.id, p.period_number]))

    const sections = await this.prisma.sections.findMany({
      where: { academic_year_id: year.id, grades: { school_id: schoolId } },
      select: { id: true, name: true, grade_id: true, grades: { select: { id: true, name: true } } },
    })
    const sectionIdsByGrade = new Map<string, string[]>()
    for (const s of sections) {
      if (!s.grade_id) continue
      const arr = sectionIdsByGrade.get(s.grade_id) ?? []
      arr.push(s.id)
      sectionIdsByGrade.set(s.grade_id, arr)
    }

    const enrollments = await this.prisma.enrollments.findMany({
      where: { status: 'ACTIVE', section_id: { in: sections.map(s => s.id) } },
      select: {
        id: true, student_id: true, section_id: true, enrollment_date: true,
        students: { select: { id: true, first_name: true, second_name: true, last_name: true, second_last_name: true } },
      },
    })
    const enrollmentsBySection = new Map<string, typeof enrollments>()
    for (const e of enrollments) {
      if (!e.section_id) continue
      const arr = enrollmentsBySection.get(e.section_id) ?? []
      arr.push(e)
      enrollmentsBySection.set(e.section_id, arr)
    }
    const sectionById = new Map(sections.map(s => [s.id, s]))

    const allEntries: EnrollmentEntry[] = []
    let completionFilled   = 0
    let completionExpected = 0

    for (const [gradeId, sectionIds] of sectionIdsByGrade) {
      const gradeEnrollments = sectionIds.flatMap(sid => enrollmentsBySection.get(sid) ?? [])
      if (gradeEnrollments.length === 0) continue
      const enrollmentIds = gradeEnrollments.map(e => e.id)

      const gradeSubjects = await this.prisma.grade_subjects.findMany({
        where: { school_id: schoolId, grade_id: gradeId, academic_year_id: year.id },
        select: { subject_id: true, subjects: { select: { id: true, subject_areas: { select: { id: true } } } } },
      })
      if (gradeSubjects.length === 0) continue // grado sin plan de estudios configurado (p.ej. preescolar en modo dimensiones)

      let columnIds: string[]
      let rawRows: { enrollment_id: string; column_id: string; value: number; academic_period_id: string }[]

      if (isPoints) {
        const areaIds = new Set<string>()
        for (const gs of gradeSubjects) { const a = gs.subjects.subject_areas; if (a?.id) areaIds.add(a.id) }
        columnIds = [...areaIds]

        const areaGrades = await this.prisma.student_area_grades.findMany({
          where: { school_id: schoolId, academic_period_id: { in: periodIds }, enrollment_id: { in: enrollmentIds } },
          select: { enrollment_id: true, subject_area_id: true, points: true, academic_period_id: true },
        })
        rawRows = areaGrades.map(g => ({ enrollment_id: g.enrollment_id, column_id: g.subject_area_id, value: g.points, academic_period_id: g.academic_period_id }))
      } else {
        columnIds = gradeSubjects.map(gs => gs.subject_id)

        const grades = await this.prisma.student_grades.findMany({
          where: { school_id: schoolId, academic_period_id: { in: periodIds }, enrollment_id: { in: enrollmentIds }, numeric_grade: { not: null } },
          select: { enrollment_id: true, subject_id: true, numeric_grade: true, academic_period_id: true },
        })
        rawRows = grades.map(g => ({ enrollment_id: g.enrollment_id, column_id: g.subject_id, value: Number(g.numeric_grade), academic_period_id: g.academic_period_id }))
      }

      // "Períodos ejecutados" de ESTE grado (un grado puede ir más adelante que otro).
      const periodsWithData = new Set(rawRows.map(r => r.academic_period_id))
      const executedForGrade = periods.filter(p => periodsWithData.has(p.id))
      if (executedForGrade.length === 0) continue
      const latestPeriod = executedForGrade[executedForGrade.length - 1]
      const latestPeriodNumber = latestPeriod.period_number
      const sumInsteadOfAverage = isPoints && resolvedConfig.cumulative

      // Completitud: cuántas de las casillas (estudiante × columna) del período MÁS
      // RECIENTE de este grado ya tienen nota — no de todo el año, que ya está cerrado.
      completionExpected += gradeEnrollments.length * columnIds.length
      completionFilled   += rawRows.filter(r => r.academic_period_id === latestPeriod.id).length

      const perStudentColumnValues = new Map<string, Map<string, number[]>>()
      for (const row of rawRows) {
        if (sumInsteadOfAverage && (periodNumberById.get(row.academic_period_id) ?? Infinity) > latestPeriodNumber) continue
        const sMap = perStudentColumnValues.get(row.enrollment_id) ?? new Map<string, number[]>()
        const arr = sMap.get(row.column_id) ?? []
        arr.push(row.value)
        sMap.set(row.column_id, arr)
        perStudentColumnValues.set(row.enrollment_id, sMap)
      }

      for (const e of gradeEnrollments) {
        const sMap = perStudentColumnValues.get(e.id)
        const columnAverages: number[] = []
        let failingCount = 0
        for (const colId of columnIds) {
          const values = sMap?.get(colId)
          if (!values || values.length === 0) continue // sin calificar: no cuenta como columna ni como perdida
          const total = values.reduce((s, v) => s + v, 0)
          const value = sumInsteadOfAverage ? total : total / values.length
          columnAverages.push(value)
          const failing = isPoints ? isFailingPoints(value, latestPeriodNumber) : isFailingNumeric(value)
          if (failing) failingCount++
        }
        if (columnAverages.length === 0 || !e.students) continue

        const section = sectionById.get(e.section_id ?? '')
        const overallAverage = columnAverages.reduce((s, v) => s + v, 0) / columnAverages.length
        allEntries.push({
          enrollment_id:     e.id,
          enrollment_date:   e.enrollment_date,
          student_id:        e.students.id,
          first_name:        e.students.first_name,
          second_name:       e.students.second_name,
          last_name:         e.students.last_name,
          second_last_name:  e.students.second_last_name,
          grade_name:        section?.grades?.name ?? '',
          section_name:      section?.name ?? '',
          overall_average:   overallAverage,
          graded_columns:    columnAverages.length,
          total_columns:     columnIds.length,
          failing_count:     failingCount,
          performance_level: isPoints ? pointsLevel(overallAverage, latestPeriodNumber) : performanceLevelNumeric(overallAverage),
        })
      }
    }

    // Deduplicar por estudiante (el schema no impide una matrícula activa en más de una
    // sección): nos quedamos con la de más columnas calificadas, y si empatan, la más reciente.
    const bestByStudent = new Map<string, EnrollmentEntry>()
    for (const entry of allEntries) {
      const current = bestByStudent.get(entry.student_id)
      if (!current) { bestByStudent.set(entry.student_id, entry); continue }
      const currentDate = current.enrollment_date?.getTime() ?? 0
      const entryDate   = entry.enrollment_date?.getTime()   ?? 0
      const better = entry.graded_columns > current.graded_columns ||
        (entry.graded_columns === current.graded_columns && entryDate > currentDate)
      if (better) bestByStudent.set(entry.student_id, entry)
    }
    const finalEntries = [...bestByStudent.values()]

    const nameKey = (e: SnapshotStudentEntry) => `${e.last_name} ${e.second_last_name ?? ''} ${e.first_name}`.trim()
    const strip = ({ enrollment_id: _ei, enrollment_date: _ed, ...rest }: EnrollmentEntry): SnapshotStudentEntry => rest

    const topBest = [...finalEntries]
      .sort((a, b) =>
        b.overall_average - a.overall_average ||
        b.graded_columns  - a.graded_columns ||
        nameKey(a).localeCompare(nameKey(b)))
      .slice(0, 10)
      .map(strip)

    const topAtRisk = finalEntries
      .filter(e => e.failing_count >= 1)
      .sort((a, b) =>
        b.failing_count    - a.failing_count ||
        a.overall_average   - b.overall_average ||
        nameKey(a).localeCompare(nameKey(b)))
      .slice(0, 10)
      .map(strip)

    const schoolAverage = finalEntries.length > 0
      ? finalEntries.reduce((s, e) => s + e.overall_average, 0) / finalEntries.length
      : null

    const LEVELS: PerformanceLevel[] = ['Bajo', 'Básico', 'Alto', 'Superior']
    const performanceDistribution: PerformanceBucket[] = LEVELS.map(level => {
      const count = finalEntries.filter(e => e.performance_level === level).length
      return { level, count, pct: finalEntries.length > 0 ? (count / finalEntries.length) * 100 : 0 }
    })

    const completionRate = completionExpected > 0 ? (completionFilled / completionExpected) * 100 : null

    return {
      scale_type:   resolvedConfig.scale_type,
      top_best:     topBest,
      top_at_risk:  topAtRisk,
      school_average: schoolAverage,
      performance_distribution: performanceDistribution,
      completion_rate: completionRate,
    }
  }
}
