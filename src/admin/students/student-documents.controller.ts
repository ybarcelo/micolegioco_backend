import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Response } from 'express'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../../storage/storage.service'
import { catalogLabel } from '../../catalog/enrollment-doc.catalog'
import { mimeFromFilename } from '../../common/utils/mime.util'

@Controller('admin/students/:id/documents')
export class StudentDocumentsController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async listDocuments(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const uploads = await this.prisma.enrollment_uploads.findMany({
      where: { student_id: id, school_id: user.school_id },
      include: { doc_config: true },
      orderBy: { uploaded_at: 'asc' },
    })

    return uploads.map(u => ({
      id: u.id,
      original_filename: u.original_filename,
      file_size: u.file_size,
      uploaded_at: u.uploaded_at,
      download_url: this.storage.publicPath(u.stored_path),
      doc_config: {
        id: u.doc_config.id,
        label: u.doc_config.catalog_key
          ? catalogLabel(u.doc_config.catalog_key)
          : u.doc_config.custom_name,
        is_required: u.doc_config.is_required,
      },
    }))
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png']
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only PDF, JPEG, and PNG files are allowed'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  async uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { doc_config_id: string },
  ) {
    if (!file) throw new BadRequestException('file is required')
    if (!body.doc_config_id) throw new BadRequestException('doc_config_id is required')

    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const docConfig = await this.prisma.enrollment_doc_configs.findUnique({
      where: { id: body.doc_config_id },
    })
    if (!docConfig) throw new NotFoundException('Document config not found')
    if (docConfig.school_id !== user.school_id) {
      throw new NotFoundException('Document config not found')
    }

    const storedPath = await this.storage.save(user.school_id, file.originalname, file.buffer)

    const upload = await this.prisma.enrollment_uploads.create({
      data: {
        school_id: user.school_id,
        student_id: id,
        doc_config_id: body.doc_config_id,
        original_filename: file.originalname,
        stored_path: storedPath,
        file_size: file.size,
      },
    })

    return {
      id: upload.id,
      original_filename: upload.original_filename,
      file_size: upload.file_size,
      uploaded_at: upload.uploaded_at,
      download_url: this.storage.publicPath(upload.stored_path),
    }
  }

  @Get(':docId')
  @Roles('RECTOR', 'SECRETARIO')
  async downloadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const upload = await this.prisma.enrollment_uploads.findFirst({
      where: { id: docId, student_id: id, school_id: user.school_id },
    })
    if (!upload) throw new NotFoundException('Document not found')

    const buffer = await this.storage.read(upload.stored_path)

    res
      .set({
        'Content-Type': mimeFromFilename(upload.original_filename),
        'Content-Disposition': `inline; filename="${upload.original_filename}"`,
        'Content-Length': String(buffer.length),
      })
      .send(buffer)
  }

  @Delete(':docId')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const upload = await this.prisma.enrollment_uploads.findFirst({
      where: { id: docId, student_id: id, school_id: user.school_id },
    })
    if (!upload) throw new NotFoundException('Document not found')

    await this.storage.delete(upload.stored_path)
    await this.prisma.enrollment_uploads.delete({ where: { id: docId } })

    return { success: true }
  }
}
