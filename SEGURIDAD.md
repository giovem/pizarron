# Seguridad: qué tener en cuenta

Resumen de aspectos de seguridad según cómo uses el pizarrón (local, Cloudflare + Supabase) y qué hacer en cada caso.

---

## 1. Acceso a las salas (quién ve qué)

- **No hay usuarios ni contraseñas.** Quien tenga el **enlace de la sala** (`?session=SES-XXXXX&created=...`) puede entrar y ver/editar ese pizarrón.
- **Conclusión:** el enlace es la “clave”. No lo publiques en sitios abiertos si el contenido es sensible. Compártelo solo por canales que consideres de confianza (ej. chat interno, correo a personas concretas).

---

## 2. Servidor local (`npm run local`)

### Red y tráfico
- El servidor usa **HTTP**, no HTTPS. El tráfico en la red local (WiFi/LAN) podría ser leído por alguien con acceso a la misma red.
- **Recomendación:** úsalo solo en redes de confianza (casa, oficina). Para tráfico sensible en red, considerar un proxy con HTTPS delante (avanzado).

### Quién puede conectarse
- Cualquier dispositivo en la **misma red** que conozca la IP y el puerto (ej. `http://192.168.1.10:3001`) puede abrir la app.
- No hay autenticación: no se comprueba usuario ni contraseña.
- **Recomendación:** asumir que “misma red” = mismo nivel de confianza. Si la red es compartida o pública, tratar el pizarrón como contenido no confidencial.

### Subida de archivos
- Límite de tamaño: 50 MB por archivo.
- Extensiones permitidas: imágenes y vídeos (png, jpg, gif, webp, svg, bmp, mp4, webm, ogg, mov).
- Se evita path traversal: no se aceptan `..` ni `/` en el nombre del archivo al servir.
- **Recomendación:** mantener el servidor solo en redes controladas; el disco (carpeta `data/`) puede contener todo lo que se sube.

### Datos en disco
- Tarjetas: `data/local-cards.json`.
- Archivos subidos: `data/uploads/<roomId>/`.
- Cualquier proceso o usuario con acceso al PC donde corre el servidor puede leer estos datos.
- **Recomendación:** no poner el servidor en una máquina compartida con personas no fiables; no subir archivos verdaderamente confidenciales si el equipo no es solo tuyo.

### Medidas activas en el servidor local (uso oficina)
- **Cabeceras de seguridad:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy` en todas las respuestas.
- **Límite de peticiones (rate limit):** 300 peticiones por IP por minuto; 15 subidas de archivo por IP por minuto. Sin librerías externas.
- **Límite de cuerpo:** peticiones JSON máx. 1 MB (evita DoS por cuerpo enorme); subida de archivos con su propio límite (50 MB).
- **Validación de IDs:** `room_id` solo formato `SES-XXXXXX`; `card_id` solo `card-N`. Rechazo de valores que no cumplan.
- **Interfaz de escucha:** variable de entorno `BIND_IP` (ej. `192.168.1.10`) para escuchar solo en esa interfaz y no en todas.

### Resumen servidor local
| Aspecto              | Situación actual                    | Qué tener en cuenta                          |
|----------------------|-------------------------------------|----------------------------------------------|
| Autenticación        | No hay                             | Acceso = quien tenga IP + puerto o enlace   |
| Cifrado (HTTPS)      | No                                 | Solo redes de confianza                     |
| Archivos subidos     | Límite y extensiones controladas   | Contenido en disco en el PC del servidor    |
| Path traversal       | Bloqueado (.. y /)                 | Correcto                                    |
| Rate limiting        | Sí (por IP)                        | Mitiga abuso y picos de tráfico             |
| Cabeceras seguridad | Sí                                 | Mitiga XSS, clickjacking, MIME sniffing      |

---

## 3. Cloudflare + Supabase

### Claves y API
- La **anon key** de Supabase se inyecta en el HTML en el build (Variables and secrets en Cloudflare). Cualquier usuario que abra la web puede verla en el código.
- Con esa anon key, alguien podría llamar a la API de Supabase (tablas, Storage) dentro de los permisos que da la política RLS.

### Políticas RLS (base de datos)
- En `supabase-setup.sql` la política es **“allow all”** con la anon key: cualquier cliente que tenga la key puede leer/insertar/actualizar/borrar filas de `pizarron_cards`.
- **Conclusión:** no hay aislamiento por “usuario” ni por “empresa”; quien tenga la URL del sitio y la anon key tiene acceso a los datos que expone esa key. El “control” es no compartir la URL del sitio (y el enlace de sala) con quien no deba ver ese contenido.

### Storage (imágenes/vídeos)
- Bucket público: lectura pública; escritura con anon key.
- **Conclusión:** cualquier URL de archivo que conozcas puede ser abierta por quien la tenga; no hay lista “privada” de archivos sin autenticación adicional.

### Resumen Cloudflare + Supabase
| Aspecto        | Situación actual        | Qué tener en cuenta                          |
|----------------|-------------------------|----------------------------------------------|
| Anon key       | Visible en el front     | Normal en apps públicas; permisos vía RLS   |
| RLS            | Allow all (lectura/escritura) | No hay restricción por usuario/sala   |
| Storage        | Público lectura         | URLs de archivos = accesibles si se conocen |

---

## 4. Frontend (XSS e inyección)

- Los textos que vienen de usuarios (nombres, nombres de archivo, contenido de tarjetas mostrado como texto) se pasan por la función **`esc()`** antes de meterlos en el HTML (escape de `&`, `<`, `>`).
- El contenido de código se muestra en `<pre>` tras **`highlightCode`**, que primero hace escape del contenido.
- **Recomendación:** al añadir nuevas partes de la UI que muestren datos de usuario o de tarjetas, seguir usando `esc()` (o equivalente) y no confiar en `innerHTML` con cadenas sin sanear.

---

## 5. Checklist rápido según el uso

**Solo uso en oficina/casa (red de confianza):**
- Servidor local: aceptable si asumes que la red y el PC son de confianza.
- No publicar el enlace (ni la IP:puerto) fuera de ese entorno.

**Uso público en Internet (Cloudflare):**
- Asumir que cualquier persona con la URL del sitio (y de la sala) puede ver y editar ese pizarrón.
- No guardar datos sensibles (contraseñas, datos personales, secretos) en tarjetas o archivos subidos.
- Si en el futuro quieres “solo mi equipo”: habría que añadir autenticación (ej. Supabase Auth) y políticas RLS por usuario o por sala.

**Contenido muy sensible:**
- No depender solo del “secreto del enlace”.
- Considerar uso en red aislada, sin salida a Internet, o añadir capa de autenticación y autorización antes de usar el pizarrón para ese tipo de contenido.

---

## 6. Mejoras opcionales (si las necesitas)

- **Servidor local:** opción de proteger con contraseña o token (solo quien la sepa pueda crear/entrar a salas).
- **Supabase:** políticas RLS más estrictas (por ejemplo, solo ciertos `room_id` o usuarios autenticados).
- **HTTPS en local:** poner un proxy reverso (nginx, Caddy) con certificado autofirmado o Let’s Encrypt en una máquina con dominio, si quieres cifrado incluso en LAN.

Si indicas en qué entorno lo usas (solo LAN, Cloudflare público, etc.), se puede concretar más qué aplicar en tu caso.
