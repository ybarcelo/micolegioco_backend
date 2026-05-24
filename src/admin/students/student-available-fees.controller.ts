import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/students/:id/available-fees')
export class StudentAvailableFeesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async getAvailableFees(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    // Find the most recent enrollment for this student
    const latestEnrollment = await this.prisma.enrollments.findFirst({
      where: { student_id: id },
      include: {
        sections: {
          include: {
            grades: true,
            academic_years: true,
          },
        },
      },
      orderBy: { enrollment_date: 'desc' },
    })

    if (!latestEnrollment || !latestEnrollment.sections) {
      return { fees: [], hint: 'No active enrollment found for this student' }
    }

    const grade = latestEnrollment.sections.grades
    const academicYear = latestEnrollment.sections.academic_years

    if (!grade || !academicYear) {
      return { fees: [], hint: 'Enrollment is missing grade or academic year data' }
    }

    // Get fee definitions for this grade and year
    const feeDefinitions = await this.prisma.fee_definitions.findMany({
      where: {
        school_id: user.school_id,
        grade_id: grade.id,
        academic_year_id: academicYear.id,
      },
      include: { grades: true, academic_years: true },
    })

    // Get active student benefits for this academic year
    const benefits = await this.prisma.student_benefits.findMany({
      where: {
        student_id: id,
        academic_year_id: academicYear.id,
        is_active: true,
      },
      include: { benefit_types: true },
    })

    const totalPct   = benefits.reduce((s, b) => s + Number(b.discount_percentage   ?? 0), 0)
    const totalFixed = benefits.reduce((s, b) => s + Number(b.fixed_discount_amount ?? 0), 0)
    const cappedPct  = Math.min(totalPct, 100)

    const feeItems = feeDefinitions.map(fee => {
      const base     = Number(fee.base_amount)
      const isRec    = fee.is_recurring ?? true
      const pctAmt   = isRec ? base * (cappedPct / 100) : 0
      const discount = Math.min(base, pctAmt + totalFixed)
      const net      = Math.max(0, base - discount)
      return {
        id:               fee.id,
        source:           'fee' as const,
        concept_name:     fee.concept_name,
        base_amount:      base,
        discount_applied: Math.round(discount * 100) / 100,
        net_amount:       Math.round(net * 100) / 100,
        is_recurring:     isRec,
        due_day_of_month: fee.due_day_of_month,
        grade_name:       fee.grades.name,
        year_label:       fee.academic_years.label,
      }
    }).filter(f => f.net_amount > 0)

    const gradeLevel = grade.level
    const serviceFees = await this.prisma.service_fees.findMany({
      where: {
        school_id: user.school_id,
        is_active: true,
        OR: [
          { applies_to_grade_level: null },
          { applies_to_grade_level: gradeLevel },
        ],
      },
      orderBy: { name: 'asc' },
    })

    const serviceItems = serviceFees.map(sf => ({
      id:               sf.id,
      source:           'service' as const,
      concept_name:     sf.name,
      base_amount:      Number(sf.amount),
      discount_applied: 0,
      net_amount:       Number(sf.amount),
      is_recurring:     false,
      due_day_of_month: null,
      grade_name:       sf.applies_to_grade_level !== null
        ? `Grado nivel ${sf.applies_to_grade_level}`
        : 'Todos los grados',
      year_label:       '',
    }))

    const hint = !latestEnrollment ? 'Sin matrícula activa' : null

    return { fees: [...feeItems, ...serviceItems], hint }
  }
}
