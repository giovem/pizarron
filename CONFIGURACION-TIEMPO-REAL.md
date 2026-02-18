# Configuración para tiempo real en Netlify

Para que en **Netlify** aparezca "● En vivo" y varios usuarios vean al instante lo que se pega, hay que configurar **Supabase** y **Netlify** en este orden.

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

## 2. Netlify (netlify.com)

### 2.1 Variables de entorno (usando .env)

1. En la carpeta del proyecto tienes un archivo **`.env.example`**. Cópialo a **`.env`**:
   - En Windows: `copy .env.example .env`
   - Luego abre `.env` y sustituye `SUPABASE_URL` y `SUPABASE_ANON_KEY` por los valores de Supabase (Project Settings → API).

2. O crea **`.env`** a mano con exactamente estas dos líneas (con tus valores, sin comillas):
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_ANON_KEY=eyJhbGci...tu_anon_key_completa...
   ```

3. En **Netlify**: entra en tu sitio → **Site configuration** → **Environment variables** → **Add from .env** (o **Import from .env**). Sube el archivo `.env` o pega su contenido. Netlify creará las dos variables de una vez.

4. Si prefieres no usar archivo: **Add a variable** → añade una a una:
   - Key: `SUPABASE_URL`, Value: tu Project URL.
   - Key: `SUPABASE_ANON_KEY`, Value: tu anon key (JWT larga).

- **Importante:** los nombres deben ser exactamente `SUPABASE_URL` y `SUPABASE_ANON_KEY`. El archivo `.env` no se sube a GitHub (está en `.gitignore`).

### 2.2 Build y deploy
- El build ya está configurado en `netlify.toml` con:
  - **Build command:** `node scripts/inject-env.js`
  - **Publish directory:** `.`
- Haz un **Trigger deploy** → **Deploy site** (o push a GitHub si el sitio está conectado al repo).
- Así Netlify vuelve a ejecutar el build e **inyecta** en el HTML la URL y la anon key desde las variables de entorno.

### 2.3 Comprobar
- Abre la URL de tu sitio en Netlify (ej. `https://tu-sitio.netlify.app`).
- En la barra superior debería aparecer **"● En vivo"**.
- Si no aparece: revisa que las variables de entorno estén bien escritas y que hayas vuelto a desplegar después de añadirlas.

---

## 3. Cómo usarlo entre usuarios

1. Una persona abre la URL de Netlify del pizarrón.
2. Pulsa **Compartir** y copia el enlace (lleva `?session=SES-XXXXXX`).
3. Las demás personas abren **ese mismo enlace** (no solo la URL del sitio).
4. Todos verán "● En vivo" y el mismo número de usuarios; lo que uno pegue lo verán el resto al instante.

---

## Resumen rápido

| Dónde    | Qué configurar |
|----------|-----------------|
| **Supabase** | 1) Ejecutar `supabase-setup.sql` en SQL Editor. 2) Comprobar que `pizarron_cards` está en Replication. 3) Anotar Project URL y anon key en API. |
| **Netlify**  | 1) Añadir variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` con esos valores. 2) Volver a desplegar (Trigger deploy). |

Si "● En vivo" no sale en Netlify, suele ser por: variables de entorno no definidas, nombres distintos a `SUPABASE_URL`/`SUPABASE_ANON_KEY`, o no haber hecho un nuevo deploy después de añadirlas.
