import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Response } from 'express'
import * as XLSX from 'xlsx'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/achievements')
export class AchievementsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('subject_id') subjectId?: string,
    @Query('grade_id')   gradeId?: string,
  ) {
    return this.prisma.subject_achievements.findMany({
      where: {
        school_id: user.school_id,
        ...(subjectId ? { subject_id: subjectId } : {}),
        ...(gradeId   ? { grade_id:   gradeId   } : {}),
      },
      include: {
        subjects: { select: { id: true, name: true } },
        grades:   { select: { id: true, name: true, level: true } },
      },
      orderBy: [
        { grades:   { level: 'asc' } },
        { subjects: { name:  'asc' } },
        { code:     'asc' },
      ],
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { subject_id: string; grade_id: string; description: string },
  ) {
    if (!body.subject_id)          throw new BadRequestException('subject_id is required')
    if (!body.grade_id)            throw new BadRequestException('grade_id is required')
    if (!body.description?.trim()) throw new BadRequestException('description is required')

    if (user.role === 'DOCENTE') {
      await this.checkTeacherAccess(user, body.subject_id, body.grade_id)
    }

    return this.prisma.$transaction(async tx => {
      const last = await tx.subject_achievements.findFirst({
        where:   { school_id: user.school_id },
        orderBy: { code: 'desc' },
        select:  { code: true },
      })
      const nextNum = last ? parseInt(last.code, 10) + 1 : 1
      const code = String(nextNum).padStart(5, '0')

      return tx.subject_achievements.create({
        data: {
          school_id:   user.school_id,
          subject_id:  body.subject_id,
          grade_id:    body.grade_id,
          code,
          description: body.description.trim(),
        },
        include: {
          subjects: { select: { id: true, name: true } },
          grades:   { select: { id: true, name: true, level: true } },
        },
      })
    })
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { subject_id?: string; grade_id?: string; description?: string },
  ) {
    const achievement = await this.prisma.subject_achievements.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!achievement) throw new NotFoundException('Logro no encontrado')

    const newSubjectId = body.subject_id ?? achievement.subject_id
    const newGradeId   = body.grade_id   ?? achievement.grade_id

    if (user.role === 'DOCENTE') {
      await this.checkTeacherAccess(user, newSubjectId, newGradeId)
    }

    return this.prisma.subject_achievements.update({
      where: { id },
      data: {
        subject_id:  newSubjectId,
        grade_id:    newGradeId,
        description: body.description?.trim() ?? achievement.description,
        updated_at:  new Date(),
      },
      include: {
        subjects: { select: { id: true, name: true } },
        grades:   { select: { id: true, name: true, level: true } },
      },
    })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const achievement = await this.prisma.subject_achievements.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!achievement) throw new NotFoundException('Logro no encontrado')

    if (user.role === 'DOCENTE') {
      await this.checkTeacherAccess(user, achievement.subject_id, achievement.grade_id)
    }

    await this.prisma.subject_achievements.delete({ where: { id } })
    return { success: true }
  }

  /** Descarga una plantilla Excel con las columnas requeridas */
  @Get('import/template')
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  downloadTemplate(@Res() res: Response) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Grado', 'Asignatura', 'Descripción'],
      ['Primero', 'Matemáticas', 'El estudiante calcula el área y perímetro de figuras geométricas.'],
      ['Segundo', 'Ciencias Naturales', 'El estudiante identifica las partes de la célula animal y vegetal.'],
    ])
    ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 70 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Logros')
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_logros.xlsx"')
    res.send(buf)
  }

  /** Importa logros masivamente desde un archivo Excel */
  @Post('import')
  @Roles('RECTOR', 'SECRETARIO', 'DOCENTE')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo')

    const wb = XLSX.read(file.buffer, { type: 'buffer' })
    if (!wb.SheetNames.length) throw new BadRequestException('El archivo Excel está vacío')

    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<(string | undefined)[]>(ws, { header: 1, defval: '' })
    const dataRows = (rows as (string | undefined)[][]).slice(1).filter(r =>
      r.some(c => c?.toString().trim())
    )

    if (dataRows.length === 0) throw new BadRequestException('El archivo no contiene datos')

    const [grades, subjects] = await Promise.all([
      this.prisma.grades.findMany({ where: { school_id: user.school_id }, select: { id: true, name: true } }),
      this.prisma.subjects.findMany({ where: { school_id: user.school_id }, select: { id: true, name: true } }),
    ])

    const gradeMap   = new Map(grades.map(g => [g.name.toLowerCase().trim(), g.id]))
    const subjectMap = new Map(subjects.map(s => [s.name.toLowerCase().trim(), s.id]))

    // Para DOCENTE: cargar sus asignaciones (subject_id + grade_id permitidos)
    let teacherScope: Set<string> | null = null
    if (user.role === 'DOCENTE') {
      if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')
      const gs = await this.prisma.grade_subjects.findMany({
        where: { teacher_id: user.teacher_id },
        select: { subject_id: true, grade_id: true },
      })
      teacherScope = new Set(gs.map(g => `${g.subject_id}:${g.grade_id}`))
    }

    const errors: { row: number; message: string }[] = []
    const toCreate: { grade_id: string; subject_id: string; description: string }[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row      = dataRows[i]
      const rowNum   = i + 2
      const gradeName   = row[0]?.toString().trim() ?? ''
      const subjectName = row[1]?.toString().trim() ?? ''
      const description = row[2]?.toString().trim() ?? ''

      if (!gradeName && !subjectName && !description) continue
      if (!gradeName)   { errors.push({ row: rowNum, message: 'Grado vacío' }); continue }
      if (!subjectName) { errors.push({ row: rowNum, message: 'Asignatura vacía' }); continue }
      if (!description) { errors.push({ row: rowNum, message: 'Descripción vacía' }); continue }

      const gradeId   = gradeMap.get(gradeName.toLowerCase())
      const subjectId = subjectMap.get(subjectName.toLowerCase())

      if (!gradeId)   { errors.push({ row: rowNum, message: `Grado "${gradeName}" no encontrado` }); continue }
      if (!subjectId) { errors.push({ row: rowNum, message: `Asignatura "${subjectName}" no encontrada` }); continue }

      if (teacherScope && !teacherScope.has(`${subjectId}:${gradeId}`)) {
        errors.push({ row: rowNum, message: `No tienes asignada la asignatura "${subjectName}" en "${gradeName}"` })
        continue
      }

      toCreate.push({ grade_id: gradeId, subject_id: subjectId, description })
    }

    if (toCreate.length > 0) {
      await this.prisma.$transaction(async tx => {
        const last = await tx.subject_achievements.findFirst({
          where:   { school_id: user.school_id },
          orderBy: { code: 'desc' },
          select:  { code: true },
        })
        let nextNum = last ? parseInt(last.code, 10) + 1 : 1
        for (const item of toCreate) {
          await tx.subject_achievements.create({
            data: {
              school_id:   user.school_id,
              grade_id:    item.grade_id,
              subject_id:  item.subject_id,
              code:        String(nextNum++).padStart(5, '0'),
              description: item.description,
            },
          })
        }
      })
    }

    return { created: toCreate.length, errors }
  }

  private async checkTeacherAccess(user: JwtPayload, subjectId: string, gradeId: string) {
    if (!user.teacher_id) throw new ForbiddenException('No teacher profile linked to this account')
    const assigned = await this.prisma.grade_subjects.findFirst({
      where: { subject_id: subjectId, grade_id: gradeId, teacher_id: user.teacher_id },
    })
    if (!assigned) throw new ForbiddenException('Solo puedes gestionar logros de tus asignaturas asignadas')
  }
}
