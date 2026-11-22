import { Controller, Get, Post, Put, Delete, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/pre-informe-reasons')
export class PreInformeReasonsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.pre_informe_reasons.findMany({
      where: { school_id: user.school_id },
      orderBy: { label: 'asc' },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: { label: string }) {
    if (!body.label?.trim()) throw new BadRequestException('El motivo es obligatorio')
    return this.prisma.pre_informe_reasons.create({
      data: { school_id: user.school_id!, label: body.label.trim() },
    })
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { label: string }) {
    if (!body.label?.trim()) throw new BadRequestException('El motivo es obligatorio')
    const reason = await this.prisma.pre_informe_reasons.findFirst({ where: { id, school_id: user.school_id } })
    if (!reason) throw new NotFoundException('Motivo no encontrado')
    return this.prisma.pre_informe_reasons.update({ where: { id }, data: { label: body.label.trim() } })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const reason = await this.prisma.pre_informe_reasons.findFirst({ where: { id, school_id: user.school_id } })
    if (!reason) throw new NotFoundException('Motivo no encontrado')
    await this.prisma.pre_informe_reasons.delete({ where: { id } })
    return { success: true }
  }
}
