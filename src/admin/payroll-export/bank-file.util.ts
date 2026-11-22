/** Alinea un valor a la izquierda y rellena a la derecha con espacios (o el relleno dado). */
export function padRight(value: string, length: number, fill = ' '): string {
  const v = value.slice(0, length)
  return v + fill.repeat(Math.max(0, length - v.length))
}

/** Alinea un valor a la derecha y rellena a la izquierda con ceros (o el relleno dado). */
export function padLeft(value: string, length: number, fill = '0'): string {
  const v = value.slice(-length)
  return fill.repeat(Math.max(0, length - v.length)) + v
}

/** Valor monetario a entero sin separadores, con N dígitos totales (incluye los 2 decimales finales). */
export function padAmount(pesos: number, totalDigits: number): string {
  const centavos = Math.round(pesos * 100).toString()
  return padLeft(centavos, totalDigits)
}

export function dateAAAAMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** C,N,T,E,L,P — tipos de identificación del Banco de Bogotá, a partir del document_type local (CC/TI/RC/CE/PA). */
export function bogotaIdType(documentType: string): string {
  const map: Record<string, string> = { CC: 'C', TI: 'T', CE: 'E', PA: 'P', RC: 'C' }
  return map[documentType] ?? 'C'
}

/** 1,2,4,5 — tipo documento Bancolombia (1=CC,2=CE,4=TI,5=Pasaporte), a partir del document_type local. */
export function bancolombiaIdType(documentType: string): string {
  const map: Record<string, string> = { CC: '1', CE: '2', TI: '4', PA: '5', RC: '1' }
  return map[documentType] ?? '1'
}
