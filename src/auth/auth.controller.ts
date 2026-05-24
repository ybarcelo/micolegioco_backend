import { Controller, Post, Put, Body, BadRequestException } from '@nestjs/common'
import { AuthService } from './auth.service'
import { Public } from '../common/decorators/public.decorator'
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException('email and password are required')
    }
    return this.authService.login(body.email, body.password)
  }

  @Put('change-password')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { current_password: string; new_password: string },
  ) {
    if (!body.current_password?.trim()) throw new BadRequestException('current_password is required')
    if (!body.new_password?.trim())     throw new BadRequestException('new_password is required')
    if (body.new_password.length < 6)   throw new BadRequestException('La nueva contraseña debe tener al menos 6 caracteres')
    return this.authService.changePassword(user.sub, body.current_password, body.new_password)
  }
}
