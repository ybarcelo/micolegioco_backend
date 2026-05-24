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

@Controller('admin/curriculum')
export class CurriculumController {
  constructor(private prisma: PrismaService) {}

  // ── Áreas ────────────────────────────────────────────────────────────────

  @Get('areas')
  @Roles('RECTOR', 'SECRETARIO')
  async findAreas(@CurrentUser() user: JwtPayload) {
    return this.prisma.subject_areas.findMany({
      where: { school_id: user.school_id },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { subjects: true } } },
    })
  }

  @Post('areas')
  @Roles('RECTOR', 'SECRETARIO')
  async createArea(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; sort_order?: number },
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name is required')
    try {
      return await this.prisma.subject_areas.create({
        data: {
          school_id:  user.school_id,
          name:       body.name.trim(),
          sort_order: body.sort_order ?? 0,
          is_active:  true,
        },
        include: { _count: { select: { subjects: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('unique') || msg.includes('Unique'))
        throw new ConflictException('Ya existe un área con ese nombre')
      throw error
    }
  }

  @Put('areas/:id')
  @Roles('RECTOR', 'SECRETARIO')
  async updateArea(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; sort_order?: number; is_active?: boolean },
  ) {
    const area = await this.prisma.subject_areas.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!area) throw new NotFoundException('Área no encontrada')
    try {
      return await this.prisma.subject_areas.update({
        where: { id },
        data: {
          name:       body.name?.trim() ?? area.name,
          sort_order: body.sort_order   !== undefined ? body.sort_order : area.sort_order,
          is_active:  body.is_active    !== undefined ? body.is_active  : area.is_active,
        },
        include: { _count: { select: { subjects: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('unique') || msg.includes('Unique'))
        throw new ConflictException('Ya existe un área con ese nombre')
      throw error
    }
  }

  @Delete('areas/:id')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteArea(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const area = await this.prisma.subject_areas.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!area) throw new NotFoundException('Área no encontrada')

    const count = await this.prisma.subjects.count({ where: { area_id: id } })
    if (count > 0)
      throw new BadRequestException('No se puede eliminar un área que tiene asignaturas')

    await this.prisma.subject_areas.delete({ where: { id } })
    return { success: true }
  }

  // ── Asignaturas ──────────────────────────────────────────────────────────

  @Get('subjects')
  @Roles('RECTOR', 'SECRETARIO')
  async findSubjects(
    @CurrentUser() user: JwtPayload,
    @Query('area_id') areaId?: string,
  ) {
    return this.prisma.subjects.findMany({
      where: {
        school_id: user.school_id,
        ...(areaId ? { area_id: areaId } : {}),
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { subject_areas: { select: { id: true, name: true } } },
    })
  }

  @Post('subjects')
  @Roles('RECTOR', 'SECRETARIO')
  async createSubject(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; area_id: string; sort_order?: number },
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name is required')
    if (!body.area_id)      throw new BadRequestException('area_id is required')

    const area = await this.prisma.subject_areas.findFirst({
      where: { id: body.area_id, school_id: user.school_id },
    })
    if (!area) throw new NotFoundException('Área no encontrada')

    try {
      return await this.prisma.subjects.create({
        data: {
          school_id:  user.school_id,
          area_id:    body.area_id,
          name:       body.name.trim(),
          sort_order: body.sort_order ?? 0,
          is_active:  true,
        },
        include: { subject_areas: { select: { id: true, name: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('unique') || msg.includes('Unique'))
        throw new ConflictException('Ya existe una asignatura con ese nombre en esta área')
      throw error
    }
  }

  @Put('subjects/:id')
  @Roles('RECTOR', 'SECRETARIO')
  async updateSubject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; sort_order?: number; is_active?: boolean; area_id?: string },
  ) {
    const subject = await this.prisma.subjects.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!subject) throw new NotFoundException('Asignatura no encontrada')

    if (body.area_id && body.area_id !== subject.area_id) {
      const area = await this.prisma.subject_areas.findFirst({
        where: { id: body.area_id, school_id: user.school_id },
      })
      if (!area) throw new NotFoundException('Área no encontrada')
    }

    try {
      return await this.prisma.subjects.update({
        where: { id },
        data: {
          name:       body.name?.trim() ?? subject.name,
          area_id:    body.area_id      ?? subject.area_id,
          sort_order: body.sort_order   !== undefined ? body.sort_order : subject.sort_order,
          is_active:  body.is_active    !== undefined ? body.is_active  : subject.is_active,
        },
        include: { subject_areas: { select: { id: true, name: true } } },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('unique') || msg.includes('Unique'))
        throw new ConflictException('Ya existe una asignatura con ese nombre en esta área')
      throw error
    }
  }

  @Delete('subjects/:id')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteSubject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const subject = await this.prisma.subjects.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!subject) throw new NotFoundException('Asignatura no encontrada')

    const count = await this.prisma.grade_subjects.count({ where: { subject_id: id } })
    if (count > 0)
      throw new BadRequestException('No se puede eliminar una asignatura que está asignada a uno o más grados')

    await this.prisma.subjects.delete({ where: { id } })
    return { success: true }
  }

  // ── Asignación por grado ─────────────────────────────────────────────────

  @Get('grade-subjects')
  @Roles('RECTOR', 'SECRETARIO')
  async findGradeSubjects(
    @CurrentUser() user: JwtPayload,
    @Query('grade_id')        gradeId?:      string,
    @Query('academic_year_id') academicYearId?: string,
  ) {
    return this.prisma.grade_subjects.findMany({
      where: {
        school_id: user.school_id,
        ...(gradeId        ? { grade_id:        gradeId        } : {}),
        ...(academicYearId ? { academic_year_id: academicYearId } : {}),
      },
      include: {
        subjects: {
          include: { subject_areas: { select: { id: true, name: true } } },
        },
        teachers: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'asc' },
    })
  }

  @Post('grade-subjects/sync')
  @Roles('RECTOR', 'SECRETARIO')
  async syncGradeSubjects(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      grade_id:         string
      academic_year_id: string
      assignments: {
        subject_id:   string
        teacher_id?:  string | null
        weekly_hours?: number | null
      }[]
    },
  ) {
    if (!body.grade_id)         throw new BadRequestException('grade_id is required')
    if (!body.academic_year_id) throw new BadRequestException('academic_year_id is required')
    if (!Array.isArray(body.assignments)) throw new BadRequestException('assignments must be an array')

    const [grade, year] = await Promise.all([
      this.prisma.grades.findFirst({ where: { id: body.grade_id, school_id: user.school_id } }),
      this.prisma.academic_years.findFirst({ where: { id: body.academic_year_id, school_id: user.school_id } }),
    ])
    if (!grade) throw new NotFoundException('Grado no encontrado')
    if (!year)  throw new NotFoundException('Año académico no encontrado')

    if (body.assignments.length > 0) {
      const subjectIds = body.assignments.map(a => a.subject_id)
      const found = await this.prisma.subjects.count({
        where: { id: { in: subjectIds }, school_id: user.school_id },
      })
      if (found !== subjectIds.length)
        throw new BadRequestException('Una o más asignaturas no pertenecen a este colegio')
    }

    return this.prisma.$transaction(async tx => {
      // Eliminar plan previo solo para este grado + año
      await tx.grade_subjects.deleteMany({
        where: { grade_id: body.grade_id, academic_year_id: body.academic_year_id },
      })

      if (body.assignments.length === 0) return []

      return tx.grade_subjects.createManyAndReturn({
        data: body.assignments.map(a => ({
          school_id:        user.school_id,
          grade_id:         body.grade_id,
          academic_year_id: body.academic_year_id,
          subject_id:       a.subject_id,
          teacher_id:       a.teacher_id  ?? null,
          weekly_hours:     a.weekly_hours ?? null,
        })),
      })
    })
  }
}
