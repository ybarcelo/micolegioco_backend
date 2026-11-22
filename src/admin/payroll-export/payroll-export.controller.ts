import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common'
import type { Response } from 'express'
import * as XLSX from 'xlsx'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { PayrollCalcService } from '../teachers/payroll-calc.service'
import { padRight, padLeft, padAmount, dateAAAAMMDD, bogotaIdType, bancolombiaIdType } from './bank-file.util'

interface PayrollRow {
  teacher_id:          string
  document_type:       string
  document_number:     string
  full_name:           string
  net_value:           number
  bank_name:           string | null
  bank_code:           string | null
  bank_account_type:   string | null
  bank_account_number: string | null
  missing_bank_info:   boolean
}

@Controller('admin/payroll-export')
@Roles('RECTOR', 'SECRETARIO')
export class PayrollExportController {
  constructor(private prisma: PrismaService, private payrollCalc: PayrollCalcService) {}

  private async getPayrollRows(schoolId: string, year: number, month: number): Promise<PayrollRow[]> {
    const monthStart = new Date(year, month - 1, 1).toISOString().slice(0, 10)
    const monthEnd   = new Date(year, month, 0).toISOString().slice(0, 10)

    const teachers = await this.prisma.teachers.findMany({
      where: {
        school_id: schoolId,
        teacher_contracts: { some: { start_date: { lte: new Date(monthEnd) }, end_date: { gte: new Date(monthStart) } } },
      },
      include: {
        teacher_contracts: {
          where: { start_date: { lte: new Date(monthEnd) }, end_date: { gte: new Date(monthStart) } },
          orderBy: { start_date: 'desc' }, take: 1,
          include: { escalafon_types: true },
        },
        teacher_hour_deductions: { where: { year, month } },
      },
      orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
    })

    const loanDeductions = await this.payrollCalc.getLoanDeductionsForMonth(schoolId, year, month, teachers.map(t => t.id))

    return teachers.map(t => {
      const contract      = t.teacher_contracts[0] ?? null
      const weeklyHours    = contract?.weekly_hours ?? 0
      const hourlyRate     = contract?.escalafon_types.hourly_rate ? Number(contract.escalafon_types.hourly_rate) : null
      const deductedHours  = t.teacher_hour_deductions.reduce((s, d) => s + Number(d.hours), 0)
      const loanDeduction  = loanDeductions.get(t.id) ?? 0
      const payroll        = this.payrollCalc.computeValue(weeklyHours, hourlyRate, deductedHours, loanDeduction)

      return {
        teacher_id:          t.id,
        document_type:       t.document_type,
        document_number:     t.document_number,
        full_name:           [t.first_name, t.second_name, t.last_name, t.second_last_name].filter(Boolean).join(' '),
        net_value:           payroll.net_value,
        bank_name:           t.bank_name,
        bank_code:           t.bank_code,
        bank_account_type:   t.bank_account_type,
        bank_account_number: t.bank_account_number,
        missing_bank_info:   !t.bank_account_number || !t.bank_account_type || !t.bank_code,
      }
    })
  }

  private parseYearMonth(yearStr: string, monthStr: string) {
    const year  = parseInt(yearStr)
    const month = parseInt(monthStr)
    if (!year || !month || month < 1 || month > 12) throw new BadRequestException('year y month (1-12) son obligatorios')
    return { year, month }
  }

