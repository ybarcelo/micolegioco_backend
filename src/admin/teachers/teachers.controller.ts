import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@Controller('admin/teachers')
export class TeachersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  findAll(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    const where: any = { school_id: user.school_id }
    if (q) {
      where.OR = [
        { first_name:      { contains: q, mode: 'insensitive' } },
        { last_name:       { contains: q, mode: 'insensitive' } },
        { document_number: { contains: q, mode: 'insensitive' } },
      ]
    }
    return this.prisma.teachers.findMany({
      where,
      include: {
        escalafon_types: true,
        users: { select: { id: true, email: true } },
      },
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    })
  }

  @Get(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const t = await this.prisma.teachers.findFirst({
      where: { id, school_id: user.school_id },
      include: { escalafon_types: true, teacher_contracts: { include: { escalafon_types: true }, orderBy: { start_date: 'desc' } } },
    })
    if (!t) throw new NotFoundException('Docente no encontrado')
    return t
  }

  @Post()
  @Roles('RECTOR', 'SECRETARIO')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      first_name: string; last_name: string
      document_type: string; document_number: string
      address?: string; phone_mobile?: string
      escalafon_type_id?: string; profession?: string
    },
  ) {
    if (!body.first_name)       throw new BadRequestException('first_name is required')
    if (!body.last_name)        throw new BadRequestException('last_name is required')
    if (!body.document_type)    throw new BadRequestException('document_type is required')
    if (!body.document_number)  throw new BadRequestException('document_number is required')

    try {
      return await this.prisma.teachers.create({
        data: {
          school_id:         user.school_id,
          first_name:        body.first_name.trim(),
          last_name:         body.last_name.trim(),
          document_type:     body.document_type,
          document_number:   body.document_number.trim(),
          address:           body.address           ?? null,
          phone_mobile:      body.phone_mobile       ?? null,
          escalafon_type_id: body.escalafon_type_id ?? null,
          profession:        body.profession         ?? null,
        },
        include: { escalafon_types: true },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('uq_teacher') || msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('Ya existe un docente con ese número de documento')
      throw e
    }
  }

  @Put(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const teacher = await this.prisma.teachers.findFirst({ where: { id, school_id: user.school_id } })
    if (!teacher) throw new NotFoundException('Docente no encontrado')

    try {
      return await this.prisma.teachers.update({
        where: { id },
        data: {
          first_name:        body.first_name        ?? teacher.first_name,
          last_name:         body.last_name         ?? teacher.last_name,
          document_type:     body.document_type     ?? teacher.document_type,
          document_number:   body.document_number   ?? teacher.document_number,
          address:           body.address           !== undefined ? body.address        : teacher.address,
          phone_mobile:      body.phone_mobile      !== undefined ? body.phone_mobile   : teacher.phone_mobile,
          escalafon_type_id: body.escalafon_type_id !== undefined ? body.escalafon_type_id : teacher.escalafon_type_id,
          profession:        body.profession        !== undefined ? body.profession     : teacher.profession,
          updated_at:        new Date(),
        },
        include: { escalafon_types: true },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('uq_teacher') || msg.includes('Unique') || msg.includes('unique'))
        throw new ConflictException('Ya existe un docente con ese número de documento')
      throw e
    }
  }

  @Delete(':id')
  @Roles('RECTOR', 'SECRETARIO')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const teacher = await this.prisma.teachers.findFirst({ where: { id, school_id: user.school_id } })
    if (!teacher) throw new NotFoundException('Docente no encontrado')
    await this.prisma.teachers.delete({ where: { id } })
    return { success: true }
  }

  /** Crear cuenta de acceso (usuario DOCENTE) para un docente */
  @Post(':id/access')
  @Roles('RECTOR', 'SECRETARIO')
  async createAccess(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { email: string; password: string },
  ) {
    if (!body.email?.trim())    throw new BadRequestException('email is required')
    if (!body.password?.trim()) throw new BadRequestException('password is required')
    if (body.password.length < 6) throw new BadRequestException('La contraseña debe tener al menos 6 caracteres')

    const teacher = await this.prisma.teachers.findFirst({ where: { id, school_id: user.school_id } })
    if (!teacher) throw new NotFoundException('Docente no encontrado')
    if (teacher.user_id) throw new ConflictException('Este docente ya tiene una cuenta de acceso')

    const docenteRole = await this.prisma.roles.findUnique({ where: { name: 'DOCENTE' } })
    if (!docenteRole) throw new BadRequestException('Rol DOCENTE no encontrado. Ejecute la migración 018.')

    const hash = await bcrypt.hash(body.password, 10)

    return this.prisma.$transaction(async tx => {
      let newUser
      try {
        newUser = await tx.users.create({
          data: {
            school_id:     user.school_id,
            full_name:     `${teacher.first_name} ${teacher.last_name}`,
            email:         body.email.trim().toLowerCase(),
            password_hash: hash,
            role_id:       docenteRole.id,
          },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('unique') || msg.includes('Unique'))
          throw new ConflictException('Ya existe una cuenta con ese correo electrónico')
        throw e
      }

      return tx.teachers.update({
        where: { id },
        data: { user_id: newUser.id },
        include: { users: { select: { id: true, email: true } } },
      })
    })
  }

  /** Revocar acceso de docente */
  @Delete(':id/access')
  @Roles('RECTOR', 'SECRETARIO')
  async revokeAccess(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const teacher = await this.prisma.teachers.findFirst({
      where: { id, school_id: user.school_id },
      select: { id: true, user_id: true },
    })
    if (!teacher) throw new NotFoundException('Docente no encontrado')
    if (!teacher.user_id) throw new BadRequestException('Este docente no tiene cuenta de acceso')

    return this.prisma.$transaction(async tx => {
      await tx.teachers.update({ where: { id }, data: { user_id: null } })
      await tx.users.delete({ where: { id: teacher.user_id! } })
      return { success: true }
    })
  }

  /** Perfil completo de un docente: datos + asignaturas + dirección de grupo */
  @Get(':id/profile')
  @Roles('RECTOR', 'SECRETARIO')
  async getProfile(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const [teacher, gradeSubjects, sections] = await Promise.all([
      this.prisma.teachers.findFirst({
        where: { id, school_id: user.school_id },
        include: {
          escalafon_types: { select: { id: true, name: true } },
          users:           { select: { email: true } },
        },
      }),
      this.prisma.grade_subjects.findMany({
        where: { teacher_id: id, school_id: user.school_id },
        include: {
          subjects:       { select: { id: true, name: true, subject_areas: { select: { id: true, name: true } } } },
          grades:         { select: { id: true, name: true, level: true } },
          academic_years: { select: { id: true, label: true } },
        },
        orderBy: [
          { academic_years: { label: 'desc' } },
          { grades:         { level: 'asc' } },
          { subjects:       { subject_areas: { sort_order: 'asc' } } },
          { subjects:       { name: 'asc' } },
        ],
      }),
      this.prisma.sections.findMany({
        where: { director_id: id },
        include: {
          grades:         { select: { id: true, name: true } },
          academic_years: { select: { id: true, label: true } },
        },
        orderBy: [
          { academic_years: { label: 'desc' } },
          { grades: { level: 'asc' } },
          { name: 'asc' },
        ],
      }),
    ])

    if (!teacher) throw new NotFoundException('Docente no encontrado')

    return {
      id:              teacher.id,
      first_name:      teacher.first_name,
      last_name:       teacher.last_name,
      document_type:   teacher.document_type,
      document_number: teacher.document_number,
      address:         teacher.address,
      phone_mobile:    teacher.phone_mobile,
      profession:      teacher.profession,
      escalafon:       teacher.escalafon_types?.name ?? null,
      email:           teacher.users?.email          ?? null,
      subjects: gradeSubjects.map(g => ({
        subject_id:       g.subject_id,
        subject_name:     g.subjects.name,
        area_id:          g.subjects.subject_areas?.id   ?? null,
        area_name:        g.subjects.subject_areas?.name ?? null,
        grade_id:         g.grade_id,
        grade_name:       g.grades?.name  ?? '',
        grade_level:      g.grades?.level ?? 0,
        academic_year_id: g.academic_year_id,
        year_label:       g.academic_years?.label ?? '',
      })),
      sections: sections.map(s => ({
        id:         s.id,
        name:       s.name,
        grade_name: s.grades?.name        ?? '',
        year_label: s.academic_years?.label ?? '',
      })),
    }
  }

  /** Actualizar contraseña de acceso */
  @Put(':id/access')
  @Roles('RECTOR', 'SECRETARIO')
  async updateAccess(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    if (!body.password?.trim()) throw new BadRequestException('password is required')
    if (body.password.length < 6) throw new BadRequestException('La contraseña debe tener al menos 6 caracteres')

    const teacher = await this.prisma.teachers.findFirst({
      where: { id, school_id: user.school_id },
      select: { user_id: true },
    })
    if (!teacher) throw new NotFoundException('Docente no encontrado')
    if (!teacher.user_id) throw new BadRequestException('Este docente no tiene cuenta de acceso')

    const hash = await bcrypt.hash(body.password, 10)
    await this.prisma.users.update({
      where: { id: teacher.user_id },
      data: { password_hash: hash },
    })
    return { success: true }
  }
}
