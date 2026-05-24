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

@Controller('admin/grades')
export class GradesController {
  constructor(private prisma: PrismaService) {}

  private readonly VALID_JORNADAS        = ['MANANA', 'TARDE', 'UNICA']
  private readonly VALID_NIVELES         = ['PREESCOLAR', 'BASICA_PRIMARIA', 'BASICA_SECUNDARIA', 'MEDIA']

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.grades.findMany({
      where: { school_id: user.school_id },
      orderBy: { level: 'asc' },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; level: number; jornada?: string; nivel_educativo?: string },
  ) {
    if (!body.name) throw new BadRequestException('name is required')
    if (body.level === undefined || body.level === null) throw new BadRequestException('level is required')

    const jornada = body.jornada ?? 'UNICA'
    if (!this.VALID_JORNADAS.includes(jornada))
      throw new BadRequestException(`jornada must be one of: ${this.VALID_JORNADAS.join(', ')}`)

    const nivel_educativo = body.nivel_educativo ?? 'BASICA_PRIMARIA'
    if (!this.VALID_NIVELES.includes(nivel_educativo))
      throw new BadRequestException(`nivel_educativo must be one of: ${this.VALID_NIVELES.join(', ')}`)

    try {
      return await this.prisma.grades.create({
        data: {
          school_id: user.school_id,
          name: body.name,
          level: body.level,
          jornada,
          nivel_educativo,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A grade with these details already exists')
      }
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; level?: number; jornada?: string; nivel_educativo?: string },
  ) {
    const grade = await this.prisma.grades.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!grade) throw new NotFoundException('Grade not found')

    if (body.jornada !== undefined && !this.VALID_JORNADAS.includes(body.jornada))
      throw new BadRequestException(`jornada must be one of: ${this.VALID_JORNADAS.join(', ')}`)

    if (body.nivel_educativo !== undefined && !this.VALID_NIVELES.includes(body.nivel_educativo))
      throw new BadRequestException(`nivel_educativo must be one of: ${this.VALID_NIVELES.join(', ')}`)

    try {
      return await this.prisma.grades.update({
        where: { id },
        data: {
          name:            body.name            ?? grade.name,
          level:           body.level           ?? grade.level,
          jornada:         body.jornada         ?? grade.jornada,
          nivel_educativo: body.nivel_educativo ?? grade.nivel_educativo,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A grade with these details already exists')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const grade = await this.prisma.grades.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!grade) throw new NotFoundException('Grade not found')

    await this.prisma.grades.delete({ where: { id } })
    return { success: true }
  }
}
