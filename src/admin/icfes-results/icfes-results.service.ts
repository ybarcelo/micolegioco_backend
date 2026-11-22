import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface IcfesResultSummary {
  id:               string
  academic_year_id: string
  year_label:       string
  global_score:     number
  classification:   string
  notes:            string | null
}

@Injectable()
export class IcfesResultsService {
  constructor(private prisma: PrismaService) {}

  /** Un colegio "tiene grado 11" si tiene al menos un grado de educación MEDIA. */
  async isEligible(schoolId: string): Promise<boolean> {
    const count = await this.prisma.grades.count({ where: { school_id: schoolId, nivel_educativo: 'MEDIA' } })
    return count > 0
  }

  async list(schoolId: string): Promise<IcfesResultSummary[]> {
    const rows = await this.prisma.icfes_results.findMany({
      where: { school_id: schoolId },
      include: { academic_years: { select: { label: true, start_date: true } } },
      orderBy: { academic_years: { start_date: 'desc' } },
    })
    return rows.map(r => ({
      id: r.id, academic_year_id: r.academic_year_id, year_label: r.academic_years.label,
      global_score: r.global_score, classification: r.classification, notes: r.notes,
    }))
  }

  /** Resumen liviano para incrustar en GET /admin/dashboard (consulta en vivo, sin caché). */
  async getSummary(schoolId: string): Promise<{ eligible: boolean; latest: IcfesResultSummary | null; history: IcfesResultSummary[] }> {
    const eligible = await this.isEligible(schoolId)
    if (!eligible) return { eligible: false, latest: null, history: [] }

    const results = await this.list(schoolId)
    return { eligible: true, latest: results[0] ?? null, history: results.slice(0, 5) }
  }
}
