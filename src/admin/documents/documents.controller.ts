import {
  Controller,
  Get,
  Req,
  Res,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { StorageService } from '../../storage/storage.service'
import { mimeFromFilename } from '../../common/utils/mime.util'

@Controller('admin/documents')
export class DocumentsController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Get('*')
  async serveFile(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const rawUrl: string = (req as any).originalUrl || req.url
    const storedPath = rawUrl.replace(/^\/api\/admin\/documents\//, '').split('?')[0]

    if (!storedPath) throw new NotFoundException('File not found')

    const pathSchoolId = storedPath.split('/')[0]
    if (pathSchoolId !== user.school_id) {
      throw new ForbiddenException('Access denied')
    }

    const upload = await this.prisma.enrollment_uploads.findFirst({
      where: { stored_path: storedPath },
    })
    if (!upload) throw new NotFoundException('File not found')

    const buffer = await this.storage.read(storedPath)

    res
      .set({
        'Content-Type': mimeFromFilename(upload.original_filename),
        'Content-Disposition': `inline; filename="${upload.original_filename}"`,
        'Content-Length': String(buffer.length),
      })
      .send(buffer)
  }
}
