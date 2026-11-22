import { Controller, Get, Post, Put, Delete, Param, Body, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { IcfesResultsService } from './icfes-results.service'

const VALID_CLASSIFICATIONS = new Set(['A+', 'A', 'B', 'C', 'D'])

interface IcfesResultBody {
  academic_year_id: string
  global_score:     number
  classification:   string
  notes?:           string
}

function validate(body: IcfesResultBody) {
  if (!body.academic_year_id) throw new BadRequestException('El año académico es obligatorio')
  if (typeof body.global_score !== 'number' || body.global_score < 0 || body.global_score > 500) {
    throw new BadRequestException('El puntaje global debe estar entre 0 y 500')
  }
  if (!VALID_CLASSIFICATIONS.has(body.classification)) {
    throw new BadRequestException('Clasificación inválida (debe ser A+, A, B, C o D)')
  }
}

@Controller('admin/icfes-results')
export class IcfesResultsController {
  constructor(private prisma: PrismaService, private icfesResults: IcfesResultsService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(@CurrentUser() user: JwtPayload) {
    const [eligible, results] = await Promise.all([
      this.icfesResults.isEligible(user.school_id!),
      this.icfesResults.list(user.school_id!),
    ])
    return { eligible, results }
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: IcfesResultBody) {
    validate(body)
    const year = await this.prisma.academic_years.findFirst({ where: { id: body.academic_year_id, school_id: user.school_id } })
    if (!year) throw new NotFoundException('Año académico no encontrado')

    try {
      return await this.prisma.icfes_results.create({
        data: {
          school_id: user.school_id!, academic_year_id: body.academic_year_id,
          global_score: body.global_score, classification: body.classification,
          notes: body.notes?.trim() || null,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('unique')) throw new ConflictException('Ya existe un resultado ICFES para ese año')
      throw e
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: IcfesResultBody) {
    validate(body)
    const existing = await this.prisma.icfes_results.findFirst({ where: { id, school_id: user.school_id } })
    if (!existing) throw new NotFoundException('Resultado no encontrado')

    const year = await this.prisma.academic_years.findFirst({ where: { id: body.academic_year_id, school_id: user.school_id } })
    if (!year) throw new NotFoundException('Año académico no encontrado')

    try {
      return await this.prisma.icfes_results.update({
        where: { id },
        data: {
          academic_year_id: body.academic_year_id, global_score: body.global_score,
          classification: body.classification, notes: body.notes?.trim() || null,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('unique')) throw new ConflictException('Ya existe un resultado ICFES para ese año')
      throw e
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const existing = await this.prisma.icfes_results.findFirst({ where: { id, school_id: user.school_id } })
    if (!existing) throw new NotFoundException('Resultado no encontrado')
    await this.prisma.icfes_results.delete({ where: { id } })
    return { success: true }
  }
}
