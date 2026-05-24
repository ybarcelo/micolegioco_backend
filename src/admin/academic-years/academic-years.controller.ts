import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/academic-years')
export class AcademicYearsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.academic_years.findMany({
      where: { school_id: user.school_id },
      orderBy: { label: 'desc' },
      include: {
        academic_periods: {
          orderBy: { sort_order: 'asc' },
        },
      },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { label: string; is_active?: boolean; start_date?: string; end_date?: string; copy_from_year_id?: string },
  ) {
    if (!body.label) throw new BadRequestException('label is required')

    try {
      const newYear = await this.prisma.$transaction(async tx => {
        if (body.is_active) {
          await tx.academic_years.updateMany({
            where: { school_id: user.school_id },
            data: { is_active: false },
          })
        }

        const year = await tx.academic_years.create({
          data: {
            school_id:  user.school_id,
            label:      body.label,
            is_active:  body.is_active ?? false,
            start_date: body.start_date ? new Date(body.start_date) : null,
            end_date:   body.end_date   ? new Date(body.end_date)   : null,
          },
          include: { academic_periods: { orderBy: { sort_order: 'asc' } } },
        })

        if (body.copy_from_year_id) {
          const sourceYear = await tx.academic_years.findFirst({
            where: { id: body.copy_from_year_id, school_id: user.school_id },
          })
          if (!sourceYear) throw new NotFoundException('Source academic year not found')

          const sourceSections = await tx.sections.findMany({
            where: { academic_year_id: body.copy_from_year_id },
          })

          if (sourceSections.length > 0) {
            await tx.sections.createMany({
              data: sourceSections.map(s => ({
                grade_id:         s.grade_id,
                academic_year_id: year.id,
                name:             s.name,
                capacity:         s.capacity,
                teacher_id:       null,
              })),
            })
          }
        }

        return year
      })

      return newYear
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('An academic year with this label already exists')
      }
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { label?: string; is_active?: boolean; start_date?: string; end_date?: string },
  ) {
    const year = await this.prisma.academic_years.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!year) throw new NotFoundException('Academic year not found')

    const data: Record<string, unknown> = {
      label:      body.label      ?? year.label,
      is_active:  body.is_active  !== undefined ? body.is_active : year.is_active,
      start_date: body.start_date !== undefined ? (body.start_date ? new Date(body.start_date) : null) : year.start_date,
      end_date:   body.end_date   !== undefined ? (body.end_date   ? new Date(body.end_date)   : null) : year.end_date,
    }

    try {
      if (body.is_active) {
        return await this.prisma.$transaction(async tx => {
          await tx.academic_years.updateMany({
            where: { school_id: user.school_id, id: { not: id } },
            data: { is_active: false },
          })
          return tx.academic_years.update({
            where: { id },
            data: { ...data, is_active: true },
            include: { academic_periods: { orderBy: { sort_order: 'asc' } } },
          })
        })
      }

      return await this.prisma.academic_years.update({
        where: { id },
        data,
        include: { academic_periods: { orderBy: { sort_order: 'asc' } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('An academic year with this label already exists')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const year = await this.prisma.academic_years.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!year) throw new NotFoundException('Academic year not found')

    await this.prisma.academic_years.delete({ where: { id } })
    return { success: true }
  }

  /** Reemplaza todos los períodos de un año (sync completo) */
  @Put(':id/periods')
  @Roles('RECTOR')
  async syncPeriods(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { periods: Array<{ name: string; period_number: number; start_date: string; end_date: string; sort_order?: number; weight_percentage?: number | null }> },
  ) {
    const year = await this.prisma.academic_years.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!year) throw new NotFoundException('Academic year not found')

    if (!Array.isArray(body.periods)) throw new BadRequestException('periods array is required')

    for (const p of body.periods) {
      if (!p.name?.trim())    throw new BadRequestException('Cada período debe tener un nombre')
      if (!p.start_date)      throw new BadRequestException('Cada período debe tener una fecha de inicio')
      if (!p.end_date)        throw new BadRequestException('Cada período debe tener una fecha de fin')
      if (!p.period_number)   throw new BadRequestException('Cada período debe tener un número')
      const start = new Date(p.start_date)
      const end   = new Date(p.end_date)
      if (end < start)        throw new BadRequestException(`El período "${p.name}" tiene fecha de fin anterior a la de inicio`)
    }

    return this.prisma.$transaction(async tx => {
      await tx.academic_periods.deleteMany({ where: { academic_year_id: id } })

      if (body.periods.length > 0) {
        await tx.academic_periods.createMany({
          data: body.periods.map((p, i) => ({
            school_id:         user.school_id,
            academic_year_id:  id,
            name:              p.name.trim(),
            period_number:     p.period_number,
            start_date:        new Date(p.start_date),
            end_date:          new Date(p.end_date),
            sort_order:        p.sort_order ?? i,
            weight_percentage: p.weight_percentage ?? null,
          })),
        })
      }

      return tx.academic_periods.findMany({
        where: { academic_year_id: id },
        orderBy: { sort_order: 'asc' },
      })
    })
  }
}
