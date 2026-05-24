-- ── 030: Contenido personalizado del encabezado del boletín ─────────────────

ALTER TABLE grading_scale_config
  ADD COLUMN bulletin_header_html TEXT;
-- NULL = usar HTML generado automáticamente desde los campos del colegio
