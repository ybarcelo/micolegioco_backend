// Corrige estudiantes que quedaron en status=PROSPECTIVE a pesar de tener una
// matrícula ACTIVE en el año lectivo activo — causado por un bug ya corregido
// en POST /admin/enrollments (la "Nueva matrícula" individual no actualizaba
// students.status, a diferencia de la matrícula múltiple).
//
// Uso: DATABASE_URL="..." node scripts/fix-prospective-enrolled-status.js
const { Client } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  const { rows } = await client.query(`
    SELECT DISTINCT st.id, st.first_name, st.last_name, st.school_id
    FROM students st
    JOIN enrollments e ON e.student_id = st.id AND e.status = 'ACTIVE'
    JOIN sections sec ON sec.id = e.section_id
    JOIN academic_years ay ON ay.id = sec.academic_year_id AND ay.is_active = true
    WHERE st.status = 'PROSPECTIVE'
  `)

  if (rows.length === 0) {
    console.log('No hay estudiantes inconsistentes — nada que corregir.')
    await client.end()
    return
  }

  for (const s of rows) {
    await client.query("UPDATE students SET status = 'ACTIVE', updated_at = now() WHERE id = $1", [s.id])
    console.log(`Corregido: ${s.last_name}, ${s.first_name} (${s.id})`)
  }

  console.log(`${rows.length} estudiante(s) corregido(s).`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
