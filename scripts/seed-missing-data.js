// Inserta datos semilla que las migraciones 018 y 027 nunca aplicaron en
// bases de datos aprovisionadas vía `prisma db push` (que solo sincroniza
// estructura, no sentencias INSERT). Idempotente: usa ON CONFLICT y solo
// inserta lo que falte.
//
// Uso: DATABASE_URL="postgresql://..." node scripts/seed-missing-data.js
const { Client } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await client.query('BEGIN')

    await client.query(`
      INSERT INTO roles (name, description)
      VALUES ('DOCENTE', 'Docente con acceso a registro académico de su sección asignada')
      ON CONFLICT (name) DO NOTHING
    `)

    const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM diagnosis_categories')
    if (existing[0].n === 0) {
      await client.query(`
        INSERT INTO diagnosis_categories (code, label, sort_order) VALUES
          ('NEURODESARROLLO',     'Trastornos del Neurodesarrollo',                          1),
          ('SENSORIAL_FISICA',    'Discapacidades Sensoriales y Físicas',                   2),
          ('SALUD_MENTAL',        'Condiciones de Salud Mental y Trastornos Emocionales',   3),
          ('TALENTO_EXCEPCIONAL', 'Capacidades o Talentos Excepcionales',                   4),
          ('ENFERMEDAD_CRONICA',  'Enfermedades Crónicas o Sistémicas',                     5)
      `)

      await client.query(`
        INSERT INTO diagnosis_types (category_id, code, label, sort_order)
        SELECT c.id, t.code, t.label, t.sort_order
        FROM diagnosis_categories c,
        (VALUES
          ('TEA',                     'TEA – Trastorno del Espectro Autista',                              1),
          ('TDAH',                    'TDAH – Trastorno por Déficit de Atención e Hiperactividad',         2),
          ('CAPACIDAD_LIMITE',        'Trastornos Límites del Aprendizaje (Capacidad Intelectual Límite)', 3),
          ('DISCAPACIDAD_INTELECTUAL','Discapacidad Intelectual',                                          4),
          ('DISLEXIA',                'Dislexia',                                                          5),
          ('DISGRAFIA',               'Disgrafía',                                                         6),
          ('DISCALCULIA',             'Discalculia',                                                       7),
          ('TRASTORNO_LENGUAJE',      'Trastornos de la Comunicación y del Lenguaje (TEL)',                8)
        ) AS t(code, label, sort_order)
        WHERE c.code = 'NEURODESARROLLO'
      `)

      await client.query(`
        INSERT INTO diagnosis_types (category_id, code, label, sort_order)
        SELECT c.id, t.code, t.label, t.sort_order
        FROM diagnosis_categories c,
        (VALUES
          ('DISCAPACIDAD_AUDITIVA', 'Discapacidad Auditiva (sordera / hipoacusia)',  1),
          ('DISCAPACIDAD_VISUAL',   'Discapacidad Visual (ceguera / baja visión)',   2),
          ('SORDOCEGUERA',          'Sordoceguera',                                  3),
          ('DISCAPACIDAD_MOTORA',   'Discapacidad Física o Motora',                  4)
        ) AS t(code, label, sort_order)
        WHERE c.code = 'SENSORIAL_FISICA'
      `)

      await client.query(`
        INSERT INTO diagnosis_types (category_id, code, label, sort_order)
        SELECT c.id, t.code, t.label, t.sort_order
        FROM diagnosis_categories c,
        (VALUES
          ('DEPRESION',             'Depresión infantil / juvenil',                  1),
          ('BIPOLAR',               'Trastorno Afectivo Bipolar (TAB)',               2),
          ('ANSIEDAD_GENERALIZADA', 'Ansiedad generalizada',                         3),
          ('FOBIA_SOCIAL',          'Fobia social',                                  4),
          ('MUTISMO_SELECTIVO',     'Mutismo selectivo',                             5),
          ('TRASTORNO_PANICO',      'Trastorno de pánico',                           6),
          ('TOC',                   'Trastorno Obsesivo-Compulsivo (TOC)',            7),
          ('TND',                   'Trastorno Negativista Desafiante (TND)',         8),
          ('CONDUCTA_DISOCIAL',     'Trastorno de la conducta disocial',             9)
        ) AS t(code, label, sort_order)
        WHERE c.code = 'SALUD_MENTAL'
      `)

      await client.query(`
        INSERT INTO diagnosis_types (category_id, code, label, sort_order)
        SELECT c.id, t.code, t.label, t.sort_order
        FROM diagnosis_categories c,
        (VALUES
          ('SUPERDOTACION', 'Superdotación Intelectual',                    1),
          ('TALENTO_AREA',  'Talento Excepcional en área específica',       2)
        ) AS t(code, label, sort_order)
        WHERE c.code = 'TALENTO_EXCEPCIONAL'
      `)

      await client.query(`
        INSERT INTO diagnosis_types (category_id, code, label, sort_order)
        SELECT c.id, t.code, t.label, t.sort_order
        FROM diagnosis_categories c,
        (VALUES
          ('EPILEPSIA',       'Epilepsia / Síndromes convulsivos',                         1),
          ('DIABETES_T1',     'Diabetes Tipo 1 (Insulinodependiente)',                     2),
          ('ASMA_ALERGIA',    'Asma grave o alergias alimentarias severas (anafilaxia)',   3),
          ('ENFERMEDAD_RARA', 'Enfermedades raras o huérfanas',                            4)
        ) AS t(code, label, sort_order)
        WHERE c.code = 'ENFERMEDAD_CRONICA'
      `)
      console.log('diagnosis_categories/diagnosis_types seeded')
    } else {
      console.log('diagnosis_categories already has data, skipped')
    }

    await client.query('COMMIT')
    console.log('Done.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('ERROR, rolled back:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
