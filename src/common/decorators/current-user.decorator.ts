import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export interface JwtPayload {
  sub: string
  email: string
  role: string | null
  school_id: string | null
  teacher_id: string | null
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest()
    return request.user
  },
)
