import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query,
  UploadedFile, UseInterceptors,
  NotFoundException, BadRequestException,
  Res,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Response } from 'express'
import * as path from 'path'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../../storage/storage.service'

@Controller('admin/diagnostics')
export class DiagnosticsController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ── Catálogo (literal — debe ir antes de rutas con :param) ────────────────────
  @Get('catalog')
  @Roles('RECTOR', 'SECRETARIO')
  getCatalog() {
    return this.prisma.diagnosis_categories.findMany({
      orderBy: { sort_order: 'asc' },
      include: { diagnosis_types: { orderBy: { sort_order: 'asc' } } },
    })
  }

  // ── PIAR ──────────────────────────────────────────────────────────────────────
  @Get('piar')
  @Roles('RECTOR', 'SECRETARIO')
  async getPiar(
    @CurrentUser() user: JwtPayload,
    @Query('student_id') studentId: string,
    @Query('academic_year_id') academicYearId: string,
  ) {
    if (!studentId || !academicYearId)
      throw new BadRequestException('student_id y academic_year_id son requeridos')

    return this.prisma.student_piars.findFirst({
      where: { school_id: user.school_id, student_id: studentId, academic_year_id: academicYearId },
      include: {
        piar_adjustments: {
          include: { subject_areas: { select: { id: true, name: true } } },
          orderBy: { sort_order: 'asc' },
        },
      },
    })
  }

  @Post('piar')
  @Roles('RECTOR', 'SECRETARIO')
  async upsertPiar(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      student_id: string
      academic_year_id: string
      pedagogical_strengths?: string
      pedagogical_barriers?: string
      environmental_adjustments?: string
      school_commitment?: string
      family_commitment?: string
      student_commitment?: string
    },
  ) {
    if (!body.student_id || !body.academic_year_id)
      throw new BadRequestException('student_id y academic_year_id son requeridos')

    const student = await this.prisma.students.findFirst({
      where: { id: body.student_id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Estudiante no encontrado')

    const fields = {
      pedagogical_strengths:     body.pedagogical_strengths     ?? null,
      pedagogical_barriers:      body.pedagogical_barriers      ?? null,
      environmental_adjustments: body.environmental_adjustments ?? null,
      school_commitment:         body.school_commitment         ?? null,
      family_commitment:         body.family_commitment         ?? null,
      student_commitment:        body.student_commitment        ?? null,
    }

    return this.prisma.student_piars.upsert({
      where: {
        student_id_academic_year_id: {
          student_id:       body.student_id,
          academic_year_id: body.academic_year_id,
        },
      },
      create: { school_id: user.school_id, student_id: body.student_id, academic_year_id: body.academic_year_id, ...fields },
      update: fields,
      include: {
        piar_adjustments: {
          include: { subject_areas: { select: { id: true, name: true } } },
          orderBy: { sort_order: 'asc' },
        },
      },
    })
  }

  @Put('piar/:id/adjustments')
  @Roles('RECTOR', 'SECRETARIO')
  async syncAdjustments(
    @CurrentUser() user: JwtPayload,
    @Param('id') piarId: string,
    @Body() body: {
      adjustments: Array<{
        area_label?: string
        objectives?: string
        barriers?: string
        adjustments?: string
        evaluation_notes?: string
      }>
    },
  ) {
    const piar = await this.prisma.student_piars.findFirst({
      where: { id: piarId, school_id: user.school_id },
    })
    if (!piar) throw new NotFoundException('PIAR no encontrado')

    await this.prisma.$transaction([
      this.prisma.piar_adjustments.deleteMany({ where: { piar_id: piarId } }),
      ...body.adjustments.map((adj, i) =>
        this.prisma.piar_adjustments.create({
          data: {
            piar_id:          piarId,
            school_id:        user.school_id,
            area_label:       adj.area_label       || null,
            sort_order:       i,
            objectives:       adj.objectives       || null,
            barriers:         adj.barriers         || null,
            adjustments:      adj.adjustments      || null,
            evaluation_notes: adj.evaluation_notes || null,
          },
        })
      ),
    ])

    return this.prisma.student_piars.findFirst({
      where: { id: piarId },
      include: {
        piar_adjustments: {
          include: { subject_areas: { select: { id: true, name: true } } },
          orderBy: { sort_order: 'asc' },
        },
      },
    })
  }

  // ── Diagnósticos por estudiante ───────────────────────────────────────────────
  @Get('student/:studentId')
  @Roles('RECTOR', 'SECRETARIO')
  getStudentDiagnoses(
    @CurrentUser() user: JwtPayload,
    @Param('studentId') studentId: string,
  ) {
    return this.prisma.student_diagnoses.findMany({
      where: { school_id: user.school_id, student_id: studentId },
      include: {
        diagnosis_types: { include: { diagnosis_categories: true } },
      },
      orderBy: { created_at: 'asc' },
    })
  }

  @Post('student/:studentId')
  @Roles('RECTOR', 'SECRETARIO')
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  async addDiagnosis(
    @CurrentUser() user: JwtPayload,
    @Param('studentId') studentId: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!body.diagnosis_type_id)
      throw new BadRequestException('diagnosis_type_id es requerido')

    const student = await this.prisma.students.findFirst({
      where: { id: studentId, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Estudiante no encontrado')

    let document_path: string | null = null
    let document_filename: string | null = null
    if (file) {
      document_path     = await this.storage.save(user.school_id, file.originalname, file.buffer)
      document_filename = file.originalname
    }

    return this.prisma.student_diagnoses.create({
      data: {
        school_id:         user.school_id,
        student_id:        studentId,
        diagnosis_type_id: body.diagnosis_type_id,
        cie_code:          body.cie_code      || null,
        diagnosed_by:      body.diagnosed_by  || null,
        diagnosis_date:    body.diagnosis_date ? new Date(body.diagnosis_date) : null,
        document_path,
        document_filename,
        notes: body.notes || null,
      },
      include: { diagnosis_types: { include: { diagnosis_categories: true } } },
    })
  }

  // ── Diagnóstico individual (rutas con :id — definidas al final) ───────────────
  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  @UseInterceptors(FileInterceptor('document', { storage: memoryStorage() }))
  async updateDiagnosis(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const diag = await this.prisma.student_diagnoses.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!diag) throw new NotFoundException('Diagnóstico no encontrado')

    let { document_path, document_filename } = diag
    if (file) {
      if (diag.document_path) await this.storage.delete(diag.document_path)
      document_path     = await this.storage.save(user.school_id, file.originalname, file.buffer)
      document_filename = file.originalname
    }

    return this.prisma.student_diagnoses.update({
      where: { id },
      data: {
        diagnosis_type_id: body.diagnosis_type_id || diag.diagnosis_type_id,
        cie_code:          body.cie_code      !== undefined ? (body.cie_code      || null) : diag.cie_code,
        diagnosed_by:      body.diagnosed_by  !== undefined ? (body.diagnosed_by  || null) : diag.diagnosed_by,
        diagnosis_date:    body.diagnosis_date !== undefined
          ? (body.diagnosis_date ? new Date(body.diagnosis_date) : null)
          : diag.diagnosis_date,
        document_path,
        document_filename,
        notes: body.notes !== undefined ? (body.notes || null) : diag.notes,
      },
      include: { diagnosis_types: { include: { diagnosis_categories: true } } },
    })
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteDiagnosis(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const diag = await this.prisma.student_diagnoses.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!diag) throw new NotFoundException('Diagnóstico no encontrado')
    if (diag.document_path) await this.storage.delete(diag.document_path)
    await this.prisma.student_diagnoses.delete({ where: { id } })
    return { deleted: true }
  }

  @Get(':id/document')
  @Roles('RECTOR', 'SECRETARIO')
  async getDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const diag = await this.prisma.student_diagnoses.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!diag?.document_path) throw new NotFoundException('Documento no encontrado')

    const buffer = await this.storage.read(diag.document_path)
    const ext = path.extname(diag.document_filename ?? '').toLowerCase()
    const contentType =
      ext === '.pdf'  ? 'application/pdf' :
      ext === '.png'  ? 'image/png'       :
      ext === '.gif'  ? 'image/gif'       :
      ext === '.webp' ? 'image/webp'      : 'image/jpeg'

    res.set({
      'Content-Type':        contentType,
      'Content-Disposition': `inline; filename="${diag.document_filename}"`,
      'Content-Length':      String(buffer.length),
    })
    res.end(buffer)
  }
}
