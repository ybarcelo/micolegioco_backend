import { Controller, Get } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

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
    ] = await Promise.all([
      this.sumType(user.school_id, 'INCOME',  todayStart, todayEnd),
      this.sumType(user.school_id, 'INCOME',  monthStart, monthEnd),
      this.sumType(user.school_id, 'INCOME',  yearStart,  yearEnd),
      this.sumType(user.school_id, 'EXPENSE', todayStart, todayEnd),
      this.sumType(user.school_id, 'EXPENSE', monthStart, monthEnd),
      this.sumType(user.school_id, 'EXPENSE', yearStart,  yearEnd),
      this.monthlyData(user.school_id, y),
    ])

    return {
      income:   { day: incomeDay,   month: incomeMonth,   year: incomeYear   },
      expenses: { day: expensesDay, month: expensesMonth, year: expensesYear },
      monthly,
      year: y,
    }
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
