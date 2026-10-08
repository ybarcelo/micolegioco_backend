-- Vistas usadas por la app (reportes SIMAT, etc.) que no se modelan en
-- schema.prisma y por lo tanto no las crea `prisma db push`.
-- Aplicar DESPUÉS de `prisma db push` / `node scripts/apply-migrations.js`
-- contra cualquier base de datos nueva (ej. al provisionar en Railway).

CREATE OR REPLACE VIEW view_simat_report AS
SELECT
    s.dane_code AS codigo_dane_colegio,
    st.document_type,
    st.document_number,
    st.last_name || ' ' || st.first_name AS nombre_completo,
    st.birth_date,
    st.gender,
    g.name AS grado_actual,
    sec.name AS grupo
FROM students st
JOIN schools s ON st.school_id = s.id
JOIN enrollments e ON st.id = e.student_id
JOIN sections sec ON e.section_id = sec.id
JOIN grades g ON sec.grade_id = g.id
WHERE st.status = 'ACTIVE';

CREATE OR REPLACE VIEW view_user_details AS
SELECT
    u.id AS user_id,
    u.full_name,
    u.email,
    r.name AS role_name,
    s.name AS school_name,
    u.school_id,
    u.created_at
FROM users u
JOIN roles r ON u.role_id = r.id
JOIN schools s ON u.school_id = s.id;
