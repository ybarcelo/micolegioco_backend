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
  ConflictException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/fee-definitions')
export class FeeDefinitionsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('academic_year_id') academicYearId?: string,
    @Query('grade_id') gradeId?: string,
  ) {
    const where: any = { school_id: user.school_id }
    if (academicYearId) where.academic_year_id = academicYearId
    if (gradeId) where.grade_id = gradeId

    return this.prisma.fee_definitions.findMany({
      where,
      include: {
        academic_years: true,
        grades: true,
      },
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades: { level: 'asc' } },
        { concept_name: 'asc' },
      ],
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    if (!body.academic_year_id) throw new BadRequestException('academic_year_id is required')
    if (!body.grade_id) throw new BadRequestException('grade_id is required')
    if (!body.concept_name) throw new BadRequestException('concept_name is required')
    if (body.base_amount === undefined) throw new BadRequestException('base_amount is required')

    try {
      return await this.prisma.fee_definitions.create({
        data: {
          school_id: user.school_id,
          academic_year_id: body.academic_year_id,
          grade_id: body.grade_id,
          concept_name: body.concept_name,
          base_amount: body.base_amount,
          is_recurring: body.is_recurring !== undefined ? body.is_recurring : true,
          due_day_of_month: body.due_day_of_month ?? 5,
        },
        include: {
          academic_years: true,
          grades: true,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A fee definition with these details already exists')
      }
      throw error
    }
  }

  @Post('copy')
  @Roles('RECTOR', 'SECRETARIO')
  async copyFromYear(
    @CurrentUser() user: JwtPayload,
    @Body() body: { from_year_id: string; to_year_id: string },
  ) {
    if (!body.from_year_id) throw new BadRequestException('from_year_id is required')
    if (!body.to_year_id)   throw new BadRequestException('to_year_id is required')
    if (body.from_year_id === body.to_year_id)
      throw new BadRequestException('from_year_id and to_year_id must be different')

    // Verificar que ambos años pertenecen al colegio
    const [fromYear, toYear] = await Promise.all([
      this.prisma.academic_years.findFirst({ where: { id: body.from_year_id, school_id: user.school_id } }),
      this.prisma.academic_years.findFirst({ where: { id: body.to_year_id,   school_id: user.school_id } }),
    ])
    if (!fromYear) throw new NotFoundException('Source academic year not found')
    if (!toYear)   throw new NotFoundException('Target academic year not found')

    // Obtener tarifas del año origen
    const sourceFees = await this.prisma.fee_definitions.findMany({
      where: { academic_year_id: body.from_year_id, school_id: user.school_id },
    })
    if (sourceFees.length === 0) {
      return { copied: 0, message: 'No hay tarifas en el año origen' }
    }

    // Eliminar tarifas existentes en el año destino y crear las nuevas en una transacción
    const result = await this.prisma.$transaction(async tx => {
      await tx.fee_definitions.deleteMany({
        where: { academic_year_id: body.to_year_id, school_id: user.school_id },
      })
      await tx.fee_definitions.createMany({
        data: sourceFees.map(f => ({
          school_id:        user.school_id,
          academic_year_id: body.to_year_id,
          grade_id:         f.grade_id,
          concept_name:     f.concept_name,
          base_amount:      f.base_amount,
          is_recurring:     f.is_recurring,
          due_day_of_month: f.due_day_of_month,
        })),
      })
      return sourceFees.length
    })

    return { copied: result, message: `Se copiaron ${result} tarifas al año ${toYear.label}` }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const fee = await this.prisma.fee_definitions.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!fee) throw new NotFoundException('Fee definition not found')

    try {
      return await this.prisma.fee_definitions.update({
        where: { id },
        data: {
          academic_year_id: body.academic_year_id ?? fee.academic_year_id,
          grade_id: body.grade_id ?? fee.grade_id,
          concept_name: body.concept_name ?? fee.concept_name,
          base_amount: body.base_amount ?? fee.base_amount,
          is_recurring: body.is_recurring !== undefined ? body.is_recurring : fee.is_recurring,
          due_day_of_month: body.due_day_of_month ?? fee.due_day_of_month,
        },
        include: {
          academic_years: true,
          grades: true,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A fee definition with these details already exists')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const fee = await this.prisma.fee_definitions.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!fee) throw new NotFoundException('Fee definition not found')

    await this.prisma.fee_definitions.delete({ where: { id } })
    return { success: true }
  }
}
