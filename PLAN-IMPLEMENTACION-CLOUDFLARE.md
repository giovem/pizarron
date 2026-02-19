# Plan de implementación y camino a producción (Cloudflare Pages)

Objetivo: dejar el repositorio pulcro y desplegar en Cloudflare Pages con redeploy automático desde GitHub.

---

## Fase 1 — Limpieza del repositorio

Objetivo: solo archivos necesarios; sin texto ni código obsoleto.

### 1.1 Archivos que se mantienen (y por qué)

| Archivo | Uso |
|---------|-----|
| `pizarron.html`, `pizarron.js` | App principal |
| `package.json`, `package-lock.json` | Dependencias y build |
| `scripts/inject-env.js` | Build: inyecta SUPABASE_* (Cloudflare Pages) |
| `scripts/local-server.js` | Servidor local (`npm run local`) |
| `_redirects` | Redirect / → pizarron.html (Cloudflare) |
| `wrangler.toml` | Deploy Workers: assets estáticos, name pizarronepem |
| `.assetsignore` | Excluir del deploy: .git, node_modules, scripts, etc. |
| `config.supabase.example.js` | Plantilla; no subir `config.supabase.js` |
| `supabase-setup.sql`, `supabase-storage.sql` | Supabase: tabla y Storage |
| `README.md` | Uso, despliegue Cloudflare |
| `CONFIGURACION-TIEMPO-REAL.md` | Supabase + Cloudflare Pages paso a paso |
| `SEGURIDAD.md` | Medidas del servidor local |
| `.gitignore` | Excluir node_modules, config.supabase.js, .env, data/ |
| `.env.example` | Plantilla para variables; no subir `.env` (está en .gitignore) |

### 1.2 Archivos que no deben estar en el repo

- `node_modules/` — en .gitignore.
- `config.supabase.js`, `.env`, `data/` — en .gitignore; no subir.

### 1.3 Limpieza de contenido

- **README:** Quitar párrafos duplicados (p. ej. “Los datos… instancia”), unificar referencias a “Tiempo real” y dejar Cloudflare como despliegue principal.
- **CONFIGURACION-TIEMPO-REAL.md:** Cloudflare Pages (variables y build).
- **inject-env.js:** Comentario para Cloudflare Pages.
- **Código:** Revisar que no queden comentarios o bloques de código muerto en `pizarron.js` / `pizarron.html` que hagan referencia a flujos ya eliminados.

---

## Fase 2 — Configuración para Cloudflare Pages

### 2.1 Supabase

- [ ] Crear proyecto en [supabase.com](https://supabase.com).
- [ ] Ejecutar `supabase-setup.sql` en SQL Editor.
- [ ] Ejecutar `supabase-storage.sql` en SQL Editor (imágenes/vídeos).
- [ ] Comprobar en **Database → Replication** que `pizarron_cards` está en la publicación.
- [ ] Anotar **Project URL** y **anon public** en **Project Settings → API**.

### 2.2 Cloudflare Pages

- [ ] [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
- [ ] Conectar el repo (p. ej. `giovem/pizarron`), rama `main`.
- [ ] **Build:**
  - Framework preset: **None**
  - Build command: `node scripts/inject-env.js`
  - Build output directory: `.`
- [ ] **Environment variables** (Settings del proyecto):
  - `SUPABASE_URL` = Project URL de Supabase
  - `SUPABASE_ANON_KEY` = anon key de Supabase
- [ ] **Save** y primer **Deploy**.

### 2.3 Verificación

- [ ] La URL tipo `https://<nombre>.pages.dev` abre el pizarrón.
- [ ] La raíz `/` muestra el pizarrón (gracias a `_redirects`).
- [ ] Aparece **"● En vivo"** en la barra (Supabase conectado).
- [ ] Probar compartir enlace y abrirlo en otra pestaña; comprobar que las tarjetas se sincronizan.

---

## Fase 3 — Producción

### 3.1 Redeploy automático

- [ ] Cada **push a `main`** (o la rama conectada) debe disparar un nuevo build y despliegue en Cloudflare. Comprobar con un cambio mínimo (p. ej. un comentario en README) y push.

### 3.2 Repo listo para producción

- [ ] Sin archivos innecesarios en el repo.
- [ ] README con instrucciones claras: uso local, despliegue Cloudflare.
- [ ] Documentación de tiempo real (CONFIGURACION-TIEMPO-REAL.md) actualizada con Cloudflare.
- [ ] .gitignore correcto; no se suben credenciales ni datos.

### 3.3 URL final

Anotar la URL de producción una vez estable:

- **Producción:** https://pizarronepem.giovemdiaz.workers.dev

---

## Resumen de orden recomendado

1. **Limpieza (Fase 1):** aplicar cambios en README, CONFIGURACION-TIEMPO-REAL, inject-env, .env.example si se añade; commit y push.
2. **Configuración (Fase 2):** Supabase → Cloudflare Pages → variables → primer deploy y pruebas.
3. **Producción (Fase 3):** verificar redeploy en push y dejar anotada la URL.

Así el repositorio queda pulcro y el despliegue en Cloudflare listo para producción.
