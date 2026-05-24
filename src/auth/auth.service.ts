import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('Usuario no encontrado')

    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) throw new BadRequestException('La contraseña actual es incorrecta')

    const hash = await bcrypt.hash(newPassword, 10)
    await this.prisma.users.update({ where: { id: userId }, data: { password_hash: hash } })
    return { success: true }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.users.findUnique({
      where: { email },
      include: {
        roles: true,
        schools: true,
      },
    })

    if (!user) {
      this.logger.warn(`Login fallido — email no registrado: ${email}`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      this.logger.warn(`Login fallido — contraseña incorrecta: userId=${user.id}`)
      throw new UnauthorizedException('Invalid credentials')
    }

    const roleName = user.roles?.name ?? null

    // Para el rol DOCENTE, incluir el teacher_id en el token
    let teacher_id: string | null = null
    if (roleName === 'DOCENTE') {
      const teacher = await this.prisma.teachers.findFirst({
        where: { user_id: user.id },
        select: { id: true },
      })
      teacher_id = teacher?.id ?? null
    }

    const payload = {
      sub:        user.id,
      email:      user.email,
      role:       roleName,
      school_id:  user.school_id  ?? null,
      teacher_id: teacher_id,
    }

    const token = this.jwtService.sign(payload, { expiresIn: '8h' })

    this.logger.log(`Login exitoso: userId=${user.id} role=${roleName}`)

    return {
      token,
      user: {
        id:          user.id,
        full_name:   user.full_name,
        email:       user.email,
        role:        roleName,
        school_id:   user.school_id  ?? null,
        school_name: user.schools?.name ?? null,
        teacher_id:  teacher_id,
      },
    }
  }
}
