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

- **Pegar**: Ctrl+V (o Cmd+V) para agregar código o imágenes.
- **Archivos**: arrastrar al tablero o clic en + para elegir archivos.
- **Nombre**: la primera vez que agregues algo se pedirá tu nombre (se guarda en el navegador).

## Despliegue (Netlify)

1. Conecta el repositorio en [Netlify](https://app.netlify.com).
2. **Build command:** `node scripts/inject-env.js` (ya está en `netlify.toml`).
3. **Variables de entorno:** Site settings → Environment variables → añade `SUPABASE_URL` y `SUPABASE_ANON_KEY` con tus valores de Supabase (Project Settings → API).
4. **Publish directory:** `.` (raíz).
5. La raíz (`/`) sirve el pizarrón gracias al redirect en `netlify.toml`.

Los datos (sesión, nombre, mascota) se guardan en el navegador (localStorage) por origen; cada despliegue tiene su propia “instancia”.

### Tiempo real con Supabase (opcional)

Para que **varios usuarios con el mismo enlace vean al instante lo que se pega** (compartir información en vivo):

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En el SQL Editor ejecuta todo el contenido de `supabase-setup.sql`.
3. **Credenciales de forma segura (variables de entorno):** En el repo no hay credenciales; en el HTML hay placeholders `__SUPABASE_URL__` y `__SUPABASE_ANON_KEY__`. En **Netlify** define las variables de entorno `SUPABASE_URL` y `SUPABASE_ANON_KEY`; el comando de build las inyecta en el HTML al desplegar. Así puedes subir el proyecto a GitHub sin exponer la anon key. En **local** usa `config.supabase.js` (copiado del example y rellenado) o pega temporalmente en el HTML para probar.

Cuando la sincronización esté activa verás **"● En vivo"** en la barra superior y el número de usuarios conectados. Mismo enlace = misma sala = todos ven lo que se pega al instante.

## Tecnologías

HTML, CSS y JavaScript. Opcional: Supabase para tiempo real.
