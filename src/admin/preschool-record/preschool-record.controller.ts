import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

const VALID_DIMENSIONS = new Set(['COGNITIVA', 'COMUNICATIVA', 'RELIGIOSA', 'ESTETICA'])
const VALID_RATINGS    = new Set(['EXCELENTE', 'SOBRESALIENTE', 'ACEPTABLE', 'BAJO'])

@Controller('admin/preschool-record')
export class PreschoolRecordController {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna estudiantes, valoraciones por dimensión e indicadores del período.
   */
  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async getGrades(
    @CurrentUser() user: JwtPayload,
    @Query('section_id') sectionId: string,
    @Query('period_id')  periodId:  string,
  ) {
    if (!sectionId) throw new BadRequestException('section_id is required')
    if (!periodId)  throw new BadRequestException('period_id is required')

    const section = await this.prisma.sections.findFirst({
      where: { id: sectionId, grades: { school_id: user.school_id } },
      select: { id: true },
    })
    if (!section) throw new BadRequestException('Sección no encontrada')

    const [enrollments, dimensionGrades, indicatorGrades] = await Promise.all([
      this.prisma.enrollments.findMany({
        where: {
          section_id: sectionId,
          status:     'ACTIVE',
          sections:   { grades: { school_id: user.school_id } },
        },
        select: {
          id:       true,
          students: { select: { first_name: true, last_name: true } },
        },
        orderBy: { students: { last_name: 'asc' } },
      }),
      this.prisma.preschool_dimension_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, dimension: true, rating: true },
      }),
      this.prisma.preschool_indicator_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, dimension: true, indicator_key: true, rating: true },
      }),
    ])

    return {
      students: enrollments.map(e => ({
        enrollment_id: e.id,
        first_name:    e.students?.first_name ?? '',
        last_name:     e.students?.last_name  ?? '',
      })),
      dimension_grades: dimensionGrades.map(r => ({
        enrollment_id: r.enrollment_id,
        dimension:     r.dimension,
        rating:        r.rating,
      })),
      indicator_grades: indicatorGrades.map(r => ({
        enrollment_id: r.enrollment_id,
        dimension:     r.dimension,
        indicator_key: r.indicator_key,
        rating:        r.rating,
      })),
    }
  }

  /** Upsert masivo de valoraciones por dimensión e indicador. */
  @Post('sync')
  @Roles('RECTOR', 'SECRETARIO')
  async syncGrades(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      section_id:       string
      period_id:        string
      dimension_grades: Array<{ enrollment_id: string; dimension: string; rating: string }>
      indicator_grades: Array<{ enrollment_id: string; dimension: string; indicator_key: string; rating: string }>
    },
  ) {
    if (!body.section_id)                       throw new BadRequestException('section_id is required')
    if (!body.period_id)                        throw new BadRequestException('period_id is required')
    if (!Array.isArray(body.dimension_grades))  throw new BadRequestException('dimension_grades must be an array')
    if (!Array.isArray(body.indicator_grades))  throw new BadRequestException('indicator_grades must be an array')

    for (const d of body.dimension_grades) {
      if (!VALID_DIMENSIONS.has(d.dimension))
        throw new BadRequestException(`dimension inválida: "${d.dimension}"`)
      if (!VALID_RATINGS.has(d.rating))
        throw new BadRequestException(`rating inválido: "${d.rating}"`)
    }

    for (const i of body.indicator_grades) {
      if (!VALID_DIMENSIONS.has(i.dimension))
        throw new BadRequestException(`dimension inválida: "${i.dimension}"`)
      if (!VALID_RATINGS.has(i.rating))
        throw new BadRequestException(`rating inválido: "${i.rating}"`)
      if (!i.indicator_key?.trim())
        throw new BadRequestException('indicator_key es requerido')
    }

    const dimOps = body.dimension_grades.map(d =>
      this.prisma.preschool_dimension_grades.upsert({
        where: {
          enrollment_id_academic_period_id_dimension: {
            enrollment_id:      d.enrollment_id,
            academic_period_id: body.period_id,
            dimension:          d.dimension,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      d.enrollment_id,
          academic_period_id: body.period_id,
          dimension:          d.dimension,
          rating:             d.rating,
          updated_at:         new Date(),
        },
        update: {
          rating:     d.rating,
          updated_at: new Date(),
        },
      })
    )

    const indOps = body.indicator_grades.map(i =>
      this.prisma.preschool_indicator_grades.upsert({
        where: {
          enrollment_id_academic_period_id_dimension_indicator_key: {
            enrollment_id:      i.enrollment_id,
            academic_period_id: body.period_id,
            dimension:          i.dimension,
            indicator_key:      i.indicator_key,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      i.enrollment_id,
          academic_period_id: body.period_id,
          dimension:          i.dimension,
          indicator_key:      i.indicator_key,
          rating:             i.rating,
          updated_at:         new Date(),
        },
        update: {
          rating:     i.rating,
          updated_at: new Date(),
        },
      })
    )

    if (dimOps.length > 0 || indOps.length > 0) {
      await this.prisma.$transaction([...dimOps, ...indOps])
    }

    return {
      synced:            body.dimension_grades.length,
      indicators_synced: body.indicator_grades.length,
    }
  }
}
