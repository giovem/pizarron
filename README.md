# Pizarrón Grupo EPEM

Tablero colaborativo por departamentos: General, Soporte, Desarrollo, Procesos, Infraestructura y BI.

## Características

- **Pizarrones por departamento**: barra lateral con iconos para cambiar de espacio.
- **Tarjetas de código y archivos**: pegar (Ctrl+V), arrastrar o usar el botón + para agregar. Cada tarjeta muestra quién la subió.
- **Organizar por usuario**: botón "Organizar" agrupa las tarjetas en columnas por usuario.
- **Deshacer al limpiar**: al limpiar un pizarrón puedes restaurar con "Deshacer" o el botón "Restaurar".
- **Compartir**: un enlace da acceso al pizarrón general y a todos los pizarrones por departamento.
- **Tiempo real (opcional)** con Supabase: ver usuarios conectados y que todos vean las mismas tarjetas al instante.
- **Responsive**: solo usa el espacio de la pantalla; diseño adaptable.

## Uso

Abre `pizarron.html` en el navegador. No requiere servidor.

### Modo 100% local (gratis, sin límites de hosting)

Para usar el pizarrón en tu red local **sin Supabase ni Netlify** (todo gratis y sin salir de tu red):

1. Instala dependencias (solo la primera vez): `npm install`
2. Arranca el servidor local: `npm run local`
3. Abre en el navegador: **http://localhost:3000**
4. Pulsa **Compartir** y copia el enlace. En otros PCs (o pestañas) de la misma red abre **ese mismo enlace** (o desde otro PC usa **http://TU_IP:3000/?session=SES-XXXXX&created=...**).

El servidor guarda las tarjetas en memoria y en `data/local-cards.json` (se crea solo). Todos los que abran la misma sala verán y editarán lo mismo en tiempo real. Imágenes y vídeos se guardan en `data/uploads/` y todos pueden descargarlos.

**Oficina / seguridad (sin coste extra):** el servidor incluye límite de peticiones por IP, cabeceras de seguridad (XSS, clickjacking), validación de IDs y límite de tamaño de cuerpo. Opcional: `BIND_IP=192.168.1.10` para escuchar solo en esa interfaz; `PORT=3001` para otro puerto. Detalle en **SEGURIDAD.md**.

- **Pegar**: Ctrl+V (o Cmd+V) para agregar código o imágenes.
- **Archivos**: arrastrar al tablero o clic en + para elegir archivos.
- **Nombre**: la primera vez que agregues algo se pedirá tu nombre (se guarda en el navegador).

### Tiempo real en local (entre varios navegadores)

Para probar el tiempo real sin depender de Netlify:

1. **Configura Supabase** (si aún no): crea proyecto en [Supabase](https://supabase.com), ejecuta `supabase-setup.sql`.
2. **Credenciales en local:** copia `config.supabase.example.js` → `config.supabase.js` y rellena `url` y `anonKey` (Project Settings → API).
3. **Sirve la carpeta por HTTP** (no abras el HTML como archivo; hace falta un servidor para cargar `config.supabase.js`):
   - `npm start` (o `npx serve .`) y abre **http://localhost:3000**
   - O con Python: `python -m http.server 8080` y abre **http://localhost:8080**
4. En esa pestaña pulsa **Compartir** y copia el enlace.
5. Abre **el mismo enlace** en otra pestaña o en otro navegador (o en otro PC de la red usando tu IP, ej. http://192.168.1.10:3000/?session=SES-XXX).
6. Deberías ver **"● En vivo"** en la barra. Lo que uno pegue lo verá el otro al instante.

## Despliegue (Netlify)

1. Conecta el repositorio en [Netlify](https://app.netlify.com).
2. **Build command:** `node scripts/inject-env.js` (ya está en `netlify.toml`).
3. **Publish directory:** `.` (raíz).
4. La raíz (`/`) sirve el pizarrón gracias al redirect en `netlify.toml`.

**Tiempo real:** Guía completa en **[CONFIGURACION-TIEMPO-REAL.md](CONFIGURACION-TIEMPO-REAL.md)** (Supabase + variables en Netlify).

Los datos (sesión, nombre, mascota) se guardan en el navegador (localStorage) por origen; cada despliegue tiene su propia “instancia”.

### Tiempo real (Supabase + Netlify)

- **Netlify:** Site configuration → Environment variables → `SUPABASE_URL` y `SUPABASE_ANON_KEY` → Trigger deploy.
- **Supabase:** Ejecutar `supabase-setup.sql`; comprobar tabla en Replication; usar anon key en Netlify.

Guía paso a paso: [CONFIGURACION-TIEMPO-REAL.md](CONFIGURACION-TIEMPO-REAL.md).

## Tecnologías

HTML, CSS y JavaScript. Opcional: Supabase para tiempo real.

## Archivos del repositorio (lo que se sube a GitHub)

| Archivo | Uso |
|---------|-----|
| `pizarron.html`, `pizarron.js` | App principal |
| `package.json`, `package-lock.json` | Dependencias (npm install) |
| `netlify.toml` | Configuración Netlify |
| `scripts/inject-env.js` | Build Netlify (inyecta variables) |
| `scripts/local-server.js` | Servidor local (`npm run local`) |
| `config.supabase.example.js` | Plantilla para Supabase (copiar a config.supabase.js) |
| `supabase-setup.sql`, `supabase-storage.sql` | Scripts para Supabase |
| `README.md`, `CONFIGURACION-TIEMPO-REAL.md`, `SEGURIDAD.md` | Documentación |
| `.gitignore` | Excluye del repo lo que no debe subirse |

**No se suben** (están en .gitignore): `node_modules/`, `config.supabase.js`, `.env`, `data/`.
