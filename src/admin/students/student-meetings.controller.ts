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

@Controller('admin/students/:id/meetings')
export class StudentMeetingsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async listMeetings(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const meetings = await this.prisma.parent_meetings.findMany({
      where: { student_id: id, school_id: user.school_id },
      include: {
        guardians: true,
        users: { select: { full_name: true } },
      },
      orderBy: { scheduled_datetime: 'desc' },
    })

    return meetings
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async createMeeting(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    if (!body.meeting_reason) throw new BadRequestException('meeting_reason is required')
    if (!body.scheduled_datetime) throw new BadRequestException('scheduled_datetime is required')

    const meeting = await this.prisma.parent_meetings.create({
      data: {
        school_id: user.school_id,
        student_id: id,
        guardian_id: body.guardian_id ?? null,
        created_by: user.sub,
        meeting_reason: body.meeting_reason,
        scheduled_datetime: new Date(body.scheduled_datetime),
        status: body.status ?? 'SCHEDULED',
        meeting_notes: body.meeting_notes ?? null,
        agreements: body.agreements ?? null,
        guardian_signature: body.guardian_signature ?? null,
        student_signature: body.student_signature ?? null,
        staff_signature: body.staff_signature ?? null,
        location: body.location ?? 'Coordinación',
      },
      include: {
        guardians: true,
        users: { select: { full_name: true } },
      },
    })

    return meeting
  }

  @Put(':mId')
  @Roles('RECTOR', 'SECRETARIO')
  async updateMeeting(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('mId') mId: string,
    @Body() body: any,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const meeting = await this.prisma.parent_meetings.findFirst({
      where: { id: mId, student_id: id, school_id: user.school_id },
    })
    if (!meeting) throw new NotFoundException('Meeting not found')

    const updated = await this.prisma.parent_meetings.update({
      where: { id: mId },
      data: {
        status: body.status !== undefined ? body.status : meeting.status,
        meeting_notes: body.meeting_notes !== undefined ? body.meeting_notes : meeting.meeting_notes,
        agreements: body.agreements !== undefined ? body.agreements : meeting.agreements,
        guardian_signature: body.guardian_signature !== undefined ? body.guardian_signature : meeting.guardian_signature,
        student_signature: body.student_signature !== undefined ? body.student_signature : meeting.student_signature,
        staff_signature: body.staff_signature !== undefined ? body.staff_signature : meeting.staff_signature,
        location: body.location !== undefined ? body.location : meeting.location,
        guardian_id: body.guardian_id !== undefined ? body.guardian_id : meeting.guardian_id,
        scheduled_datetime: body.scheduled_datetime ? new Date(body.scheduled_datetime) : meeting.scheduled_datetime,
        meeting_reason: body.meeting_reason !== undefined ? body.meeting_reason : meeting.meeting_reason,
        updated_at: new Date(),
      },
      include: {
        guardians: true,
        users: { select: { full_name: true } },
      },
    })

    return updated
  }

  @Delete(':mId')
  @Roles('RECTOR', 'SECRETARIO')
  async deleteMeeting(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('mId') mId: string,
  ) {
    const student = await this.prisma.students.findFirst({
      where: { id, school_id: user.school_id },
    })
    if (!student) throw new NotFoundException('Student not found')

    const meeting = await this.prisma.parent_meetings.findFirst({
      where: { id: mId, student_id: id, school_id: user.school_id },
    })
    if (!meeting) throw new NotFoundException('Meeting not found')

    await this.prisma.parent_meetings.delete({ where: { id: mId } })
    return { success: true }
  }
}
