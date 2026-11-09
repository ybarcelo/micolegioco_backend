import { Controller, Get, Post, Body, Query, NotFoundException, BadRequestException } from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { proseName } from '../../common/utils/name.util'

const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // sin 0/O/1/I/L, para evitar confusiones al leer el código

@Controller('admin/certificates')
export class CertificatesController {
  constructor(private prisma: PrismaService) {}

  private randomCode(): string {
    let suffix = ''
    for (let i = 0; i < 8; i++) {
      suffix += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)]
    }
    return `CERT-${new Date().getFullYear()}-${suffix}`
  }

  @Get('verify')
  @Roles('RECTOR', 'SECRETARIO')
  async verify(@CurrentUser() user: JwtPayload, @Query('code') code?: string) {
    const trimmed = (code ?? '').trim().toUpperCase()
    if (!trimmed) throw new BadRequestException('Debe indicar un código')

    const cert = await this.prisma.certificates.findFirst({
      where: { certificate_code: trimmed, school_id: user.school_id },
      include: { students: true, service_fees: true, users: true },
    })
    if (!cert) throw new NotFoundException('Código no encontrado o no pertenece a este colegio')

    return {
      certificate_code: cert.certificate_code,
      issued_at: cert.issued_at,
      student_name: cert.students ? proseName(cert.students) : null,
      certificate_name: cert.service_fees?.name ?? null,
      certificate_subtype: cert.certificate_subtype,
      student_status: cert.student_status,
      issued_by_name: cert.users?.full_name ?? null,
    }
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async issue(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      student_id: string
      enrollment_id?: string
      service_fee_id: string
      certificate_subtype?: string
      student_status?: string
    },
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id: body.student_id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Estudiante no encontrado')

    const serviceFee = await this.prisma.service_fees.findFirst({
      where: { id: body.service_fee_id, school_id: user.school_id },
    })
    if (!serviceFee) throw new NotFoundException('Plantilla de certificado no encontrada')

    if (body.enrollment_id) {
      const enrollment = await this.prisma.enrollments.findFirst({
        where: { id: body.enrollment_id, student_id: body.student_id },
      })
      if (!enrollment) throw new NotFoundException('Matrícula no encontrada')
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await this.prisma.certificates.create({
          data: {
            school_id: user.school_id!,
            student_id: body.student_id,
            enrollment_id: body.enrollment_id ?? null,
            service_fee_id: body.service_fee_id,
            certificate_subtype: body.certificate_subtype ?? null,
            student_status: body.student_status ?? null,
            issued_by: user.sub,
            certificate_code: this.randomCode(),
          },
        })
        return { certificate_code: created.certificate_code, issued_at: created.issued_at }
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.toLowerCase().includes('unique') && attempt < 4) continue
        throw e
      }
    }
  }
}
