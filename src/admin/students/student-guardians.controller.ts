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

@Controller('admin/students/:id/guardians')
export class StudentGuardiansController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async listGuardians(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const links = await this.prisma.student_guardians.findMany({
      where: { student_id: id },
      include: { guardians: true },
    })

    return links
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async addGuardian(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    if (!body.document_number) throw new BadRequestException('document_number is required')
    if (!body.relationship) throw new BadRequestException('relationship is required')

    let guardian = await this.prisma.guardians.findUnique({
      where: {
        school_id_document_number: {
          school_id: user.school_id,
          document_number: body.document_number,
        },
      },
    })

    if (!guardian) {
      const required = ['first_name', 'last_name', 'document_type', 'phone_mobile']
      for (const field of required) {
        if (!body[field]) throw new BadRequestException(`${field} is required when creating a new guardian`)
      }

      try {
        guardian = await this.prisma.guardians.create({
          data: {
            school_id: user.school_id,
            first_name: body.first_name,
            last_name: body.last_name,
            document_type: body.document_type,
            document_number: body.document_number,
            email: body.email ?? null,
            phone_mobile: body.phone_mobile,
            phone_work: body.phone_work ?? null,
            address: body.address ?? null,
            occupation: body.occupation ?? null,
          },
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : ''
        if (msg.includes('Unique') || msg.includes('unique')) {
          throw new ConflictException('Guardian with this document number already exists')
        }
        throw error
      }
    }

    try {
      const link = await this.prisma.student_guardians.create({
        data: {
          student_id: id,
          guardian_id: guardian.id,
          relationship: body.relationship,
          is_emergency_contact: body.is_emergency_contact ?? false,
          is_financial_responsible: body.is_financial_responsible ?? false,
          lives_with_student: body.lives_with_student ?? true,
        },
        include: { guardians: true },
      })
      return link
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('This guardian is already linked to this student')
      }
      throw error
    }
  }

  @Put(':sgId')
  @Roles('RECTOR', 'SECRETARIO')
  async updateGuardian(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sgId') sgId: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const link = await this.prisma.student_guardians.findFirst({
      where: { id: sgId, student_id: id },
      include: { guardians: true },
    })
    if (!link) throw new NotFoundException('Guardian link not found')

    // Update guardian fields if provided
    const guardianUpdateData: any = {}
    if (body.first_name !== undefined) guardianUpdateData.first_name = body.first_name
    if (body.last_name !== undefined) guardianUpdateData.last_name = body.last_name
    if (body.document_type !== undefined) guardianUpdateData.document_type = body.document_type
    if (body.document_number !== undefined) guardianUpdateData.document_number = body.document_number
    if (body.email !== undefined) guardianUpdateData.email = body.email
    if (body.phone_mobile !== undefined) guardianUpdateData.phone_mobile = body.phone_mobile
    if (body.phone_work !== undefined) guardianUpdateData.phone_work = body.phone_work
    if (body.address !== undefined) guardianUpdateData.address = body.address
    if (body.occupation !== undefined) guardianUpdateData.occupation = body.occupation

    // Update link fields
    const linkUpdateData: any = {}
    if (body.relationship !== undefined) linkUpdateData.relationship = body.relationship
    if (body.is_emergency_contact !== undefined) linkUpdateData.is_emergency_contact = body.is_emergency_contact
    if (body.is_financial_responsible !== undefined) linkUpdateData.is_financial_responsible = body.is_financial_responsible
    if (body.lives_with_student !== undefined) linkUpdateData.lives_with_student = body.lives_with_student

    const [updatedGuardian, updatedLink] = await Promise.all([
      Object.keys(guardianUpdateData).length > 0
        ? this.prisma.guardians.update({ where: { id: link.guardian_id }, data: guardianUpdateData })
        : link.guardians,
      Object.keys(linkUpdateData).length > 0
        ? this.prisma.student_guardians.update({ where: { id: sgId }, data: linkUpdateData })
        : link,
    ])

    return { ...updatedLink, guardians: updatedGuardian }
  }

  @Delete(':sgId')
  @Roles('RECTOR', 'SECRETARIO')
  async removeGuardian(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sgId') sgId: string,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const link = await this.prisma.student_guardians.findFirst({
      where: { id: sgId, student_id: id },
    })
    if (!link) throw new NotFoundException('Guardian link not found')

    await this.prisma.student_guardians.delete({ where: { id: sgId } })
    return { success: true }
  }
}
