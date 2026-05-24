import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

const PAGE_SIZE = 30

@Controller('admin/expenses')
export class ExpensesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
    const skip = (pageNum - 1) * PAGE_SIZE

    const where: any = {
      school_id: user.school_id,
      type: 'EXPENSE',
      student_id: null,
    }

    if (category) where.category = category

    if (dateFrom || dateTo) {
      where.transaction_date = {}
      if (dateFrom) where.transaction_date.gte = new Date(dateFrom)
      if (dateTo) where.transaction_date.lte = new Date(dateTo)
    }

    const [expenses, total] = await Promise.all([
      this.prisma.transactions.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        include: {
          users: { select: { full_name: true } },
        },
        orderBy: { transaction_date: 'desc' },
      }),
      this.prisma.transactions.count({ where }),
    ])

    return { expenses, total, page: pageNum, pages: Math.ceil(total / PAGE_SIZE) }
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    if (!body.category) throw new BadRequestException('category is required')
    if (body.amount === undefined) throw new BadRequestException('amount is required')

    return this.prisma.transactions.create({
      data: {
        school_id: user.school_id,
        student_id: null,
        type: 'EXPENSE',
        category: body.category,
        amount: body.amount,
        description: body.description ?? null,
        transaction_date: body.transaction_date ? new Date(body.transaction_date) : new Date(),
        created_by: user.sub,
      },
      include: {
        users: { select: { full_name: true } },
      },
    })
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const expense = await this.prisma.transactions.findFirst({
      where: { id, school_id: user.school_id, type: 'EXPENSE', student_id: null },
    })
    if (!expense) throw new NotFoundException('Expense not found')

    return this.prisma.transactions.update({
      where: { id },
      data: {
        category: body.category ?? expense.category,
        amount: body.amount ?? expense.amount,
        description: body.description !== undefined ? body.description : expense.description,
        transaction_date: body.transaction_date ? new Date(body.transaction_date) : expense.transaction_date,
      },
      include: {
        users: { select: { full_name: true } },
      },
    })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const expense = await this.prisma.transactions.findFirst({
      where: { id, school_id: user.school_id, type: 'EXPENSE', student_id: null },
    })
    if (!expense) throw new NotFoundException('Expense not found')

    await this.prisma.transactions.delete({ where: { id } })
    return { success: true }
  }
}
