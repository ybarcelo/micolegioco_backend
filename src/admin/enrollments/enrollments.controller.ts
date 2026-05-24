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

const PAGE_SIZE = 25

@Controller('admin/enrollments')
export class EnrollmentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('academic_year_id') academicYearId?: string,
    @Query('grade_id') gradeId?: string,
    @Query('section_id') sectionId?: string,
    @Query('page') page?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
    const skip = (pageNum - 1) * PAGE_SIZE

    const where: any = {
      sections: {
        grades: { school_id: user.school_id },
      },
    }

    if (academicYearId) {
      where.sections = { ...where.sections, academic_year_id: academicYearId }
    }

    if (gradeId) {
      where.sections = { ...where.sections, grade_id: gradeId }
    }

    if (sectionId) {
      where.section_id = sectionId
    }

    if (q) {
      where.students = {
        OR: [
          { first_name: { contains: q, mode: 'insensitive' } },
          { last_name: { contains: q, mode: 'insensitive' } },
          { document_number: { contains: q, mode: 'insensitive' } },
        ],
      }
    }

    const [enrollments, total] = await Promise.all([
      this.prisma.enrollments.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        include: {
          students: true,
          sections: {
            include: {
              grades: true,
              academic_years: true,
            },
          },
        },
        orderBy: { enrollment_date: 'desc' },
      }),
      this.prisma.enrollments.count({ where }),
    ])

    return { enrollments, total, page: pageNum, pages: Math.ceil(total / PAGE_SIZE) }
  }

  @Post('bulk')
  @Roles('RECTOR', 'SECRETARIO')
  async bulkEnroll(
    @CurrentUser() user: JwtPayload,
    @Body() body: { section_id: string; student_ids: string[]; enrollment_date?: string },
  ) {
    if (!body.section_id) throw new BadRequestException('section_id is required')
    if (!Array.isArray(body.student_ids) || body.student_ids.length === 0) {
      throw new BadRequestException('student_ids must be a non-empty array')
    }

    const section = await this.prisma.sections.findFirst({
      where: { id: body.section_id, grades: { school_id: user.school_id } },
      select: { id: true, capacity: true },
    })
    if (!section) throw new NotFoundException('Section not found')

    const enrollDate = body.enrollment_date ? new Date(body.enrollment_date) : new Date()

    const students = await this.prisma.students.findMany({
      where: {
        id: { in: body.student_ids },
        school_id: user.school_id,
        status: { in: ['PROSPECTIVE', 'ACTIVE'] },
      },
      select: { id: true, first_name: true, last_name: true },
    })
    const foundIds = new Set(students.map(s => s.id))

    const errors: { student_id: string; name: string; reason: string }[] = []

    for (const sid of body.student_ids) {
      if (!foundIds.has(sid)) {
        errors.push({ student_id: sid, name: '—', reason: 'No encontrado o estado inválido' })
      }
    }

    const alreadyEnrolled = await this.prisma.enrollments.findMany({
      where: { section_id: body.section_id, student_id: { in: students.map(s => s.id) } },
      select: { student_id: true },
    })
    const enrolledSet = new Set(alreadyEnrolled.map(e => e.student_id))

    const toCreate = students.filter(s => {
      if (enrolledSet.has(s.id)) {
        errors.push({ student_id: s.id, name: `${s.last_name}, ${s.first_name}`, reason: 'Ya está matriculado en esta sección' })
        return false
      }
      return true
    })

    // Capacity check
    const activeCount = await this.prisma.enrollments.count({
      where: { section_id: body.section_id, status: 'ACTIVE' },
    })
    const available = (section.capacity ?? 30) - activeCount
    if (toCreate.length > available) {
      const overflow = toCreate.splice(available)
      for (const s of overflow) {
        errors.push({ student_id: s.id, name: `${s.last_name}, ${s.first_name}`, reason: 'Sección sin capacidad disponible' })
      }
    }

    let created = 0
    if (toCreate.length > 0) {
      await this.prisma.$transaction(async tx => {
        for (const student of toCreate) {
          await tx.enrollments.create({
            data: {
              student_id:      student.id,
              section_id:      body.section_id,
              enrollment_date: enrollDate,
              status:          'ACTIVE',
            },
          })
          await tx.students.update({
            where: { id: student.id },
            data:  { status: 'ACTIVE', updated_at: new Date() },
          })
          created++
        }
      })
    }

    return { created, errors }
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    if (!body.student_id) throw new BadRequestException('student_id is required')
    if (!body.section_id) throw new BadRequestException('section_id is required')

    // Verify section belongs to school
    const section = await this.prisma.sections.findFirst({
      where: {
        id: body.section_id,
        grades: { school_id: user.school_id },
      },
      include: {
        grades: true,
        academic_years: true,
      },
    })
    if (!section) throw new NotFoundException('Section not found')

    // Check capacity
    const activeCount = await this.prisma.enrollments.count({
      where: { section_id: body.section_id, status: 'ACTIVE' },
    })

    if (activeCount >= (section.capacity ?? 30)) {
      throw new BadRequestException('Section is at full capacity')
    }

    try {
      return await this.prisma.enrollments.create({
        data: {
          student_id: body.student_id,
          section_id: body.section_id,
          enrollment_date: body.enrollment_date ? new Date(body.enrollment_date) : new Date(),
          status: body.status ?? 'ACTIVE',
          academic_result: body.academic_result ?? null,
          student_signature: body.student_signature ?? null,
          guardian_signature: body.guardian_signature ?? null,
          rector_signature: body.rector_signature ?? null,
        },
        include: {
          students: true,
          sections: {
            include: {
              grades: true,
              academic_years: true,
            },
          },
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('Student is already enrolled in this section')
      }
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const enrollment = await this.prisma.enrollments.findFirst({
      where: {
        id,
        sections: { grades: { school_id: user.school_id } },
      },
    })
    if (!enrollment) throw new NotFoundException('Enrollment not found')

    return this.prisma.enrollments.update({
      where: { id },
      data: {
        status: body.status ?? enrollment.status,
        section_id: body.section_id ?? enrollment.section_id,
        enrollment_date: body.enrollment_date ? new Date(body.enrollment_date) : enrollment.enrollment_date,
        academic_result: body.academic_result !== undefined ? body.academic_result : enrollment.academic_result,
        saber11_score: body.saber11_score !== undefined ? (body.saber11_score !== null ? Number(body.saber11_score) : null) : enrollment.saber11_score,
        student_signature: body.student_signature !== undefined ? body.student_signature : enrollment.student_signature,
        guardian_signature: body.guardian_signature !== undefined ? body.guardian_signature : enrollment.guardian_signature,
        rector_signature: body.rector_signature !== undefined ? body.rector_signature : enrollment.rector_signature,
      },
      include: {
        students: true,
        sections: {
          include: {
            grades: true,
            academic_years: true,
          },
        },
      },
    })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const enrollment = await this.prisma.enrollments.findFirst({
      where: {
        id,
        sections: { grades: { school_id: user.school_id } },
      },
    })
    if (!enrollment) throw new NotFoundException('Enrollment not found')

    await this.prisma.enrollments.delete({ where: { id } })
    return { success: true }
  }
}
