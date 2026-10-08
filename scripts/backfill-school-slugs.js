// Uso único: genera un slug para cada colegio existente que aún no tenga uno.
// node scripts/backfill-school-slugs.js
const { Client } = require('pg')

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows: schools } = await client.query(
    'SELECT id, name FROM schools WHERE slug IS NULL ORDER BY created_at ASC',
  )

  const { rows: existingRows } = await client.query('SELECT slug FROM schools WHERE slug IS NOT NULL')
  const taken = new Set(existingRows.map(r => r.slug))

  for (const school of schools) {
    const base = slugify(school.name) || 'colegio'
    let slug = base
    let n = 2
    while (taken.has(slug)) {
      slug = `${base}-${n}`
      n++
    }
    taken.add(slug)
    await client.query('UPDATE schools SET slug = $1 WHERE id = $2', [slug, school.id])
    console.log(`${school.name} -> ${slug}`)
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
