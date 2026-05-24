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

@Controller('admin/enrollments/:id/benefits')
export class EnrollmentBenefitsController {
  constructor(private prisma: PrismaService) {}

  private async getEnrollment(id: string, schoolId: string) {
    const enrollment = await this.prisma.enrollments.findFirst({
      where: {
        id,
        sections: { grades: { school_id: schoolId } },
      },
      include: {
        sections: {
          include: { academic_years: true },
        },
      },
    })
    if (!enrollment) throw new NotFoundException('Enrollment not found')
    return enrollment
  }

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async listBenefits(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const enrollment = await this.getEnrollment(id, user.school_id)

    return this.prisma.student_benefits.findMany({
      where: {
        student_id: enrollment.student_id,
        academic_year_id: enrollment.sections?.academic_year_id,
      },
      include: {
        benefit_types: true,
        academic_years: true,
      },
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async createBenefit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const enrollment = await this.getEnrollment(id, user.school_id)

    if (!body.benefit_type_id) throw new BadRequestException('benefit_type_id is required')

    try {
      return await this.prisma.student_benefits.create({
        data: {
          student_id: enrollment.student_id,
          benefit_type_id: body.benefit_type_id,
          academic_year_id: enrollment.sections?.academic_year_id,
          discount_percentage: body.discount_percentage ?? 0,
          fixed_discount_amount: body.fixed_discount_amount ?? 0,
          resolution_number: body.resolution_number ?? null,
          observations: body.observations ?? null,
          is_active: body.is_active !== undefined ? body.is_active : true,
        },
        include: {
          benefit_types: true,
          academic_years: true,
        },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('Unique') || msg.includes('unique')) {
        throw new ConflictException('This benefit type is already assigned for this academic year')
      }
      throw error
    }
  }

  @Put(':sbId')
  @Roles('RECTOR', 'SECRETARIO')
  async updateBenefit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sbId') sbId: string,
    @Body() body: any,
  ) {
    await this.getEnrollment(id, user.school_id)

    const benefit = await this.prisma.student_benefits.findUnique({ where: { id: sbId } })
    if (!benefit) throw new NotFoundException('Benefit not found')

    return this.prisma.student_benefits.update({
      where: { id: sbId },
      data: {
        benefit_type_id: body.benefit_type_id ?? benefit.benefit_type_id,
        discount_percentage: body.discount_percentage !== undefined ? body.discount_percentage : benefit.discount_percentage,
        fixed_discount_amount: body.fixed_discount_amount !== undefined ? body.fixed_discount_amount : benefit.fixed_discount_amount,
        resolution_number: body.resolution_number !== undefined ? body.resolution_number : benefit.resolution_number,
        observations: body.observations !== undefined ? body.observations : benefit.observations,
        is_active: body.is_active !== undefined ? body.is_active : benefit.is_active,
      },
      include: {
        benefit_types: true,
        academic_years: true,
      },
    })
  }

  @Delete(':sbId')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteBenefit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('sbId') sbId: string,
  ) {
    await this.getEnrollment(id, user.school_id)

    const benefit = await this.prisma.student_benefits.findUnique({ where: { id: sbId } })
    if (!benefit) throw new NotFoundException('Benefit not found')

    await this.prisma.student_benefits.delete({ where: { id: sbId } })
    return { success: true }
  }
}
