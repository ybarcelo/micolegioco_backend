import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from '../common/decorators/current-user.decorator'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-in-env',
      algorithms: ['HS256'],
    })
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException()
    }
    return payload
  }
}
