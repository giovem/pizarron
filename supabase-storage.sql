-- Pizarrón: bucket de Storage para que imágenes y vídeos se puedan descargar en todos los dispositivos
-- Ejecutar en Supabase → SQL Editor (después de supabase-setup.sql)

-- Crear bucket público (lectura pública para que la URL funcione en cualquier dispositivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pizarron-files',
  'pizarron-files',
  true,
  52428800,
  array['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/bmp','video/mp4','video/webm','video/ogg','video/quicktime']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/bmp','video/mp4','video/webm','video/ogg','video/quicktime'];

-- Cualquiera puede leer archivos del bucket (URL pública)
drop policy if exists "Public read pizarron-files" on storage.objects;
create policy "Public read pizarron-files" on storage.objects
  for select using (bucket_id = 'pizarron-files');

-- Cualquiera puede subir (anon key); en producción puedes restringir
drop policy if exists "Anon insert pizarron-files" on storage.objects;
create policy "Anon insert pizarron-files" on storage.objects
  for insert with check (bucket_id = 'pizarron-files');

-- Permitir borrar para que al eliminar tarjeta se pueda borrar el archivo (opcional)
drop policy if exists "Anon delete pizarron-files" on storage.objects;
create policy "Anon delete pizarron-files" on storage.objects
  for delete using (bucket_id = 'pizarron-files');
