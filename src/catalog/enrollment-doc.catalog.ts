export interface CatalogDoc {
  key: string
  label: string
}

export const ENROLLMENT_DOC_CATALOG: CatalogDoc[] = [
  { key: 'REGISTRO_CIVIL',    label: 'Registro civil' },
  { key: 'TARJETA_IDENTIDAD', label: 'Tarjeta de identidad' },
  { key: 'DOC_MADRE',         label: 'Documento de identidad de la madre' },
  { key: 'DOC_PADRE',         label: 'Documento de identidad del padre' },
  { key: 'DOC_ACUDIENTE',     label: 'Documento de identidad del acudiente' },
  { key: 'CERT_CONDUCTA',     label: 'Certificado de buena conducta' },
  { key: 'CERT_SISBEN',       label: 'Certificado del Sisben' },
  { key: 'CERT_EPS',          label: 'Certificado de la EPS' },
  { key: 'RETIRO_SIMAT',      label: 'Retiro del SIMAT' },
  { key: 'CERT_NOTAS',        label: 'Certificado de notas de último año' },
]

export const CATALOG_KEYS = new Set(ENROLLMENT_DOC_CATALOG.map(d => d.key))

export function catalogLabel(key: string): string {
  return ENROLLMENT_DOC_CATALOG.find(d => d.key === key)?.label ?? key
}
