// Siembra los roles base del sistema y, opcionalmente, el primer usuario
// SUPERADMIN. Necesario después de `prisma db push` contra una base de datos
// nueva (ej. Railway), ya que db push solo sincroniza el esquema, no datos.
//
// Uso:
//   DATABASE_URL="..." node scripts/seed-initial-data.js
//
// Para crear también el primer SUPERADMIN, agrega:
//   SUPERADMIN_EMAIL="rector@micolegio.co" SUPERADMIN_PASSWORD="..." SUPERADMIN_NAME="Nombre"
const { Client } = require('pg')
const bcrypt = require('bcryptjs')

const ROLES = [
  { name: 'ADMIN',      description: 'Superusuario del sistema' },
  { name: 'RECTOR',     description: 'Visualización de reportes y toma de decisiones' },
  { name: 'TESORERO',   description: 'Gestión de cobros, pensiones y gastos' },
  { name: 'SECRETARIO', description: 'Gestión de matrículas y datos de estudiantes' },
  { name: 'SUPERADMIN', description: 'Administrador del sistema con acceso total' },
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  for (const role of ROLES) {
    await client.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      [role.name, role.description],
    )
  }
  console.log(`Roles sembrados: ${ROLES.map(r => r.name).join(', ')}`)

  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD
  const fullName = process.env.SUPERADMIN_NAME || 'Superadmin'

  if (email && password) {
    const { rows: existing } = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.length > 0) {
      console.log(`Ya existe un usuario con el correo ${email}, no se creó uno nuevo.`)
    } else {
      const { rows: roleRows } = await client.query("SELECT id FROM roles WHERE name = 'SUPERADMIN'")
      const passwordHash = await bcrypt.hash(password, 10)
      await client.query(
        'INSERT INTO users (full_name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)',
        [fullName, email, passwordHash, roleRows[0].id],
      )
      console.log(`Usuario SUPERADMIN creado: ${email}`)
    }
  } else {
    console.log('SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD no definidos — no se creó ningún usuario.')
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
