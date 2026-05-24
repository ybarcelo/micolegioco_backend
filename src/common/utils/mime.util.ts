export function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  return 'application/pdf'
}
