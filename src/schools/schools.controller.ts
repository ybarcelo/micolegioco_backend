import { Controller, Get } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator'
import { PrismaService } from '../prisma/prisma.service'

@Controller('schools')
export class SchoolsController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async findAll() {
    return this.prisma.schools.findMany({
      orderBy: { created_at: 'asc' },
    })
  }
}
