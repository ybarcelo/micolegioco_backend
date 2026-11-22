import { Controller, Get, Post } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { AcademicSnapshotService } from './academic-snapshot.service'
import { IcfesResultsService } from '../icfes-results/icfes-results.service'

/** Snapshot académico "viejo" después de esto se marca is_stale (no fuerza recálculo). */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private academicSnapshot: AcademicSnapshotService,
    private icfesResults: IcfesResultsService,
  ) {}

  @Get()
  @Roles('RECTOR')
  async getDashboard(@CurrentUser() user: JwtPayload) {
    const now = new Date()
    const y   = now.getFullYear()
    const m   = now.getMonth()
    const d   = now.getDate()

    const todayStart = new Date(y, m, d)
    const todayEnd   = new Date(y, m, d + 1)
    const monthStart = new Date(y, m, 1)
    const monthEnd   = new Date(y, m + 1, 1)
    const yearStart  = new Date(y, 0, 1)
    const yearEnd    = new Date(y + 1, 0, 1)

    const [
      incomeDay, incomeMonth, incomeYear,
      expensesDay, expensesMonth, expensesYear,
      monthly,
      liveCounts,
      academic,
      icfes,
    ] = await Promise.all([
      this.sumType(user.school_id, 'INCOME',  todayStart, todayEnd),
      this.sumType(user.school_id, 'INCOME',  monthStart, monthEnd),
      this.sumType(user.school_id, 'INCOME',  yearStart,  yearEnd),
      this.sumType(user.school_id, 'EXPENSE', todayStart, todayEnd),
      this.sumType(user.school_id, 'EXPENSE', monthStart, monthEnd),
      this.sumType(user.school_id, 'EXPENSE', yearStart,  yearEnd),
      this.monthlyData(user.school_id, y),
      this.academicSnapshot.getLiveCounts(user.school_id),
      this.getOrComputeSnapshot(user.school_id),
      this.icfesResults.getSummary(user.school_id),
    ])

    return {
      income:   { day: incomeDay,   month: incomeMonth,   year: incomeYear   },
      expenses: { day: expensesDay, month: expensesMonth, year: expensesYear },
      monthly,
      year: y,
      academic: { ...liveCounts, ...academic, icfes },
    }
  }

  @Post('recalculate')
  @Roles('RECTOR')
  async recalculate(@CurrentUser() user: JwtPayload) {
    const liveCounts = await this.academicSnapshot.getLiveCounts(user.school_id)
    const snapshot   = await this.academicSnapshot.computeSnapshot(user.school_id)
    const computedAt = new Date()
    await this.prisma.schools.update({
      where: { id: user.school_id },
      data: { academic_snapshot: JSON.parse(JSON.stringify(snapshot)), academic_snapshot_computed_at: computedAt },
    })
    return { ...liveCounts, ...snapshot, computed_at: computedAt, is_stale: false }
  }

  /**
   * Snapshot "suave": si nunca se ha calculado, lo calcula una vez (bloqueante) y lo guarda.
   * Si ya existe, lo devuelve tal cual aunque esté viejo — solo marca is_stale, nunca
   * fuerza el recálculo caro dentro de un GET normal (ver plan: TTL suave + botón manual).
   */
  private async getOrComputeSnapshot(schoolId: string) {
    const school = await this.prisma.schools.findUnique({
      where: { id: schoolId },
      select: { academic_snapshot: true, academic_snapshot_computed_at: true },
    })

    if (!school?.academic_snapshot_computed_at) {
      const snapshot   = await this.academicSnapshot.computeSnapshot(schoolId)
      const computedAt = new Date()
      await this.prisma.schools.update({
        where: { id: schoolId },
        data: { academic_snapshot: JSON.parse(JSON.stringify(snapshot)), academic_snapshot_computed_at: computedAt },
      })
      return { ...snapshot, computed_at: computedAt, is_stale: false }
    }

    const snapshot = (school.academic_snapshot ?? { scale_type: 'NUMERIC', top_best: [], top_at_risk: [] }) as {
      scale_type: string; top_best: unknown[]; top_at_risk: unknown[]
    }
    const isStale = Date.now() - school.academic_snapshot_computed_at.getTime() > STALE_AFTER_MS
    return { ...snapshot, computed_at: school.academic_snapshot_computed_at, is_stale: isStale }
  }

  private async sumType(schoolId: string, type: string, from: Date, to: Date): Promise<number> {
    const agg = await this.prisma.transactions.aggregate({
      where: { school_id: schoolId, type, transaction_date: { gte: from, lt: to } },
      _sum: { amount: true },
    })
    return Number(agg._sum.amount ?? 0)
  }

  private async monthlyData(schoolId: string, year: number) {
    const rows = await this.prisma.$queryRaw<Array<{ month: number; type: string; total: number }>>`
      SELECT
        EXTRACT(MONTH FROM transaction_date)::int AS month,
        type,
        SUM(amount)::float8                       AS total
      FROM transactions
      WHERE school_id = ${schoolId}::uuid
        AND EXTRACT(YEAR FROM transaction_date) = ${year}
      GROUP BY month, type
    `
    return Array.from({ length: 12 }, (_, i) => ({
      month:    i + 1,
      income:   Number(rows.find(r => r.month === i + 1 && r.type === 'INCOME')?.total   ?? 0),
      expenses: Number(rows.find(r => r.month === i + 1 && r.type === 'EXPENSE')?.total  ?? 0),
    }))
  }
}
