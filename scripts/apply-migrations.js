// Aplica, en orden, los archivos .sql de prisma/migrations/ que falten contra
// la base de datos en DATABASE_URL. Lleva registro de lo ya aplicado en la
// tabla _schema_migrations, así que correrlo varias veces es seguro.
//
// Uso: DATABASE_URL="postgresql://user:pass@host:port/db" node scripts/apply-migrations.js
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const { rows: appliedRows } = await client.query('SELECT filename FROM _schema_migrations')
  const applied = new Set(appliedRows.map(r => r.filename))

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const pending = files.filter(f => !applied.has(f))

  if (pending.length === 0) {
    console.log('No hay migraciones pendientes.')
    await client.end()
    return
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    process.stdout.write(`Aplicando ${file}... `)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO _schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log('OK')
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('ERROR')
      console.error(err.message)
      await client.end()
      process.exit(1)
    }
  }

  console.log(`${pending.length} migración(es) aplicada(s) correctamente.`)
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
