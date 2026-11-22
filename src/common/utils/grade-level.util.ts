/**
 * Umbrales de "Bajo" (asignatura/área perdida), puerto exacto de
 * frontend/src/utils/gradeLevel.ts — deben permanecer idénticos para no
 * divergir del criterio que ya usa el boletín y el reporte de Notas.
 */

export function isFailingNumeric(grade: number | null): boolean {
  return grade !== null && grade < 3.0
}

export function isFailingQualitative(grade: string | null): boolean {
  return grade === 'I'
}

const POINTS_BASIC_THRESHOLD = [15, 30, 45, 60]

export function isFailingPoints(points: number | null, periodNumber: number): boolean {
  if (points === null) return false
  const threshold = POINTS_BASIC_THRESHOLD[Math.min(periodNumber, 4) - 1] ?? POINTS_BASIC_THRESHOLD[3]
  return points < threshold
}

export type PerformanceLevel = 'Bajo' | 'Básico' | 'Alto' | 'Superior'

/** Puerto exacto de AcademicRecord.tsx: performanceLevel (rama numérica, 1.0-5.0) */
export function performanceLevelNumeric(grade: number): PerformanceLevel {
  if (grade < 3.0) return 'Bajo'
  if (grade < 4.0) return 'Básico'
  if (grade < 4.5) return 'Alto'
  return 'Superior'
}

/** Puerto exacto de AcademicRecord.tsx: pointsLevel (umbrales por período, acumulado) */
export function pointsLevel(cumulative: number, periodNumber: number): PerformanceLevel {
  const t = [
    [23, 20, 15],  // P1 max 25
    [45, 40, 30],  // P2 max 50
    [68, 60, 45],  // P3 max 75
    [90, 80, 60],  // P4 max 100
  ][Math.min(periodNumber, 4) - 1]
  if (cumulative >= t[0]) return 'Superior'
  if (cumulative >= t[1]) return 'Alto'
  if (cumulative >= t[2]) return 'Básico'
  return 'Bajo'
}
