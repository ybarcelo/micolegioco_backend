import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { Public } from '../common/decorators/public.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { catalogLabel } from '../catalog/enrollment-doc.catalog'

function isEnrollmentOpen(school: { enrollment_opens_at: Date | null; enrollment_closes_at: Date | null }): boolean {
  const today = new Date(new Date().toISOString().slice(0, 10))
  if (school.enrollment_opens_at && today < school.enrollment_opens_at) return false
  if (school.enrollment_closes_at && today > school.enrollment_closes_at) return false
  return true
}

@Public()
@Controller('public')
export class PublicController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  @Get('school')
  async getSchool(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug is required')

    const school = await this.prisma.schools.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        city: true,
        phone: true,
        address: true,
        logo: true,
        privacy_policy_url: true,
        enrollment_opens_at: true,
        enrollment_closes_at: true,
      },
    })

    if (!school) throw new NotFoundException('School not found')

    return school
  }

  @Get('school/grades')
  async getGrades(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug is required')

    const school = await this.prisma.schools.findUnique({ where: { slug } })
    if (!school) throw new NotFoundException('School not found')

    const grades = await this.prisma.grades.findMany({
      where: { school_id: school.id },
      orderBy: { level: 'asc' },
      select: { id: true, name: true },
    })

    return grades
  }

  @Get('school/enrollment-docs')
  async getEnrollmentDocs(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug is required')

    const school = await this.prisma.schools.findUnique({ where: { slug } })
    if (!school) throw new NotFoundException('School not found')

    const configs = await this.prisma.enrollment_doc_configs.findMany({
      where: { school_id: school.id, is_active: true },
      orderBy: { sort_order: 'asc' },
    })

    return configs.map(c => ({
      id: c.id,
      label: c.catalog_key ? catalogLabel(c.catalog_key) : c.custom_name,
      is_required: c.is_required,
    }))
  }

  @Post('pre-registration')
  async preRegister(
    @Body() body: { slug: string; student: any; guardian: any; policy_accepted?: boolean },
  ) {
    const { slug, student, guardian, policy_accepted } = body

    if (!slug) throw new BadRequestException('slug is required')
    if (!student) throw new BadRequestException('student data is required')
    if (!guardian) throw new BadRequestException('guardian data is required')
    if (policy_accepted !== true) {
      throw new BadRequestException('Debe aceptar la política de tratamiento de datos')
    }

    const school = await this.prisma.schools.findUnique({ where: { slug } })
    if (!school) throw new NotFoundException('School not found')

    if (!isEnrollmentOpen(school)) {
      throw new BadRequestException('Las inscripciones no están abiertas en este momento')
    }

    if (!student.aspired_grade_id) {
      throw new BadRequestException('Debe seleccionar el grado al que aspira')
    }

    const aspiredGrade = await this.prisma.grades.findUnique({ where: { id: student.aspired_grade_id } })
    if (!aspiredGrade || aspiredGrade.school_id !== school.id) {
      throw new BadRequestException('El grado seleccionado no es válido')
    }

    const idschool = school.id
    const policyAcceptedAt = new Date()

    const result = await this.prisma.$transaction(async tx => {
      // Find or create student
      let dbStudent = await tx.students.findUnique({
        where: {
          school_id_document_number: {
            school_id: idschool,
            document_number: student.document_number,
          },
        },
      })

      if (!dbStudent) {
        dbStudent = await tx.students.create({
          data: {
            school_id: idschool,
            first_name: student.first_name,
            last_name: student.last_name,
            document_type: student.document_type,
            document_number: student.document_number,
            exp_city: student.exp_city ?? null,
            birth_date: new Date(student.birth_date),
            birth_city: student.birth_city ?? null,
            gender: student.gender ?? null,
            blood_type: student.blood_type ?? null,
            estrato: student.estrato ? Number(student.estrato) : null,
            sisben_score: student.sisben_score ?? null,
            ethnicity: student.ethnicity ?? 'Ninguna',
            status: 'PROSPECTIVE',
            data_policy_accepted_at: policyAcceptedAt,
            aspired_grade_id: student.aspired_grade_id,
          },
        })
      } else {
        dbStudent = await tx.students.update({
          where: { id: dbStudent.id },
          data: { data_policy_accepted_at: policyAcceptedAt, aspired_grade_id: student.aspired_grade_id },
        })
      }

      // Find or create guardian
      let dbGuardian = await tx.guardians.findUnique({
        where: {
          school_id_document_number: {
            school_id: idschool,
            document_number: guardian.document_number,
          },
        },
      })

      if (!dbGuardian) {
        dbGuardian = await tx.guardians.create({
          data: {
            school_id: idschool,
            first_name: guardian.first_name,
            last_name: guardian.last_name,
            document_type: guardian.document_type,
            document_number: guardian.document_number,
            email: guardian.email ?? null,
            phone_mobile: guardian.phone_mobile,
            phone_work: guardian.phone_work ?? null,
            address: guardian.address ?? null,
            occupation: guardian.occupation ?? null,
          },
        })
      }

      // Upsert student_guardian link
      await tx.student_guardians.upsert({
        where: {
          student_id_guardian_id: {
            student_id: dbStudent.id,
            guardian_id: dbGuardian.id,
          },
        },
        update: {
          relationship: guardian.relationship ?? 'ACUDIENTE',
          is_emergency_contact: guardian.is_emergency_contact ?? false,
          is_financial_responsible: guardian.is_financial_responsible ?? false,
          lives_with_student: guardian.lives_with_student ?? true,
        },
        create: {
          student_id: dbStudent.id,
          guardian_id: dbGuardian.id,
          relationship: guardian.relationship ?? 'ACUDIENTE',
          is_emergency_contact: guardian.is_emergency_contact ?? false,
          is_financial_responsible: guardian.is_financial_responsible ?? false,
          lives_with_student: guardian.lives_with_student ?? true,
        },
      })

      return dbStudent
    })

    return { success: true, student_id: result.id }
  }

  @Post('enrollment-docs/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png']
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only PDF, JPEG, and PNG files are allowed'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  async uploadEnrollmentDoc(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { student_id: string; doc_config_id: string; slug: string },
  ) {
    if (!file) throw new BadRequestException('file is required')

    const { student_id, doc_config_id, slug } = body
    if (!student_id || !doc_config_id || !slug) {
      throw new BadRequestException('student_id, doc_config_id, and slug are required')
    }

    const school = await this.prisma.schools.findUnique({ where: { slug } })
    if (!school) throw new NotFoundException('School not found')

    const idschool = school.id

    const student = await this.prisma.students.findUnique({ where: { id: student_id } })
    if (!student) throw new NotFoundException('Student not found')
    if (student.school_id !== idschool) throw new ForbiddenException('Student does not belong to this school')

    const docConfig = await this.prisma.enrollment_doc_configs.findUnique({ where: { id: doc_config_id } })
    if (!docConfig) throw new NotFoundException('Document config not found')
    if (docConfig.school_id !== idschool) throw new ForbiddenException('Document config does not belong to this school')

    const storedPath = await this.storage.save(idschool, file.originalname, file.buffer)

    const upload = await this.prisma.enrollment_uploads.create({
      data: {
        school_id: idschool,
        student_id,
        doc_config_id,
        original_filename: file.originalname,
        stored_path: storedPath,
        file_size: file.size,
      },
    })

    return {
      success: true,
      upload: {
        id: upload.id,
        original_filename: upload.original_filename,
        file_size: upload.file_size,
      },
    }
  }
}
