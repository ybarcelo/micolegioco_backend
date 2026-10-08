import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { Roles } from '../common/decorators/roles.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { slugify } from '../common/utils/slug.util'

const ALLOWED_ROLES = ['RECTOR', 'SECRETARIO', 'DOCENTE']

@Controller('superadmin')
export class SuperadminController {
  constructor(private prisma: PrismaService) {}

  @Get('schools')
  @Roles('SUPERADMIN')
  async listSchools() {
    const schools = await this.prisma.schools.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    })
    return schools.map(s => ({
      id:         s.id,
      name:       s.name,
      nit:        s.nit,
      city:       s.city,
      sector:     s.sector,
      created_at: s.created_at,
      user_count: s._count.users,
    }))
  }

  @Post('schools')
  @Roles('SUPERADMIN')
  async createSchool(
    @Body() body: {
      name:               string
      nit:                string
      address?:           string
      city?:              string
      phone?:             string
      dane_code?:         string
      sector?:            string
      rector_name?:       string
      resolution_number?: string
      calendar?:          string
    },
  ) {
    if (!body.name?.trim()) throw new BadRequestException('name is required')
    if (!body.nit?.trim())  throw new BadRequestException('nit is required')

    const base = slugify(body.name) || 'colegio'
    let slug = base
    let n = 2
    while (await this.prisma.schools.findUnique({ where: { slug } })) {
      slug = `${base}-${n}`
      n++
    }

    try {
      return await this.prisma.schools.create({
        data: {
          name:              body.name.trim(),
          nit:               body.nit.trim(),
          slug,
          address:           body.address?.trim()           ?? null,
          city:              body.city?.trim()               ?? 'Barranquilla',
          phone:             body.phone?.trim()              ?? null,
          dane_code:         body.dane_code?.trim()          ?? null,
          sector:            body.sector?.trim()             ?? 'PRIVADO',
          rector_name:       body.rector_name?.trim()        ?? null,
          resolution_number: body.resolution_number?.trim()  ?? null,
          calendar:          body.calendar?.trim()            ?? null,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe un colegio con ese NIT o código DANE')
      throw e
    }
  }

  @Get('schools/:id/users')
  @Roles('SUPERADMIN')
  async listUsers(@Param('id') id: string) {
    const school = await this.prisma.schools.findUnique({ where: { id } })
    if (!school) throw new NotFoundException('Colegio no encontrado')

    const users = await this.prisma.users.findMany({
      where:   { school_id: id },
      select:  {
        id:         true,
        full_name:  true,
        email:      true,
        created_at: true,
        roles:      { select: { name: true } },
      },
      orderBy: { full_name: 'asc' },
    })

    return users.map(u => ({
      id:         u.id,
      full_name:  u.full_name,
      email:      u.email,
      role:       u.roles?.name ?? null,
      created_at: u.created_at,
    }))
  }

  @Post('schools/:id/users')
  @Roles('SUPERADMIN')
  async createUser(
    @Param('id') schoolId: string,
    @Body() body: {
      first_name: string
      last_name:  string
      email:      string
      password:   string
      role:       string
    },
  ) {
    if (!body.first_name?.trim()) throw new BadRequestException('first_name is required')
    if (!body.last_name?.trim())  throw new BadRequestException('last_name is required')
    if (!body.email?.trim())      throw new BadRequestException('email is required')
    if (!body.password?.trim())   throw new BadRequestException('password is required')
    if (body.password.length < 6) throw new BadRequestException('La contraseña debe tener al menos 6 caracteres')

    const roleName = body.role?.toUpperCase()
    if (!ALLOWED_ROLES.includes(roleName))
      throw new BadRequestException(`role debe ser uno de: ${ALLOWED_ROLES.join(', ')}`)

    const school = await this.prisma.schools.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('Colegio no encontrado')

    const roleRecord = await this.prisma.roles.findUnique({ where: { name: roleName } })
    if (!roleRecord)
      throw new BadRequestException(`Rol ${roleName} no encontrado. Ejecute las migraciones necesarias.`)

    const hash     = await bcrypt.hash(body.password, 10)
    const fullName = `${body.first_name.trim()} ${body.last_name.trim()}`
    const email    = body.email.trim().toLowerCase()

    let newUser
    try {
      newUser = await this.prisma.users.create({
        data: {
          school_id:     schoolId,
          full_name:     fullName,
          email,
          password_hash: hash,
          role_id:       roleRecord.id,
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('unique'))
        throw new ConflictException('Ya existe una cuenta con ese correo electrónico')
      throw e
    }

    return {
      id:        newUser.id,
      full_name: newUser.full_name,
      email:     newUser.email,
      role:      roleName,
    }
  }

  @Delete('schools/:id/users/:userId')
  @Roles('SUPERADMIN')
  async deleteUser(
    @Param('id')     schoolId: string,
    @Param('userId') userId:   string,
  ) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, school_id: schoolId },
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')

    await this.prisma.teachers.updateMany({
      where: { user_id: userId },
      data:  { user_id: null },
    })

    await this.prisma.users.delete({ where: { id: userId } })
    return { success: true }
  }
}
