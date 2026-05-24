import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, NotFoundException, BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

const CONTRACT_INCLUDE = {
  teachers:        { select: { id: true, first_name: true, last_name: true, document_number: true } },
  escalafon_types: true,
  teacher_contract_subjects: {
    include: {
      subjects: {
        include: { subject_areas: { select: { id: true, name: true } } },
      },
    },
  },
} as const

@Controller('admin/teacher-contracts')
export class TeacherContractsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  findAll(@CurrentUser() user: JwtPayload, @Query('teacher_id') teacherId?: string) {
    const where: any = { school_id: user.school_id }
    if (teacherId) where.teacher_id = teacherId
    return this.prisma.teacher_contracts.findMany({
      where,
      include: CONTRACT_INCLUDE,
      orderBy: { start_date: 'desc' },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      teacher_id: string; escalafon_type_id: string
      start_date: string; end_date: string
      weekly_hours: number; notes?: string
      subject_ids?: string[]
    },
  ) {
    if (!body.teacher_id)        throw new BadRequestException('teacher_id is required')
    if (!body.escalafon_type_id) throw new BadRequestException('escalafon_type_id is required')
    if (!body.start_date)        throw new BadRequestException('start_date is required')
    if (!body.end_date)          throw new BadRequestException('end_date is required')
    if (!body.weekly_hours || body.weekly_hours <= 0)
      throw new BadRequestException('weekly_hours must be a positive number')

    const start = new Date(body.start_date)
    const end   = new Date(body.end_date)
    if (end < start) throw new BadRequestException('end_date must be >= start_date')

    const [teacher, escalafon] = await Promise.all([
      this.prisma.teachers.findFirst({ where: { id: body.teacher_id, school_id: user.school_id } }),
      this.prisma.escalafon_types.findFirst({ where: { id: body.escalafon_type_id, school_id: user.school_id } }),
    ])
    if (!teacher)   throw new NotFoundException('Docente no encontrado')
    if (!escalafon) throw new NotFoundException('Escalafón no encontrado')

    const subjectIds = await this.validatedSubjectIds(body.subject_ids ?? [], user.school_id)

    return this.prisma.$transaction(async tx => {
      const contract = await tx.teacher_contracts.create({
        data: {
          school_id:         user.school_id,
          teacher_id:        body.teacher_id,
          escalafon_type_id: body.escalafon_type_id,
          start_date:        start,
          end_date:          end,
          weekly_hours:      body.weekly_hours,
          notes:             body.notes ?? null,
        },
      })

      if (subjectIds.length > 0) {
        await tx.teacher_contract_subjects.createMany({
          data: subjectIds.map(sid => ({ contract_id: contract.id, subject_id: sid })),
        })
      }

      return tx.teacher_contracts.findUnique({
        where: { id: contract.id },
        include: CONTRACT_INCLUDE,
      })
    })
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      escalafon_type_id?: string; start_date?: string; end_date?: string
      weekly_hours?: number; notes?: string; subject_ids?: string[]
    },
  ) {
    const contract = await this.prisma.teacher_contracts.findFirst({ where: { id, school_id: user.school_id } })
    if (!contract) throw new NotFoundException('Contrato no encontrado')

    const start = body.start_date ? new Date(body.start_date) : contract.start_date
    const end   = body.end_date   ? new Date(body.end_date)   : contract.end_date
    if (end < start) throw new BadRequestException('end_date must be >= start_date')
    if (body.weekly_hours !== undefined && body.weekly_hours <= 0)
      throw new BadRequestException('weekly_hours must be a positive number')

    const subjectIds = body.subject_ids !== undefined
      ? await this.validatedSubjectIds(body.subject_ids, user.school_id)
      : null  // null = no cambiar

    return this.prisma.$transaction(async tx => {
      await tx.teacher_contracts.update({
        where: { id },
        data: {
          escalafon_type_id: body.escalafon_type_id ?? contract.escalafon_type_id,
          start_date:        start,
          end_date:          end,
          weekly_hours:      body.weekly_hours ?? contract.weekly_hours,
          notes:             body.notes !== undefined ? body.notes : contract.notes,
        },
      })

      if (subjectIds !== null) {
        await tx.teacher_contract_subjects.deleteMany({ where: { contract_id: id } })
        if (subjectIds.length > 0) {
          await tx.teacher_contract_subjects.createMany({
            data: subjectIds.map(sid => ({ contract_id: id, subject_id: sid })),
          })
        }
      }

      return tx.teacher_contracts.findUnique({
        where: { id },
        include: CONTRACT_INCLUDE,
      })
    })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const contract = await this.prisma.teacher_contracts.findFirst({ where: { id, school_id: user.school_id } })
    if (!contract) throw new NotFoundException('Contrato no encontrado')
    await this.prisma.teacher_contracts.delete({ where: { id } })
    return { success: true }
  }

  private async validatedSubjectIds(ids: string[], schoolId: string): Promise<string[]> {
    if (ids.length === 0) return []
    const found = await this.prisma.subjects.findMany({
      where: { id: { in: ids }, school_id: schoolId },
      select: { id: true },
    })
    if (found.length !== ids.length) throw new BadRequestException('Una o más asignaturas no pertenecen a este colegio')
    return found.map(s => s.id)
  }
}
