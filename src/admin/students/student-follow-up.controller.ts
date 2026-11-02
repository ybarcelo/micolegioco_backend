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
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

const REPORT_TYPES = ['ACADEMIC', 'DISCIPLINARY']
const FAULT_TYPES   = ['LOW', 'MODERATE', 'SEVERE']

@Controller('admin/students/:id/meetings/:meetingId/follow-up')
export class StudentFollowUpController {
  constructor(private prisma: PrismaService) {}

  private async getMeeting(schoolId: string, studentId: string, meetingId: string) {
    const meeting = await this.prisma.parent_meetings.findFirst({
      where: { id: meetingId, student_id: studentId, school_id: schoolId },
    })
    if (!meeting) throw new NotFoundException('Meeting not found')
    return meeting
  }

  private validate(body: { report_type?: string; fault_type?: string }) {
    if (body.report_type !== undefined && !REPORT_TYPES.includes(body.report_type))
      throw new BadRequestException(`report_type must be one of: ${REPORT_TYPES.join(', ')}`)
    if (body.fault_type != null && !FAULT_TYPES.includes(body.fault_type))
      throw new BadRequestException(`fault_type must be one of: ${FAULT_TYPES.join(', ')}`)
  }

  private readonly include = {
    academic_periods: { select: { id: true, name: true, period_number: true } },
    teachers: { select: { id: true, first_name: true, last_name: true } },
  } as const

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async getFollowUp(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
  ) {
    await this.getMeeting(user.school_id, id, meetingId)
    return this.prisma.student_follow_up_records.findUnique({
      where: { meeting_id: meetingId },
      include: this.include,
    })
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async createFollowUp(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() body: any,
  ) {
    const meeting = await this.getMeeting(user.school_id, id, meetingId)
    if (meeting.status !== 'COMPLETED')
      throw new BadRequestException('Solo se puede generar un acta de una citación realizada')

    if (!body.description)   throw new BadRequestException('description is required')
    if (!body.record_date)   throw new BadRequestException('record_date is required')
    if (!body.report_type)   throw new BadRequestException('report_type is required')
    this.validate(body)

    const existing = await this.prisma.student_follow_up_records.findUnique({ where: { meeting_id: meetingId } })
    if (existing) throw new BadRequestException('Esta citación ya tiene un acta generada')

    return this.prisma.student_follow_up_records.create({
      data: {
        school_id:               user.school_id,
        meeting_id:               meetingId,
        student_id:               id,
        description:              body.description,
        record_date:              new Date(body.record_date),
        report_type:              body.report_type,
        fault_type:               body.report_type === 'DISCIPLINARY' ? (body.fault_type ?? null) : null,
        academic_period_id:       body.academic_period_id ?? null,
        pedagogical_actions:      body.pedagogical_actions ?? null,
        agreements:               body.agreements ?? null,
        conduct_manual_articles:  body.conduct_manual_articles ?? null,
        reported_by:              body.reported_by ?? null,
        guardian_signature:       body.guardian_signature ?? null,
        student_signature:        body.student_signature ?? null,
        staff_signature:          body.staff_signature ?? null,
      },
      include: this.include,
    })
  }

  @Put()
  @Roles('RECTOR', 'SECRETARIO')
  async updateFollowUp(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() body: any,
  ) {
    await this.getMeeting(user.school_id, id, meetingId)
    const existing = await this.prisma.student_follow_up_records.findUnique({ where: { meeting_id: meetingId } })
    if (!existing) throw new NotFoundException('Follow-up record not found')
    this.validate(body)

    const reportType = body.report_type !== undefined ? body.report_type : existing.report_type

    return this.prisma.student_follow_up_records.update({
      where: { meeting_id: meetingId },
      data: {
        description:              body.description             !== undefined ? body.description             : existing.description,
        record_date:              body.record_date              ? new Date(body.record_date)                 : existing.record_date,
        report_type:              reportType,
        fault_type:               reportType === 'DISCIPLINARY'
          ? (body.fault_type !== undefined ? body.fault_type : existing.fault_type)
          : null,
        academic_period_id:       body.academic_period_id       !== undefined ? body.academic_period_id       : existing.academic_period_id,
        pedagogical_actions:      body.pedagogical_actions      !== undefined ? body.pedagogical_actions      : existing.pedagogical_actions,
        agreements:               body.agreements               !== undefined ? body.agreements               : existing.agreements,
        conduct_manual_articles:  body.conduct_manual_articles  !== undefined ? body.conduct_manual_articles  : existing.conduct_manual_articles,
        reported_by:              body.reported_by              !== undefined ? body.reported_by              : existing.reported_by,
        guardian_signature:       body.guardian_signature       !== undefined ? body.guardian_signature       : existing.guardian_signature,
        student_signature:        body.student_signature        !== undefined ? body.student_signature        : existing.student_signature,
        staff_signature:          body.staff_signature          !== undefined ? body.staff_signature          : existing.staff_signature,
        updated_at: new Date(),
      },
      include: this.include,
    })
  }

  @Delete()
  @Roles('RECTOR', 'SECRETARIO')
  async deleteFollowUp(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
  ) {
    await this.getMeeting(user.school_id, id, meetingId)
    const existing = await this.prisma.student_follow_up_records.findUnique({ where: { meeting_id: meetingId } })
    if (!existing) throw new NotFoundException('Follow-up record not found')

    await this.prisma.student_follow_up_records.delete({ where: { meeting_id: meetingId } })
    return { success: true }
  }
}
