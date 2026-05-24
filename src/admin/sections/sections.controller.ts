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

@Controller('admin/sections')
export class SectionsController {
  constructor(private prisma: PrismaService) {}

  private sectionInclude = {
    grades: true,
    academic_years: true,
    director: {
      select: { id: true, first_name: true, last_name: true, document_number: true },
    },
  } as const

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.sections.findMany({
      where: { grades: { school_id: user.school_id } },
      include: this.sectionInclude,
      orderBy: [
        { academic_years: { label: 'desc' } },
        { grades: { level: 'asc' } },
        { name: 'asc' },
      ],
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      grade_id: string
      academic_year_id: string
      name: string
      capacity?: number
      director_id?: string
    },
  ) {
    if (!body.grade_id)          throw new BadRequestException('grade_id is required')
    if (!body.academic_year_id)  throw new BadRequestException('academic_year_id is required')
    if (!body.name)              throw new BadRequestException('name is required')

    const grade = await this.prisma.grades.findFirst({
      where: { id: body.grade_id, school_id: user.school_id },
    })
    if (!grade) throw new NotFoundException('Grade not found')

    const academicYear = await this.prisma.academic_years.findFirst({
      where: { id: body.academic_year_id, school_id: user.school_id },
    })
    if (!academicYear) throw new NotFoundException('Academic year not found')

    if (body.director_id) {
      const t = await this.prisma.teachers.findFirst({ where: { id: body.director_id, school_id: user.school_id } })
      if (!t) throw new BadRequestException('Docente no encontrado')
    }

    try {
      return await this.prisma.sections.create({
        data: {
          grade_id:         body.grade_id,
          academic_year_id: body.academic_year_id,
          name:             body.name.toUpperCase(),
          capacity:         body.capacity ?? 30,
          director_id:      body.director_id ?? null,
        },
        include: this.sectionInclude,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('A section with these details already exists')
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      grade_id?: string
      academic_year_id?: string
      name?: string
      capacity?: number
      director_id?: string | null
    },
  ) {
    const section = await this.prisma.sections.findFirst({
      where: { id, grades: { school_id: user.school_id } },
    })
    if (!section) throw new NotFoundException('Section not found')

    if (body.director_id) {
      const t = await this.prisma.teachers.findFirst({ where: { id: body.director_id, school_id: user.school_id } })
      if (!t) throw new BadRequestException('Docente no encontrado')
    }

    try {
      return await this.prisma.sections.update({
        where: { id },
        data: {
          grade_id:         body.grade_id         ?? section.grade_id,
          academic_year_id: body.academic_year_id ?? section.academic_year_id,
          name:             body.name ? body.name.toUpperCase() : section.name,
          capacity:         body.capacity         ?? section.capacity,
          director_id:      body.director_id !== undefined ? (body.director_id ?? null) : section.director_id,
        },
        include: this.sectionInclude,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('A section with these details already exists')
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const section = await this.prisma.sections.findFirst({
      where: { id, grades: { school_id: user.school_id } },
    })
    if (!section) throw new NotFoundException('Section not found')

    await this.prisma.sections.delete({ where: { id } })
    return { success: true }
  }
}
