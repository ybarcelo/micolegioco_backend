import { Controller, Get, Post, Patch, Param, Body, Query, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

interface InstallmentPlan { installment_number: number; year: number; month: number; amount: number }

@Controller('admin/teacher-loans')
export class TeacherLoansController {
  constructor(private prisma: PrismaService) {}

  /** Amortización simple: monto/cuotas redondeado; la última cuota absorbe el residuo. */
  private buildInstallments(amount: number, count: number, startYear: number, startMonth: number): InstallmentPlan[] {
    const base = Math.floor(amount / count)
    const plan: InstallmentPlan[] = []
    let accumulated = 0
    let year = startYear
    let month = startMonth
    for (let n = 1; n <= count; n++) {
      const isLast = n === count
      const installmentAmount = isLast ? amount - accumulated : base
      accumulated += installmentAmount
      plan.push({ installment_number: n, year, month, amount: installmentAmount })
      month++
      if (month > 12) { month = 1; year++ }
    }
    return plan
  }

  private async assertEnabled(schoolId: string) {
    const school = await this.prisma.schools.findUnique({ where: { id: schoolId }, select: { teacher_loans_enabled: true } })
    if (!school?.teacher_loans_enabled) throw new BadRequestException('Este colegio no tiene habilitados los préstamos a docentes')
  }

  private serialize(l: {
    id: string; amount: unknown; installments_count: number; start_year: number | null; start_month: number | null
    status: string; notes: string | null; rejection_reason: string | null; created_at: Date | null
    installments: { installment_number: number; year: number; month: number; amount: unknown }[]
  }) {
    return {
      id: l.id, amount: Number(l.amount), installments_count: l.installments_count,
      start_year: l.start_year, start_month: l.start_month, status: l.status,
      notes: l.notes, rejection_reason: l.rejection_reason, created_at: l.created_at,
      installments: l.installments.map(i => ({ installment_number: i.installment_number, year: i.year, month: i.month, amount: Number(i.amount) })),
    }
  }

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findByTeacher(@CurrentUser() user: JwtPayload, @Query('teacher_id') teacherId: string) {
    if (!teacherId) throw new BadRequestException('teacher_id is required')

    const loans = await this.prisma.teacher_loans.findMany({
      where: { school_id: user.school_id, teacher_id: teacherId },
      include: { installments: { orderBy: { installment_number: 'asc' } } },
      orderBy: { created_at: 'desc' },
    })
    return loans.map(l => this.serialize(l))
  }

  /** Solicitudes pendientes de todo el colegio, para la bandeja de aprobación del rector. */
  @Get('pending')
  @Roles('RECTOR', 'SECRETARIO')
  async findPending(@CurrentUser() user: JwtPayload) {
    const loans = await this.prisma.teacher_loans.findMany({
      where: { school_id: user.school_id, status: 'PENDING' },
      include: {
        installments: true,
        teachers: { select: { id: true, first_name: true, second_name: true, last_name: true, second_last_name: true } },
      },
      orderBy: { created_at: 'asc' },
    })
    return loans.map(l => ({ ...this.serialize(l), teacher: l.teachers }))
  }

  /** Préstamos/solicitudes del docente autenticado. */
  @Get('my')
  @Roles('DOCENTE')
  async findMine(@CurrentUser() user: JwtPayload) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')
    const loans = await this.prisma.teacher_loans.findMany({
      where: { school_id: user.school_id, teacher_id: user.teacher_id },
      include: { installments: { orderBy: { installment_number: 'asc' } } },
      orderBy: { created_at: 'desc' },
    })
    return loans.map(l => this.serialize(l))
  }

  @Post()
  @Roles('RECTOR')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { teacher_id: string; amount: number; installments_count: number; start_year: number; start_month: number; notes?: string },
  ) {
    await this.assertEnabled(user.school_id!)
    if (!body.teacher_id) throw new BadRequestException('teacher_id es obligatorio')
    if (!body.amount || body.amount <= 0) throw new BadRequestException('El monto debe ser mayor a 0')
    if (!body.installments_count || body.installments_count < 1) throw new BadRequestException('El número de cuotas debe ser al menos 1')
    if (!body.start_year || !body.start_month || body.start_month < 1 || body.start_month > 12) {
      throw new BadRequestException('Año y mes de inicio son obligatorios (mes 1-12)')
    }

    const teacher = await this.prisma.teachers.findFirst({ where: { id: body.teacher_id, school_id: user.school_id } })
    if (!teacher) throw new NotFoundException('Docente no encontrado')

    const installmentsData = this.buildInstallments(body.amount, body.installments_count, body.start_year, body.start_month)

    const loan = await this.prisma.teacher_loans.create({
      data: {
        school_id:          user.school_id!,
        teacher_id:         body.teacher_id,
        authorized_by:      user.sub,
        amount:             body.amount,
        installments_count: body.installments_count,
        start_year:         body.start_year,
        start_month:        body.start_month,
        status:             'ACTIVE',
        notes:              body.notes?.trim() || null,
        installments: { create: installmentsData },
      },
      include: { installments: { orderBy: { installment_number: 'asc' } } },
    })

    return this.serialize(loan)
  }

  /** El docente solicita un préstamo: queda PENDING, sin cuotas hasta que el rector lo apruebe. */
  @Post('request')
  @Roles('DOCENTE')
  async request(
    @CurrentUser() user: JwtPayload,
    @Body() body: { amount: number; installments_count: number; reason?: string },
  ) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')
    await this.assertEnabled(user.school_id!)
    if (!body.amount || body.amount <= 0) throw new BadRequestException('El monto debe ser mayor a 0')
    if (!body.installments_count || body.installments_count < 1) throw new BadRequestException('El número de cuotas debe ser al menos 1')

    const loan = await this.prisma.teacher_loans.create({
      data: {
        school_id:          user.school_id!,
        teacher_id:         user.teacher_id,
        requested_by:       user.sub,
        amount:             body.amount,
        installments_count: body.installments_count,
        status:             'PENDING',
        notes:              body.reason?.trim() || null,
      },
      include: { installments: true },
    })
    return this.serialize(loan)
  }

  /** El rector aprueba una solicitud pendiente: fija el inicio y genera las cuotas. */
  @Post(':id/approve')
  @Roles('RECTOR')
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { start_year: number; start_month: number },
  ) {
    if (!body.start_year || !body.start_month || body.start_month < 1 || body.start_month > 12) {
      throw new BadRequestException('Año y mes de inicio son obligatorios (mes 1-12)')
    }
    const loan = await this.prisma.teacher_loans.findFirst({ where: { id, school_id: user.school_id, status: 'PENDING' } })
    if (!loan) throw new NotFoundException('Solicitud no encontrada o ya resuelta')

    const installmentsData = this.buildInstallments(Number(loan.amount), loan.installments_count, body.start_year, body.start_month)

    const updated = await this.prisma.teacher_loans.update({
      where: { id },
      data: {
        status: 'ACTIVE', authorized_by: user.sub,
        start_year: body.start_year, start_month: body.start_month,
        installments: { create: installmentsData },
      },
      include: { installments: { orderBy: { installment_number: 'asc' } } },
    })
    return this.serialize(updated)
  }

  /** El rector rechaza una solicitud pendiente. */
  @Post(':id/reject')
  @Roles('RECTOR')
  async reject(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { reason?: string }) {
    const loan = await this.prisma.teacher_loans.findFirst({ where: { id, school_id: user.school_id, status: 'PENDING' } })
    if (!loan) throw new NotFoundException('Solicitud no encontrada o ya resuelta')

    const updated = await this.prisma.teacher_loans.update({
      where: { id },
      data: { status: 'REJECTED', authorized_by: user.sub, rejection_reason: body.reason?.trim() || null },
      include: { installments: true },
    })
    return this.serialize(updated)
  }

  @Patch(':id/cancel')
  @Roles('RECTOR')
  async cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const loan = await this.prisma.teacher_loans.findFirst({ where: { id, school_id: user.school_id } })
    if (!loan) throw new NotFoundException('Préstamo no encontrado')
    if (loan.status !== 'ACTIVE') throw new BadRequestException('Solo se puede cancelar un préstamo activo')
    const updated = await this.prisma.teacher_loans.update({ where: { id }, data: { status: 'CANCELLED' } })
    return { id: updated.id, status: updated.status }
  }
}
