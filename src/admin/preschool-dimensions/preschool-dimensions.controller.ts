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

@Controller('admin/preschool-dimensions')
@Roles('RECTOR', 'SECRETARIO')
export class PreschoolDimensionsController {
  constructor(private prisma: PrismaService) {}

  // ── Dimensiones ──────────────────────────────────────────────────────────

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.preschool_dimensions.findMany({
      where: { school_id: user.school_id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: {
        preschool_indicators: { orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] },
        _count: { select: { preschool_indicators: true } },
      },
    })
  }

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; description?: string; sort_order?: number },
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name is required')
    try {
      return await this.prisma.preschool_dimensions.create({
        data: {
          school_id:   user.school_id,
          name:        body.name.trim(),
          description: body.description?.trim() || null,
          sort_order:  body.sort_order ?? 0,
        },
        include: { preschool_indicators: true, _count: { select: { preschool_indicators: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe una dimensión con ese nombre')
      throw error
    }
  }

  @Put(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; sort_order?: number },
  ) {
    const dimension = await this.prisma.preschool_dimensions.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!dimension) throw new NotFoundException('Dimensión no encontrada')
    try {
      return await this.prisma.preschool_dimensions.update({
        where: { id },
        data: {
          name:        body.name?.trim() ?? dimension.name,
          description: body.description !== undefined ? (body.description.trim() || null) : dimension.description,
          sort_order:  body.sort_order   !== undefined ? body.sort_order : dimension.sort_order,
          updated_at:  new Date(),
        },
        include: { preschool_indicators: true, _count: { select: { preschool_indicators: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe una dimensión con ese nombre')
      throw error
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const dimension = await this.prisma.preschool_dimensions.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!dimension) throw new NotFoundException('Dimensión no encontrada')

    const indicatorCount = await this.prisma.preschool_indicators.count({ where: { dimension_id: id } })
    if (indicatorCount > 0)
      throw new BadRequestException('No se puede eliminar una dimensión que tiene indicadores')

    const gradeCount = await this.prisma.preschool_dimension_grades.count({ where: { dimension_id: id } })
    if (gradeCount > 0)
      throw new BadRequestException('No se puede eliminar una dimensión con calificaciones registradas')

    await this.prisma.preschool_dimensions.delete({ where: { id } })
    return { success: true }
  }

  // ── Indicadores ──────────────────────────────────────────────────────────

  @Post(':dimensionId/indicators')
  async createIndicator(
    @CurrentUser() user: JwtPayload,
    @Param('dimensionId') dimensionId: string,
    @Body() body: { name: string; sort_order?: number },
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name is required')
    const dimension = await this.prisma.preschool_dimensions.findFirst({
      where: { id: dimensionId, school_id: user.school_id },
    })
    if (!dimension) throw new NotFoundException('Dimensión no encontrada')

    try {
      return await this.prisma.preschool_indicators.create({
        data: {
          school_id:    user.school_id,
          dimension_id: dimensionId,
          name:         body.name.trim(),
          sort_order:   body.sort_order ?? 0,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe un indicador con ese nombre en esta dimensión')
      throw error
    }
  }

  @Put('indicators/:id')
  async updateIndicator(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; sort_order?: number },
  ) {
    const indicator = await this.prisma.preschool_indicators.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!indicator) throw new NotFoundException('Indicador no encontrado')
    try {
      return await this.prisma.preschool_indicators.update({
        where: { id },
        data: {
          name:       body.name?.trim() ?? indicator.name,
          sort_order: body.sort_order   !== undefined ? body.sort_order : indicator.sort_order,
          updated_at: new Date(),
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe un indicador con ese nombre en esta dimensión')
      throw error
    }
  }

  @Delete('indicators/:id')
  async removeIndicator(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const indicator = await this.prisma.preschool_indicators.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!indicator) throw new NotFoundException('Indicador no encontrado')

    const gradeCount = await this.prisma.preschool_indicator_grades.count({ where: { indicator_id: id } })
    if (gradeCount > 0)
      throw new BadRequestException('No se puede eliminar un indicador con calificaciones registradas')

    await this.prisma.preschool_indicators.delete({ where: { id } })
    return { success: true }
  }
}
