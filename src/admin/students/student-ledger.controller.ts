import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/students/:id/ledger')
export class StudentLedgerController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async getLedger(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const ledger = await this.prisma.student_ledger.findMany({
      where: { student_id: id, school_id: user.school_id },
      include: {
        fee_definitions: {
          select: {
            concept_name: true,
            grades: { select: { name: true } },
          },
        },
        service_fees: { select: { name: true } },
        payments: {
          orderBy: { payment_date: 'desc' },
          include: {
            transactions: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    })

    return ledger
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async createLedgerEntry(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    if (!body.fee_definition_id && !body.service_fee_id) {
      throw new BadRequestException('Either fee_definition_id or service_fee_id is required')
    }
    if (body.fee_definition_id && body.service_fee_id) {
      throw new BadRequestException('Only one of fee_definition_id or service_fee_id can be provided')
    }

    const originalAmount = parseFloat(body.original_amount)
    if (isNaN(originalAmount) || originalAmount <= 0) {
      throw new BadRequestException('original_amount must be a positive number')
    }

    const discountApplied = parseFloat(body.discount_applied ?? '0') || 0
    if (discountApplied > originalAmount) {
      throw new BadRequestException('discount_applied cannot exceed original_amount')
    }

    const netAmountDue = originalAmount - discountApplied

    const entry = await this.prisma.student_ledger.create({
      data: {
        school_id: user.school_id,
        student_id: id,
        fee_definition_id: body.fee_definition_id ?? null,
        service_fee_id: body.service_fee_id ?? null,
        original_amount: originalAmount,
        discount_applied: discountApplied,
        net_amount_due: netAmountDue,
        billing_period: body.billing_period ? new Date(body.billing_period) : null,
        due_date: body.due_date ? new Date(body.due_date) : null,
        balance_remaining: netAmountDue,
        status: 'PENDING',
      },
    })

    return entry
  }

  @Post(':lId/pay')
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async payLedgerEntry(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('lId') lId: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const ledgerEntry = await this.prisma.student_ledger.findFirst({
      where: { id: lId, student_id: id, school_id: user.school_id },
    })
    if (!ledgerEntry) throw new NotFoundException('Ledger entry not found')

    if (ledgerEntry.status === 'PAID' || ledgerEntry.status === 'CANCELLED') {
      throw new BadRequestException(`Ledger entry is already ${ledgerEntry.status}`)
    }

    const amountPaid = parseFloat(body.amount_paid)
    if (isNaN(amountPaid) || amountPaid <= 0) {
      throw new BadRequestException('amount_paid must be a positive number')
    }

    const balance = parseFloat(ledgerEntry.balance_remaining?.toString() ?? '0')
    if (amountPaid > balance) {
      throw new BadRequestException('amount_paid cannot exceed balance_remaining')
    }

    const newBalance = balance - amountPaid
    const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL'

    const result = await this.prisma.$transaction(async tx => {
      const transaction = await tx.transactions.create({
        data: {
          school_id: user.school_id,
          student_id: id,
          type: 'INCOME',
          category: 'PAGO_PENSION',
          amount: amountPaid,
          description: body.notes ?? null,
          transaction_date: body.payment_date ? new Date(body.payment_date) : new Date(),
          created_by: user.sub,
        },
      })

      const payment = await tx.payments.create({
        data: {
          school_id: user.school_id,
          ledger_id: lId,
          transaction_id: transaction.id,
          amount_paid: amountPaid,
          payment_method: body.payment_method ?? null,
          payment_date: body.payment_date ? new Date(body.payment_date) : new Date(),
          is_partial: newStatus === 'PARTIAL',
        },
      })

      const updatedLedger = await tx.student_ledger.update({
        where: { id: lId },
        data: {
          balance_remaining: newBalance,
          status: newStatus,
        },
        include: {
          payments: {
            orderBy: { payment_date: 'desc' },
            include: { transactions: true },
          },
        },
      })

      return { payment, ledger: updatedLedger }
    })

    return result
  }
}
