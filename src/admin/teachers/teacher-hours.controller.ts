import {
  Controller, Get, Post, Delete,
  Param, Body, Query, NotFoundException, BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/teacher-hours')
export class TeacherHoursController {
  constructor(private prisma: PrismaService) {}

  /**
   * GET /admin/teacher-hours?year=2025&month=4&q=garcia
   * Returns all teachers with their active contract for the given month
   * and the hour deductions registered for that month.
   */
  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async getTeachersForMonth(
    @CurrentUser() user: JwtPayload,
    @Query('year')  yearStr:  string,
    @Query('month') monthStr: string,
    @Query('q')     q?: string,
  ) {
    const year  = parseInt(yearStr)  || new Date().getFullYear()
    const month = parseInt(monthStr) || (new Date().getMonth() + 1)

    // Month boundaries for active-contract filter (ISO date strings)
    const monthStart = new Date(year, month - 1, 1).toISOString().slice(0, 10)
    const monthEnd   = new Date(year, month,     0).toISOString().slice(0, 10)

    const teachers = await this.prisma.teachers.findMany({
      where: {
        school_id: user.school_id,
        ...(q ? {
          OR: [
            { first_name:      { contains: q, mode: 'insensitive' } },
            { last_name:       { contains: q, mode: 'insensitive' } },
            { document_number: { contains: q } },
          ],
        } : {}),
      },
      include: {
        escalafon_types: true,
        teacher_contracts: {
          where: {
            start_date: { lte: new Date(monthEnd) },
            end_date:   { gte: new Date(monthStart) },
          },
          orderBy: { start_date: 'desc' },
          take: 1,
          include: { escalafon_types: true },
        },
        teacher_hour_deductions: {
          where: { year, month },
          orderBy: { deduction_date: 'asc' },
        },
      },
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    })

    return teachers.map(t => {
      const contract      = t.teacher_contracts[0] ?? null
      const weeklyHours   = contract?.weekly_hours ?? 0
      const monthlyHours  = weeklyHours * 4
      const deductedHours = t.teacher_hour_deductions.reduce(
        (sum, d) => sum + Number(d.hours), 0,
      )
      const payableHours = Math.max(0, monthlyHours - deductedHours)

      return {
        id:              t.id,
        first_name:      t.first_name,
        last_name:       t.last_name,
        document_type:   t.document_type,
        document_number: t.document_number,
        escalafon_types: t.escalafon_types,
        contract: contract ? {
          id:             contract.id,
          weekly_hours:   contract.weekly_hours,
          monthly_hours:  monthlyHours,
          escalafon_types: contract.escalafon_types,
        } : null,
        deductions:      t.teacher_hour_deductions.map(d => ({
          id:             d.id,
          deduction_date: d.deduction_date,
          hours:          Number(d.hours),
          reason:         d.reason,
        })),
        deducted_hours:  deductedHours,
        payable_hours:   payableHours,
      }
    })
  }

  /**
   * POST /admin/teacher-hours/deductions
   * Registers a new hour deduction for a teacher in a specific month.
   */
  @Post('deductions')
  @Roles('RECTOR', 'SECRETARIO')
  async addDeduction(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      teacher_id:     string
      year:           number
      month:          number
      deduction_date: string
      hours:          number
      reason?:        string
    },
  ) {
    if (!body.teacher_id)    throw new BadRequestException('teacher_id is required')
    if (!body.deduction_date) throw new BadRequestException('deduction_date is required')
    if (!body.hours || body.hours <= 0)
      throw new BadRequestException('hours must be a positive number')
    if (!body.year || !body.month || body.month < 1 || body.month > 12)
      throw new BadRequestException('valid year and month (1-12) are required')

    const teacher = await this.prisma.teachers.findFirst({
      where: { id: body.teacher_id, school_id: user.school_id },
    })
    if (!teacher) throw new NotFoundException('Docente no encontrado')

    const d = await this.prisma.teacher_hour_deductions.create({
      data: {
        school_id:      user.school_id,
        teacher_id:     body.teacher_id,
        year:           body.year,
        month:          body.month,
        deduction_date: new Date(body.deduction_date),
        hours:          body.hours,
        reason:         body.reason ?? null,
      },
    })

    return {
      id:             d.id,
      deduction_date: d.deduction_date,
      hours:          Number(d.hours),
      reason:         d.reason,
    }
  }

  /**
   * DELETE /admin/teacher-hours/deductions/:id
   */
  @Delete('deductions/:id')
  @Roles('RECTOR', 'SECRETARIO')
  async removeDeduction(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const d = await this.prisma.teacher_hour_deductions.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!d) throw new NotFoundException('Deducción no encontrada')
    await this.prisma.teacher_hour_deductions.delete({ where: { id } })
    return { success: true }
  }
}
