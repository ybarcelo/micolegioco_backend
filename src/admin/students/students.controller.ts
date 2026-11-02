import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Response } from 'express'
import * as XLSX from 'xlsx'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

const PAGE_SIZE = 20

@Controller('admin/students')
export class StudentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('exclude_status') excludeStatus?: string,
    @Query('page') page?: string,
    @Query('exclude_year_id') excludeYearId?: string,
    @Query('academic_year_id') academicYearId?: string,
    @Query('grade_id') gradeId?: string,
    @Query('section_id') sectionId?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
    const skip = (pageNum - 1) * PAGE_SIZE

    const where: any = { school_id: user.school_id }

    if (status) where.status = status
    else if (excludeStatus) where.status = { not: excludeStatus }

    if (q) {
      where.OR = [
        { first_name: { contains: q, mode: 'insensitive' } },
        { last_name: { contains: q, mode: 'insensitive' } },
        { document_number: { contains: q, mode: 'insensitive' } },
      ]
    }

    if (excludeYearId) {
      where.NOT = {
        enrollments: {
          some: {
            status: 'ACTIVE',
            sections: { academic_year_id: excludeYearId },
          },
        },
      }
    }

    // Filtra por el curso (grado/sección) de la matrícula activa del estudiante
    if (academicYearId || gradeId || sectionId) {
      where.enrollments = {
        some: {
          status: 'ACTIVE',
          ...(sectionId ? { section_id: sectionId } : {}),
          sections: {
            ...(academicYearId ? { academic_year_id: academicYearId } : {}),
            ...(gradeId ? { grade_id: gradeId } : {}),
          },
        },
      }
    }

    const [students, total] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
        include: {
          grades: { select: { id: true, name: true } },
          enrollments: {
            where: { status: 'ACTIVE', sections: { academic_years: { is_active: true } } },
            select: { id: true },
          },
        },
      }),
      this.prisma.students.count({ where }),
    ])

    return { students, total, page: pageNum, pages: Math.ceil(total / PAGE_SIZE) }
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(@CurrentUser() user: JwtPayload, @Body() body: any) {
    const required = ['first_name', 'last_name', 'document_type', 'document_number']
    for (const field of required) {
      if (!body[field]) throw new BadRequestException(`${field} is required`)
    }

    try {
      const student = await this.prisma.students.create({
        data: {
          school_id: user.school_id,
          first_name: body.first_name,
          last_name: body.last_name,
          document_type: body.document_type,
          document_number: body.document_number,
          exp_city: body.exp_city ?? null,
          birth_date: body.birth_date ? new Date(body.birth_date) : null,
          birth_city: body.birth_city ?? null,
          gender: body.gender ?? null,
          blood_type: body.blood_type ?? null,
          estrato: body.estrato ?? null,
          sisben_score: body.sisben_score ?? null,
          ethnicity: body.ethnicity ?? 'Ninguna',
          status: body.status ?? 'PROSPECTIVE',
          aspired_grade_id: body.aspired_grade_id ?? null,
          metadata: body.metadata ?? {},
        },
      })
      return student
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A student with this document number already exists in this school')
      }
      throw error
    }
  }

  @Get('import/template')
  @Roles('RECTOR', 'SECRETARIO')
  downloadTemplate(@Res() res: Response) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nombres', 'Apellidos', 'Tipo de documento', 'Número de documento'],
      ['María', 'González Pérez', 'TI', '1234567890'],
      ['Juan', 'Martínez López', 'RC', '9876543210'],
    ])
    ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 22 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes')
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.xlsx"')
    res.send(buf)
  }

  @Post('import')
  @Roles('RECTOR', 'SECRETARIO')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('status') status: string,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo')

    const importStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PROSPECTIVE'

    const wb = XLSX.read(file.buffer, { type: 'buffer' })
    if (!wb.SheetNames.length) throw new BadRequestException('El archivo Excel está vacío')

    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<(string | undefined)[]>(ws, { header: 1, defval: '' })
    const dataRows = (rows as (string | undefined)[][]).slice(1).filter(r =>
      r.some(c => c?.toString().trim()),
    )
    if (dataRows.length === 0) throw new BadRequestException('El archivo no contiene datos')

    const VALID_DOC_TYPES = new Set(['TI', 'RC', 'CC', 'CE', 'PA'])
    const errors: { row: number; message: string }[] = []
    const toCreate: { row: number; first_name: string; last_name: string; document_type: string; document_number: string }[] = []
    const seenDocs = new Set<string>()

    for (let i = 0; i < dataRows.length; i++) {
      const row        = dataRows[i]
      const rowNum     = i + 2
      const firstName  = row[0]?.toString().trim() ?? ''
      const lastName   = row[1]?.toString().trim() ?? ''
      const docType    = row[2]?.toString().trim().toUpperCase() ?? ''
      const docNumber  = row[3]?.toString().trim() ?? ''

      if (!firstName && !lastName && !docType && !docNumber) continue
      if (!firstName)  { errors.push({ row: rowNum, message: 'Nombres vacío' }); continue }
      if (!lastName)   { errors.push({ row: rowNum, message: 'Apellidos vacío' }); continue }
      if (!docType)    { errors.push({ row: rowNum, message: 'Tipo de documento vacío' }); continue }
      if (!VALID_DOC_TYPES.has(docType)) {
        errors.push({ row: rowNum, message: `Tipo de documento "${docType}" inválido. Use: TI, RC, CC, CE o PA` })
        continue
      }
      if (!docNumber)  { errors.push({ row: rowNum, message: 'Número de documento vacío' }); continue }

      const docKey = docNumber.toLowerCase()
      if (seenDocs.has(docKey)) {
        errors.push({ row: rowNum, message: `Documento "${docNumber}" duplicado en el archivo` })
        continue
      }
      seenDocs.add(docKey)

      toCreate.push({ row: rowNum, first_name: firstName, last_name: lastName, document_type: docType, document_number: docNumber })
    }

    if (toCreate.length > 0) {
      const existing = await this.prisma.students.findMany({
        where: { school_id: user.school_id, document_number: { in: toCreate.map(t => t.document_number) } },
        select: { document_number: true },
      })
      const existingSet = new Set(existing.map(e => e.document_number.toLowerCase()))

      const valid = toCreate.filter(t => {
        if (existingSet.has(t.document_number.toLowerCase())) {
          errors.push({ row: t.row, message: `Documento "${t.document_number}" ya existe en el colegio` })
          return false
        }
        return true
      })

      if (valid.length > 0) {
        await this.prisma.students.createMany({
          data: valid.map(t => ({
            school_id:       user.school_id,
            first_name:      t.first_name,
            last_name:       t.last_name,
            document_type:   t.document_type,
            document_number: t.document_number,
            ethnicity:       'Ninguna',
            status:          importStatus,
          })),
        })
        return { created: valid.length, errors }
      }
    }

    return { created: 0, errors }
  }

  @Get(':id')
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })

    if (!student) throw new NotFoundException('Student not found')
    return student
  }

  /**
   * Resumen de notas de un estudiante en un año lectivo, para certificados de notas
   * (finales/periódicas). A diferencia de /admin/academic-record/grades (una sección,
   * un período), aquí se trae un solo estudiante a través de TODOS los períodos del año.
   */
  @Get(':id/grades-summary')
  @Roles('RECTOR', 'SECRETARIO')
  async getGradesSummary(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('academic_year_id') academicYearId: string,
  ) {
    if (!academicYearId) throw new BadRequestException('academic_year_id is required')

    const student = await this.prisma.students.findFirst({ where: { id, school_id: user.school_id } })
    if (!student) throw new NotFoundException('Student not found')

    const enrollment = await this.prisma.enrollments.findFirst({
      where: {
        student_id: id,
        sections: { academic_year_id: academicYearId, grades: { school_id: user.school_id } },
      },
      select: { id: true, sections: { select: { grade_id: true } } },
      orderBy: { enrollment_date: 'desc' },
    })
    if (!enrollment || !enrollment.sections?.grade_id)
      throw new NotFoundException('El estudiante no tiene matrícula en ese año lectivo')

    const gradeId = enrollment.sections.grade_id

    const [config, periods, gradeSubjects] = await Promise.all([
      this.prisma.grading_scale_config.findUnique({ where: { school_id: user.school_id } }),
      this.prisma.academic_periods.findMany({
        where: { academic_year_id: academicYearId, school_id: user.school_id },
        orderBy: { sort_order: 'asc' },
        select: { id: true, name: true, period_number: true },
      }),
      this.prisma.grade_subjects.findMany({
        where: { school_id: user.school_id, grade_id: gradeId, academic_year_id: academicYearId },
        select: {
          subject_id: true,
          subjects: {
            select: { id: true, name: true, sort_order: true, subject_areas: { select: { id: true, name: true, sort_order: true } } },
          },
        },
        orderBy: [
          { subjects: { subject_areas: { sort_order: 'asc' } } },
          { subjects: { sort_order: 'asc' } },
        ],
      }),
    ])

    const scaleType  = config?.scale_type ?? 'NUMERIC'
    const periodIds  = periods.map(p => p.id)
    const periodsOut = periods.map(p => ({ id: p.id, name: p.name, period_number: p.period_number }))

    if (scaleType === 'POINTS') {
      const areaMap = new Map<string, { id: string; name: string; sort_order: number }>()
      for (const gs of gradeSubjects) {
        const a = gs.subjects.subject_areas
        if (a?.id && !areaMap.has(a.id)) areaMap.set(a.id, { id: a.id, name: a.name, sort_order: a.sort_order ?? 0 })
      }
      const areas = [...areaMap.values()].sort((a, b) => a.sort_order - b.sort_order)

      const areaGrades = await this.prisma.student_area_grades.findMany({
        where: { school_id: user.school_id, enrollment_id: enrollment.id, academic_period_id: { in: periodIds } },
        select: { subject_area_id: true, academic_period_id: true, points: true },
      })

      return {
        scale_type: 'POINTS',
        periods: periodsOut,
        subjects: [],
        areas,
        grades: [],
        area_grades: areaGrades.map(g => ({
          subject_area_id: g.subject_area_id, academic_period_id: g.academic_period_id, points: g.points,
        })),
      }
    }

    const grades = await this.prisma.student_grades.findMany({
      where: { school_id: user.school_id, enrollment_id: enrollment.id, academic_period_id: { in: periodIds } },
      select: { subject_id: true, academic_period_id: true, numeric_grade: true, qualitative_grade: true },
    })

    return {
      scale_type: scaleType,
      periods: periodsOut,
      subjects: gradeSubjects.map(gs => ({
        id: gs.subjects.id, name: gs.subjects.name, sort_order: gs.subjects.sort_order,
      })),
      areas: [],
      grades: grades.map(g => ({
        subject_id:         g.subject_id,
        academic_period_id: g.academic_period_id,
        numeric_grade:      g.numeric_grade ? Number(g.numeric_grade) : null,
        qualitative_grade:  g.qualitative_grade ?? null,
      })),
      area_grades: [],
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const existing = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!existing) throw new NotFoundException('Student not found')

    try {
      const updated = await this.prisma.students.update({
        where: { id },
        data: {
          first_name: body.first_name ?? existing.first_name,
          last_name: body.last_name ?? existing.last_name,
          document_type: body.document_type ?? existing.document_type,
          document_number: body.document_number ?? existing.document_number,
          exp_city: body.exp_city !== undefined ? body.exp_city : existing.exp_city,
          birth_date: body.birth_date ? new Date(body.birth_date) : existing.birth_date,
          birth_city: body.birth_city !== undefined ? body.birth_city : existing.birth_city,
          gender: body.gender !== undefined ? body.gender : existing.gender,
          blood_type: body.blood_type !== undefined ? body.blood_type : existing.blood_type,
          estrato: body.estrato !== undefined ? body.estrato : existing.estrato,
          sisben_score: body.sisben_score !== undefined ? body.sisben_score : existing.sisben_score,
          ethnicity: body.ethnicity !== undefined ? body.ethnicity : existing.ethnicity,
          status: body.status !== undefined ? body.status : existing.status,
          aspired_grade_id: body.aspired_grade_id !== undefined ? body.aspired_grade_id : existing.aspired_grade_id,
          metadata: body.metadata !== undefined ? body.metadata : existing.metadata,
          updated_at: new Date(),
        },
      })
      return updated
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A student with this document number already exists in this school')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const existing = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!existing) throw new NotFoundException('Student not found')

    await this.prisma.students.delete({ where: { id } })
    return { success: true }
  }
}
