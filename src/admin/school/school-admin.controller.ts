import {
  Controller,
  Get,
  Put,
  Body,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { SLUG_PATTERN } from '../../common/utils/slug.util'
import {
  ENROLLMENT_DOC_CATALOG,
  CATALOG_KEYS,
  catalogLabel,
} from '../../catalog/enrollment-doc.catalog'

@Controller('admin/school')
export class SchoolAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles('RECTOR', 'SECRETARIO')
  async getSchool(@CurrentUser() user: JwtPayload) {
    const school = await this.prisma.schools.findUnique({
      where: { id: user.school_id },
      select: {
        id: true,
        name: true,
        nit: true,
        address: true,
        city: true,
        phone: true,
        dane_code: true,
        logo: true,
        sector: true,
        rector_name: true,
        rector_signature: true,
        resolution_number: true,
        calendar: true,
        slug: true,
        privacy_policy_url: true,
        enrollment_opens_at: true,
        enrollment_closes_at: true,
      },
    })

    if (!school) throw new NotFoundException('School not found')
    return school
  }

  @Put()
  @Roles('RECTOR')
  async updateSchool(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; address?: string; city?: string; phone?: string; logo?: string; rector_name?: string; rector_signature?: string; resolution_number?: string; calendar?: string; slug?: string; privacy_policy_url?: string; enrollment_opens_at?: string; enrollment_closes_at?: string },
  ) {
    const school = await this.prisma.schools.findUnique({ where: { id: user.school_id } })
    if (!school) throw new NotFoundException('School not found')

    if (body.slug !== undefined) {
      const slug = body.slug.trim().toLowerCase()
      if (!SLUG_PATTERN.test(slug) || slug.length < 3) {
        throw new BadRequestException('El enlace debe tener solo minúsculas, números y guiones, mínimo 3 caracteres')
      }
      body.slug = slug
    }

    let privacyPolicyUrl: string | null | undefined = undefined
    if (body.privacy_policy_url !== undefined) {
      const url = (body.privacy_policy_url ?? '').trim()
      if (url) {
        try {
          const parsed = new URL(url)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
        } catch {
          throw new BadRequestException('La URL de la política de tratamiento de datos no es válida')
        }
      }
      privacyPolicyUrl = url || null
    }

    let enrollmentOpensAt: Date | null | undefined = undefined
    if (body.enrollment_opens_at !== undefined) {
      enrollmentOpensAt = body.enrollment_opens_at ? new Date(body.enrollment_opens_at) : null
      if (enrollmentOpensAt && isNaN(enrollmentOpensAt.getTime())) {
        throw new BadRequestException('Fecha de apertura de inscripciones inválida')
      }
    }

    let enrollmentClosesAt: Date | null | undefined = undefined
    if (body.enrollment_closes_at !== undefined) {
      enrollmentClosesAt = body.enrollment_closes_at ? new Date(body.enrollment_closes_at) : null
      if (enrollmentClosesAt && isNaN(enrollmentClosesAt.getTime())) {
        throw new BadRequestException('Fecha de cierre de inscripciones inválida')
      }
    }

    const finalOpensAt  = enrollmentOpensAt  !== undefined ? enrollmentOpensAt  : school.enrollment_opens_at
    const finalClosesAt = enrollmentClosesAt !== undefined ? enrollmentClosesAt : school.enrollment_closes_at
    if (finalOpensAt && finalClosesAt && finalClosesAt < finalOpensAt) {
      throw new BadRequestException('La fecha de cierre debe ser posterior a la fecha de apertura')
    }

    try {
      const updated = await this.prisma.schools.update({
        where: { id: user.school_id },
        data: {
          name:             body.name             ?? school.name,
          address:          body.address          !== undefined ? body.address          : school.address,
          city:             body.city             !== undefined ? body.city             : school.city,
          phone:            body.phone            !== undefined ? body.phone            : school.phone,
          logo:             body.logo             !== undefined ? body.logo             : school.logo,
          rector_name:       body.rector_name       !== undefined ? body.rector_name       : school.rector_name,
          rector_signature:  body.rector_signature  !== undefined ? body.rector_signature  : school.rector_signature,
          resolution_number: body.resolution_number !== undefined ? body.resolution_number : school.resolution_number,
          calendar:          body.calendar          !== undefined ? (body.calendar || null) : school.calendar,
          slug:              body.slug             !== undefined ? body.slug             : school.slug,
          privacy_policy_url: privacyPolicyUrl       !== undefined ? privacyPolicyUrl       : school.privacy_policy_url,
          enrollment_opens_at:  finalOpensAt,
          enrollment_closes_at: finalClosesAt,
        },
        select: {
          id: true,
          name: true,
          nit: true,
          address: true,
          city: true,
          phone: true,
          dane_code: true,
          logo: true,
          rector_name: true,
          rector_signature: true,
          resolution_number: true,
          calendar: true,
          slug: true,
          privacy_policy_url: true,
          enrollment_opens_at: true,
          enrollment_closes_at: true,
        },
      })

      return updated
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.toLowerCase().includes('unique')) {
        throw new ConflictException('Ese enlace ya está en uso por otro colegio')
      }
      throw e
    }
  }

  @Get('enrollment-docs')
  @Roles('RECTOR', 'SECRETARIO')
  async getEnrollmentDocs(@CurrentUser() user: JwtPayload) {
    const configured = await this.prisma.enrollment_doc_configs.findMany({
      where: { school_id: user.school_id },
      orderBy: { sort_order: 'asc' },
    })

    return {
      catalog: ENROLLMENT_DOC_CATALOG,
      configured: configured.map(c => ({
        id: c.id,
        catalog_key: c.catalog_key,
        custom_name: c.custom_name,
        label: c.catalog_key ? catalogLabel(c.catalog_key) : c.custom_name,
        is_required: c.is_required,
        sort_order: c.sort_order,
        is_active: c.is_active,
      })),
    }
  }

  @Put('enrollment-docs')
  @Roles('RECTOR')
  async updateEnrollmentDocs(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      docs: Array<{
        catalog_key?: string
        custom_name?: string
        is_required: boolean
        sort_order: number
      }>
    },
  ) {
    if (!body.docs || !Array.isArray(body.docs)) {
      throw new BadRequestException('docs array is required')
    }

    for (const doc of body.docs) {
      const hasCatalogKey = !!doc.catalog_key
      const hasCustomName = !!doc.custom_name

      if (hasCatalogKey && hasCustomName) {
        throw new BadRequestException('Each doc must have either catalog_key OR custom_name, not both')
      }
      if (!hasCatalogKey && !hasCustomName) {
        throw new BadRequestException('Each doc must have either catalog_key OR custom_name')
      }
      if (hasCatalogKey && !CATALOG_KEYS.has(doc.catalog_key)) {
        throw new BadRequestException(`Invalid catalog_key: ${doc.catalog_key}`)
      }
    }

    const configured = await this.prisma.$transaction(async tx => {
      await tx.enrollment_doc_configs.deleteMany({
        where: { school_id: user.school_id },
      })

      const created = await tx.enrollment_doc_configs.createManyAndReturn({
        data: body.docs.map(doc => ({
          school_id: user.school_id,
          catalog_key: doc.catalog_key ?? null,
          custom_name: doc.custom_name ?? null,
          is_required: doc.is_required,
          sort_order: doc.sort_order,
          is_active: true,
        })),
      })

      return created
    })

    return {
      configured: configured.map(c => ({
        id: c.id,
        catalog_key: c.catalog_key,
        custom_name: c.custom_name,
        label: c.catalog_key ? catalogLabel(c.catalog_key) : c.custom_name,
        is_required: c.is_required,
        sort_order: c.sort_order,
        is_active: c.is_active,
      })),
    }
  }
}
