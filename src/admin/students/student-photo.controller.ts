import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
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
import { mimeFromFilename } from '../../common/utils/mime.util'

@Controller('admin/students/:id/photo')
@Roles('RECTOR', 'SECRETARIO')
export class StudentPhotoController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png']
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG and PNG images are allowed'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  async uploadPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('photo is required')

    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    if (student.photo_path) await this.storage.delete(student.photo_path)

    const storedPath = await this.storage.save(user.school_id, file.originalname, file.buffer)

    await this.prisma.students.update({
      where: { id },
      data: { photo_path: storedPath },
    })

    return { photo_path: storedPath }
  }

  @Get()
  async getPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student || !student.photo_path) throw new NotFoundException('Photo not found')

    const buffer = await this.storage.read(student.photo_path)

    res
      .set({
        'Content-Type': mimeFromFilename(student.photo_path),
        'Content-Length': String(buffer.length),
      })
      .send(buffer)
  }

  @Delete()
  async deletePhoto(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    if (student.photo_path) {
      await this.storage.delete(student.photo_path)
      await this.prisma.students.update({ where: { id }, data: { photo_path: null } })
    }

    return { success: true }
  }
}
