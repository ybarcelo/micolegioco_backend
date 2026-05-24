import {
  Controller, Get, Post, Put, Delete,
  Param, Body, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/escalafon-types')
export class EscalafonTypesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.escalafon_types.findMany({
      where: { school_id: user.school_id },
      orderBy: { name: 'asc' },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; hourly_rate: number; description?: string },
  ) {
    if (!body.name) throw new BadRequestException('name is required')
    if (body.hourly_rate !== undefined && body.hourly_rate !== null && body.hourly_rate <= 0)
      throw new BadRequestException('hourly_rate must be a positive number')

    try {
      return await this.prisma.escalafon_types.create({
        data: {
          school_id:   user.school_id,
          name:        body.name.trim(),
          hourly_rate: body.hourly_rate ?? null,
          description: body.description ?? null,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('uq_escalafon') || msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('Ya existe un escalafón con ese nombre')
      throw e
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; hourly_rate?: number; description?: string },
  ) {
    const et = await this.prisma.escalafon_types.findFirst({ where: { id, school_id: user.school_id } })
    if (!et) throw new NotFoundException('Escalafón no encontrado')
    if (body.hourly_rate !== undefined && body.hourly_rate <= 0)
      throw new BadRequestException('hourly_rate must be a positive number')

    try {
      return await this.prisma.escalafon_types.update({
        where: { id },
        data: {
          name:        body.name        !== undefined ? body.name.trim()    : et.name,
          hourly_rate: body.hourly_rate !== undefined ? body.hourly_rate    : et.hourly_rate,
          description: body.description !== undefined ? body.description    : et.description,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('uq_escalafon') || msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('Ya existe un escalafón con ese nombre')
      throw e
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const et = await this.prisma.escalafon_types.findFirst({ where: { id, school_id: user.school_id } })
    if (!et) throw new NotFoundException('Escalafón no encontrado')
    await this.prisma.escalafon_types.delete({ where: { id } })
    return { success: true }
  }
}
