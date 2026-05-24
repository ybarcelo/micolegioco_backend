INSERT INTO roles (name, description)
VALUES ('SUPERADMIN', 'Administrador del sistema con acceso total')
ON CONFLICT (name) DO NOTHING;
