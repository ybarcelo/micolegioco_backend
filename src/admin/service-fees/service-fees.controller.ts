import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/service-fees')
export class ServiceFeesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO', 'TESORERO')
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.service_fees.findMany({
      where: { school_id: user.school_id },
      orderBy: { name: 'asc' },
    })
  }

  private readonly VALID_SERVICE_TYPES = ['CERTIFICADO', 'SERVICIO']
  private readonly CERTIFICATE_SUBTYPES = [
    'CONSTANCIA_ESTUDIO', 'NOTAS_FINALES', 'NOTAS_PERIODICAS', 'COSTOS', 'BUENA_CONDUCTA', 'OTRO',
  ]
  private readonly STUDENT_STATUS_OPTIONS = [
    'CURSA_ACTUALMENTE', 'CURSO_APROBO', 'CURSO_REPROBO', 'CURSO',
  ]

  private validateCertificateFields(body: {
    certificate_subtype?: string | null
    default_student_status?: string | null
  }) {
    if (body.certificate_subtype != null && !this.CERTIFICATE_SUBTYPES.includes(body.certificate_subtype))
      throw new BadRequestException(`certificate_subtype must be one of: ${this.CERTIFICATE_SUBTYPES.join(', ')}`)
    if (body.default_student_status != null && !this.STUDENT_STATUS_OPTIONS.includes(body.default_student_status))
      throw new BadRequestException(`default_student_status must be one of: ${this.STUDENT_STATUS_OPTIONS.join(', ')}`)
  }

  @Post()
  @Roles('RECTOR')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      name: string
      amount: number
      applies_to_grade_level?: number
      service_type?: string
      certificate_template?: string
      certificate_subtype?: string
      include_second_signature?: boolean
      default_student_status?: string
    },
  ) {
    if (!body.name) throw new BadRequestException('name is required')
    if (body.amount === undefined) throw new BadRequestException('amount is required')

    const service_type = body.service_type ?? 'SERVICIO'
    if (!this.VALID_SERVICE_TYPES.includes(service_type))
      throw new BadRequestException(`service_type must be one of: ${this.VALID_SERVICE_TYPES.join(', ')}`)
    this.validateCertificateFields(body)

    const isCertificate = service_type === 'CERTIFICADO'

    try {
      return await this.prisma.service_fees.create({
        data: {
          school_id: user.school_id,
          name: body.name,
          amount: body.amount,
          applies_to_grade_level: body.applies_to_grade_level ?? null,
          service_type,
          certificate_template:      isCertificate ? (body.certificate_template      ?? null)  : null,
          certificate_subtype:       isCertificate ? (body.certificate_subtype        ?? null)  : null,
          include_second_signature:  isCertificate ? (body.include_second_signature  ?? false) : false,
          default_student_status:    isCertificate ? (body.default_student_status    ?? null)  : null,
          is_active: true,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A service fee with this name already exists')
      }
      throw error
    }
  }

  @Put(':id')
  @Roles('RECTOR')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      name?: string
      amount?: number
      applies_to_grade_level?: number
      is_active?: boolean
      service_type?: string
      certificate_template?: string
      certificate_subtype?: string
      include_second_signature?: boolean
      default_student_status?: string
    },
  ) {
    const fee = await this.prisma.service_fees.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!fee) throw new NotFoundException('Service fee not found')

    if (body.service_type !== undefined && !this.VALID_SERVICE_TYPES.includes(body.service_type))
      throw new BadRequestException(`service_type must be one of: ${this.VALID_SERVICE_TYPES.join(', ')}`)
    this.validateCertificateFields(body)

    const newType = body.service_type ?? fee.service_type
    const isCertificate = newType === 'CERTIFICADO'

    try {
      return await this.prisma.service_fees.update({
        where: { id },
        data: {
          name: body.name ?? fee.name,
          amount: body.amount ?? fee.amount,
          applies_to_grade_level: body.applies_to_grade_level !== undefined
            ? body.applies_to_grade_level
            : fee.applies_to_grade_level,
          is_active: body.is_active !== undefined ? body.is_active : fee.is_active,
          service_type: newType,
          // Si cambia a SERVICIO, limpia los campos de certificado; si es CERTIFICADO, acepta el valor enviado o conserva el existente
          certificate_template: isCertificate
            ? (body.certificate_template !== undefined ? body.certificate_template : fee.certificate_template)
            : null,
          certificate_subtype: isCertificate
            ? (body.certificate_subtype !== undefined ? body.certificate_subtype : fee.certificate_subtype)
            : null,
          include_second_signature: isCertificate
            ? (body.include_second_signature !== undefined ? body.include_second_signature : fee.include_second_signature)
            : false,
          default_student_status: isCertificate
            ? (body.default_student_status !== undefined ? body.default_student_status : fee.default_student_status)
            : null,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('A service fee with this name already exists')
      }
      throw error
    }
  }

  @Delete(':id')
  @Roles('RECTOR')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const fee = await this.prisma.service_fees.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!fee) throw new NotFoundException('Service fee not found')

    await this.prisma.service_fees.delete({ where: { id } })
    return { success: true }
  }
}
