# Configuración para tiempo real (Cloudflare Pages)

Para que aparezca "● En vivo" y varios usuarios vean al instante lo que se pega, hay que configurar **Supabase** y luego **Cloudflare Pages** en este orden.

---

## 1. Supabase (supabase.com)

### 1.1 Crear proyecto
- Entra en [Supabase](https://supabase.com) e inicia sesión.
- **New project** → elige nombre, contraseña de base de datos y región → **Create**.

### 1.2 Crear la tabla y activar Realtime
- En el menú izquierdo: **SQL Editor**.
- **New query**.
- Copia y pega **todo** el contenido del archivo `supabase-setup.sql` de este repositorio.
- **Run** (o Ctrl+Enter).
- Si sale algo como "already member" o "already exists", está bien; sigue.

### 1.2b Storage para imágenes y vídeos (opcional)
Para que cuando un usuario suba una imagen o un vídeo, **otros usuarios en distintos dispositivos puedan verla y descargarla**, crea el bucket de Storage:
- **SQL Editor** → **New query**.
- Copia y pega todo el contenido de `supabase-storage.sql`.
- **Run**. Así se crea el bucket `pizarron-files` (público, lectura para todos, subida con anon key).

### 1.3 Comprobar que Realtime está activo para la tabla
- Menú izquierdo: **Database** → **Replication** (o **Publications**).
- En la publicación `supabase_realtime` debe aparecer la tabla **`pizarron_cards`**.
- Si no está: en **SQL Editor** ejecuta:
  ```sql
  alter publication supabase_realtime add table public.pizarron_cards;
  ```

### 1.4 Anotar credenciales
- Menú izquierdo: **Project Settings** (icono de engranaje) → **API**.
- Anota:
  - **Project URL** (ej. `https://xxxxx.supabase.co`).
  - **Project API keys** → **anon public** (la clave larga tipo JWT; a veces "Anon key (Legacy)").
- No uses la **service_role**; solo la **anon public**.

---

## 2. Cloudflare Pages (dash.cloudflare.com)

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → elige el repo y la rama (p. ej. `main`).
2. **Build:**
   - Framework preset: **None**
   - Build command: `node scripts/inject-env.js`
   - Build output directory: `.`
3. **Environment variables** (Settings del proyecto Pages):
   - `SUPABASE_URL` = tu Project URL de Supabase
   - `SUPABASE_ANON_KEY` = tu anon key de Supabase
4. **Save** y **Deploy**. La URL será tipo `https://<nombre>.pages.dev`.
5. Comprueba que en la barra aparece **"● En vivo"**. Si no: revisa nombres exactos de las variables y vuelve a desplegar.

Cada **push a la rama conectada** redespliega automáticamente.

---

## 3. Cómo usarlo entre usuarios

1. Una persona abre la URL del pizarrón (Cloudflare Pages).
2. Pulsa **Compartir** y copia el enlace (lleva `?session=SES-XXXXXX`).
3. Las demás personas abren **ese mismo enlace** (no solo la URL del sitio).
4. Todos verán "● En vivo" y el mismo número de usuarios; lo que uno pegue lo verán el resto al instante.

---

## Resumen rápido

| Dónde    | Qué configurar |
|----------|-----------------|
| **Supabase** | 1) Ejecutar `supabase-setup.sql` y `supabase-storage.sql` en SQL Editor. 2) Comprobar que `pizarron_cards` está en Replication. 3) Anotar Project URL y anon key en API. |
| **Cloudflare Pages** | 1) Connect to Git. 2) Build command: `node scripts/inject-env.js`, output: `.` 3) Variables `SUPABASE_URL` y `SUPABASE_ANON_KEY`. 4) Deploy. |

Si "● En vivo" no sale, suele ser por: variables de entorno no definidas, nombres distintos a `SUPABASE_URL`/`SUPABASE_ANON_KEY`, o no haber hecho un nuevo deploy después de añadirlas.