  @Get('preview')
  async preview(@CurrentUser() user: JwtPayload, @Query('year') yearStr: string, @Query('month') monthStr: string) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr)
    const rows = await this.getPayrollRows(user.school_id!, year, month)
    const school = await this.prisma.schools.findUnique({
      where: { id: user.school_id },
      select: { payroll_bank: true, payroll_debit_account_number: true, payroll_debit_account_type: true },
    })
    return {
      rows,
      total: rows.filter(r => !r.missing_bank_info).reduce((s, r) => s + r.net_value, 0),
      payroll_bank: school?.payroll_bank ?? null,
      payroll_ready: !!(school?.payroll_bank && school?.payroll_debit_account_number && school?.payroll_debit_account_type),
    }
  }

  @Get('bancolombia')
  async exportBancolombia(
    @CurrentUser() user: JwtPayload,
    @Query('year') yearStr: string, @Query('month') monthStr: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr)
    const [rows, school] = await Promise.all([
      this.getPayrollRows(user.school_id!, year, month),
      this.prisma.schools.findUnique({ where: { id: user.school_id }, select: { nit: true, payroll_debit_account_number: true, payroll_debit_account_type: true } }),
    ])
    if (!school?.payroll_debit_account_number) throw new BadRequestException('Configura la cuenta a debitar del colegio antes de exportar')

    const eligible = rows.filter(r => !r.missing_bank_info && r.net_value > 0)
    const paymentDate = new Date(year, month - 1, 28) // último tramo del mes como fecha de aplicación por defecto

    const encabezado = [
      ['Nit Pagador', 'Tipo de pago', 'Aplicación', 'Secuencia de envío', 'Número de cuenta a debitar', 'Tipo Cuenta para debitar', 'Descripción del Pago'],
      [school.nit, '225', 'I', 'NO', school.payroll_debit_account_number, school.payroll_debit_account_type === 'CORRIENTE' ? 'D' : 'S', 'NOMINA'],
    ]
    const detalleHeader = ['Tipo Documento Beneficiario', 'Documento Beneficiario', 'Nombre Beneficiario', 'Tipo Transacción', 'Código Banco', 'Número Cuenta Beneficiario', 'Email', 'Documento del Autorizado', 'Referencia', 'Celular Beneficiario', 'Valor Transacción', 'Fecha de Aplicación']
    const detalle = eligible.map(r => ([
      bancolombiaIdType(r.document_type),
      r.document_number,
      r.full_name.slice(0, 30),
      r.bank_account_type === 'CORRIENTE' ? '27' : '37',
      r.bank_code ?? '',
      r.bank_account_number,
      '', '', 'NOMINA', '',
      r.net_value,
      dateAAAAMMDD(paymentDate),
    ]))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(encabezado), 'Encabezado')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detalleHeader, ...detalle]), 'Detalle')
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="nomina_bancolombia_${year}_${String(month).padStart(2, '0')}.xlsx"`)
    res.send(buf)
  }

  @Get('banco-bogota')
  async exportBancoBogota(
    @CurrentUser() user: JwtPayload,
    @Query('year') yearStr: string, @Query('month') monthStr: string,
    @Res() res: Response,
  ) {
    const { year, month } = this.parseYearMonth(yearStr, monthStr)
    const [rows, school] = await Promise.all([
      this.getPayrollRows(user.school_id!, year, month),
      this.prisma.schools.findUnique({ where: { id: user.school_id }, select: { nit: true, name: true, payroll_debit_account_number: true, payroll_debit_account_type: true } }),
    ])
    if (!school?.payroll_debit_account_number) throw new BadRequestException('Configura la cuenta a debitar del colegio antes de exportar')

    const eligible = rows.filter(r => !r.missing_bank_info && r.net_value > 0)
    const today = new Date()
    const accountNumber = school.payroll_debit_account_number
    const officeCode = padLeft(accountNumber.slice(0, 3), 3) // primeros 3 dígitos de la cuenta, por especificación
    const accountTypeCode = school.payroll_debit_account_type === 'CORRIENTE' ? '1' : '2'

    // Registro Tipo 1 — una vez por archivo, 250 caracteres exactos
    const tipo1 =
      '1' +                                            // 1
      dateAAAAMMDD(today) +                            // 2-9
      padLeft('', 24, '0') +                            // 10-33 ceros
      accountTypeCode +                                 // 34
      padLeft('', 6, '0') +                              // 35-40 ceros
      padLeft(accountNumber, 11) +                       // 41-51
      padRight(school.name, 40) +                        // 52-91
      padLeft(school.nit.replace(/\D/g, ''), 11) +        // 92-102
      '001' +                                            // 103-105 (nómina)
      padLeft('', 4, '0') +                              // 106-109 ciudad
      dateAAAAMMDD(today) +                              // 110-117
      officeCode +                                        // 118-120
      'N' +                                               // 121 (NIT persona jurídica)
      padRight('', 129)                                   // 122-250

    // Registro Tipo 2 — uno por beneficiario, 250 caracteres exactos
    const tipo2Lines = eligible.map(r => (
      '2' +                                               // 1
      bogotaIdType(r.document_type) +                      // 2
      padLeft(r.document_number.replace(/\D/g, ''), 11) +  // 3-13
      padRight(r.full_name.toUpperCase(), 40) +            // 14-53
      '0' +                                                // 54
      (r.bank_account_type === 'CORRIENTE' ? '1' : '2') +  // 55
      padRight(r.bank_account_number ?? '', 17) +          // 56-72
      padAmount(r.net_value, 18) +                         // 73-90
      'A' +                                                // 91
      padLeft('', 3, '0') +                                // 92-94
      padLeft((r.bank_code ?? '').replace(/\D/g, ''), 3) + // 95-97 código del banco del beneficiario
      padLeft('', 4, '0') +                                // 98-101 ciudad beneficiario
      padRight('', 80) +                                   // 102-181 addenda
      '0' +                                                // 182
      padLeft('', 10, '0') +                                // 183-192 factura
      'N' +                                                // 193 sin notificación
      padRight('', 48) +                                   // 194-241
      'N' +                                                // 242
      padRight('', 8)                                      // 243-250
    ))

    const content = [tipo1, ...tipo2Lines].join('\r\n') + '\r\n'

    res.setHeader('Content-Type', 'text/plain; charset=ascii')
    res.setHeader('Content-Disposition', `attachment; filename="nomina_bancobogota_${year}_${String(month).padStart(2, '0')}.txt"`)
    res.send(Buffer.from(content, 'ascii'))
  }
}
