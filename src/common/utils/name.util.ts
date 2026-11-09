interface NameParts {
  first_name:        string
  second_name?:       string | null
  last_name:         string
  second_last_name?: string | null
}

/** "Apellido1 Apellido2, Nombre1 Nombre2" */
export function listName(p: NameParts): string {
  const apellidos = [p.last_name, p.second_last_name].filter(Boolean).join(' ')
  const nombres    = [p.first_name, p.second_name].filter(Boolean).join(' ')
  return `${apellidos}, ${nombres}`
}

/** "Nombre1 Nombre2 Apellido1 Apellido2" */
export function proseName(p: NameParts): string {
  return [p.first_name, p.second_name, p.last_name, p.second_last_name].filter(Boolean).join(' ')
}
