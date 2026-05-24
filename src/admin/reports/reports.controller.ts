import { Controller, Get } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/reports')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('simat')
  @Roles('RECTOR', 'SECRETARIO')
  async getSimatReport(@CurrentUser() user: JwtPayload) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        v.codigo_dane_colegio,
        v.document_type,
        v.document_number,
        v.nombre_completo,
        v.birth_date,
        v.gender,
        v.grado_actual,
        v.grupo
      FROM view_simat_report v
      JOIN schools sc ON sc.dane_code = v.codigo_dane_colegio
      WHERE sc.id = ${user.school_id}::uuid
      ORDER BY v.grado_actual, v.grupo, v.nombre_completo
    `
    return rows
  }
}
