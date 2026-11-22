import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface PayrollValue {
  monthly_hours:  number
  payable_hours:  number
  hourly_rate:    number
  gross_value:    number
  loan_deduction: number
  net_value:      number
}

/**
 * Fórmula única del "valor a pagar" de un docente: horas de la carga semanal
 * (×4 al mes) por el valor-hora del escalafón, menos las horas no trabajadas,
 * menos la cuota del préstamo del mes (si tiene uno activo). La reutilizan
 * TeacherHoursController (pantalla de horas) y PayrollExportController
 * (archivo bancario) para que nunca diverjan.
 */
@Injectable()
export class PayrollCalcService {
  constructor(private prisma: PrismaService) {}

  computeValue(weeklyHours: number | null, hourlyRate: number | null, deductedHours: number, loanDeduction: number): PayrollValue {
    const monthlyHours = (weeklyHours ?? 0) * 4
    const payableHours = Math.max(0, monthlyHours - deductedHours)
    const rate          = hourlyRate ?? 0
    const grossValue    = Math.round(payableHours * rate)
    const loanDed       = Math.round(loanDeduction)
    const netValue      = Math.max(0, grossValue - loanDed)
    return {
      monthly_hours:  monthlyHours,
      payable_hours:  payableHours,
      hourly_rate:    rate,
      gross_value:    grossValue,
      loan_deduction: loanDed,
      net_value:      netValue,
    }
  }

  /** Suma de cuotas de préstamos ACTIVOS de cada docente para un (año, mes) dado. */
  async getLoanDeductionsForMonth(schoolId: string, year: number, month: number, teacherIds: string[]): Promise<Map<string, number>> {
    if (teacherIds.length === 0) return new Map()
    const rows = await this.prisma.teacher_loan_installments.findMany({
      where: {
        year, month,
        teacher_loans: { school_id: schoolId, status: 'ACTIVE', teacher_id: { in: teacherIds } },
      },
      select: { amount: true, teacher_loans: { select: { teacher_id: true } } },
    })
    const map = new Map<string, number>()
    for (const r of rows) {
      const tid = r.teacher_loans.teacher_id
      map.set(tid, (map.get(tid) ?? 0) + Number(r.amount))
    }
    return map
  }
}
