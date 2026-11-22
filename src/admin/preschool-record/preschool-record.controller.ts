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

const VALID_RATINGS = new Set(['EXCELENTE', 'SOBRESALIENTE', 'ACEPTABLE', 'BAJO'])

@Controller('admin/preschool-record')
export class PreschoolRecordController {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna estudiantes, el catálogo de dimensiones/indicadores del colegio, y las
   * valoraciones por dimensión e indicador ya guardadas en el período.
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

    const [enrollments, dimensions, dimensionGrades, indicatorGrades] = await Promise.all([
      this.prisma.enrollments.findMany({
        where: {
          section_id: sectionId,
          status:     'ACTIVE',
          sections:   { grades: { school_id: user.school_id } },
        },
        select: {
          id:       true,
          students: { select: { first_name: true, second_name: true, last_name: true, second_last_name: true } },
        },
        orderBy: [{ students: { last_name: 'asc' } }, { students: { second_last_name: 'asc' } }, { students: { first_name: 'asc' } }],
      }),
      this.prisma.preschool_dimensions.findMany({
        where: { school_id: user.school_id },
        orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
        include: {
          preschool_indicators: { orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] },
        },
      }),
      this.prisma.preschool_dimension_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, dimension_id: true, rating: true },
      }),
      this.prisma.preschool_indicator_grades.findMany({
        where: {
          school_id:          user.school_id,
          academic_period_id: periodId,
          enrollments:        { section_id: sectionId },
        },
        select: { enrollment_id: true, dimension_id: true, indicator_id: true, rating: true },
      }),
    ])

    return {
      students: enrollments.map(e => ({
        enrollment_id:    e.id,
        first_name:       e.students?.first_name ?? '',
        second_name:      e.students?.second_name ?? null,
        last_name:        e.students?.last_name  ?? '',
        second_last_name: e.students?.second_last_name ?? null,
      })),
      dimensions: dimensions.map(d => ({
        id:          d.id,
        name:        d.name,
        description: d.description,
        preschool_indicators: d.preschool_indicators.map(i => ({ id: i.id, name: i.name })),
      })),
      dimension_grades: dimensionGrades.map(r => ({
        enrollment_id: r.enrollment_id,
        dimension_id:  r.dimension_id,
        rating:        r.rating,
      })),
      indicator_grades: indicatorGrades.map(r => ({
        enrollment_id: r.enrollment_id,
        dimension_id:  r.dimension_id,
        indicator_id:  r.indicator_id,
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
      dimension_grades: Array<{ enrollment_id: string; dimension_id: string; rating: string }>
      indicator_grades: Array<{ enrollment_id: string; dimension_id: string; indicator_id: string; rating: string }>
    },
  ) {
    if (!body.section_id)                       throw new BadRequestException('section_id is required')
    if (!body.period_id)                        throw new BadRequestException('period_id is required')
    if (!Array.isArray(body.dimension_grades))  throw new BadRequestException('dimension_grades must be an array')
    if (!Array.isArray(body.indicator_grades))  throw new BadRequestException('indicator_grades must be an array')

    const [validDimensions, validIndicators] = await Promise.all([
      this.prisma.preschool_dimensions.findMany({ where: { school_id: user.school_id }, select: { id: true } }),
      this.prisma.preschool_indicators.findMany({ where: { school_id: user.school_id }, select: { id: true, dimension_id: true } }),
    ])
    const validDimensionIds = new Set(validDimensions.map(d => d.id))
    const validIndicatorIds = new Map(validIndicators.map(i => [i.id, i.dimension_id]))

    for (const d of body.dimension_grades) {
      if (!validDimensionIds.has(d.dimension_id))
        throw new BadRequestException(`dimension_id inválido: "${d.dimension_id}"`)
      if (!VALID_RATINGS.has(d.rating))
        throw new BadRequestException(`rating inválido: "${d.rating}"`)
    }

    for (const i of body.indicator_grades) {
      if (!validDimensionIds.has(i.dimension_id))
        throw new BadRequestException(`dimension_id inválido: "${i.dimension_id}"`)
      if (validIndicatorIds.get(i.indicator_id) !== i.dimension_id)
        throw new BadRequestException(`indicator_id inválido: "${i.indicator_id}"`)
      if (!VALID_RATINGS.has(i.rating))
        throw new BadRequestException(`rating inválido: "${i.rating}"`)
    }

    const dimOps = body.dimension_grades.map(d =>
      this.prisma.preschool_dimension_grades.upsert({
        where: {
          enrollment_id_academic_period_id_dimension_id: {
            enrollment_id:      d.enrollment_id,
            academic_period_id: body.period_id,
            dimension_id:       d.dimension_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      d.enrollment_id,
          academic_period_id: body.period_id,
          dimension_id:       d.dimension_id,
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
          enrollment_id_academic_period_id_indicator_id: {
            enrollment_id:      i.enrollment_id,
            academic_period_id: body.period_id,
            indicator_id:       i.indicator_id,
          },
        },
        create: {
          school_id:          user.school_id,
          enrollment_id:      i.enrollment_id,
          academic_period_id: body.period_id,
          dimension_id:       i.dimension_id,
          indicator_id:       i.indicator_id,
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
