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

@Controller('admin/benefit-types')
export class BenefitTypesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.benefit_types.findMany({
      where: { school_id: user.school_id },
      orderBy: { name: 'asc' },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; origin?: string; description?: string },
  ) {
    if (!body.name) throw new BadRequestException('name is required')

    try {
      return await this.prisma.benefit_types.create({
        data: {
          school_id: user.school_id,
          name: body.name,
          origin: body.origin ?? null,
          description: body.description ?? null,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A benefit type with this name already exists')
      }
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; origin?: string; description?: string },
  ) {
    const bt = await this.prisma.benefit_types.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!bt) throw new NotFoundException('Benefit type not found')

    try {
      return await this.prisma.benefit_types.update({
        where: { id },
        data: {
          name: body.name ?? bt.name,
          origin: body.origin !== undefined ? body.origin : bt.origin,
          description: body.description !== undefined ? body.description : bt.description,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A benefit type with this name already exists')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const bt = await this.prisma.benefit_types.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!bt) throw new NotFoundException('Benefit type not found')

    await this.prisma.benefit_types.delete({ where: { id } })
    return { success: true }
  }
}
