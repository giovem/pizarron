# Pizarrón Grupo EPEM

Tablero colaborativo por departamentos: General, Soporte, Desarrollo, Procesos, Infraestructura y BI.

## Características

- **Pizarrones por departamento**: barra lateral con iconos para cambiar de espacio.
- **Tarjetas de código y archivos**: pegar (Ctrl+V), arrastrar o usar el botón + para agregar. Cada tarjeta muestra quién la subió.
- **Organizar por usuario**: botón "Organizar" agrupa las tarjetas en columnas por usuario.
- **Deshacer al limpiar**: al limpiar un pizarrón puedes restaurar con "Deshacer" o el botón "Restaurar".
- **Compartir**: un enlace da acceso al pizarrón general y a todos los pizarrones por departamento.
- **Responsive**: solo usa el espacio de la pantalla; diseño adaptable.

## Uso

Abre `pizarron.html` en el navegador. No requiere servidor.

- **Pegar**: Ctrl+V (o Cmd+V) para agregar código o imágenes.
- **Archivos**: arrastrar al tablero o clic en + para elegir archivos.
- **Nombre**: la primera vez que agregues algo se pedirá tu nombre (se guarda en el navegador).

## Despliegue

### Vercel
1. Conecta este repositorio en [Vercel](https://vercel.com).
2. No configures build: es un proyecto estático.
3. La raíz (`/`) sirve el pizarrón gracias a `vercel.json`.

### Netlify
1. Conecta este repositorio en [Netlify](https://app.netlify.com).
2. **Build command**: deja vacío.
3. **Publish directory**: `.` (raíz del repo).
4. La raíz (`/`) sirve el pizarrón gracias a `netlify.toml` (redirect 200 a `/pizarron.html`).

Los datos (sesión, nombre, mascota) se guardan en el navegador (localStorage) por origen; cada despliegue tiene su propia “instancia”.

## Tecnologías

HTML, CSS y JavaScript (sin dependencias).
