# Backend productivo para Netlify

Esta base ya incluye backend para autenticacion segura, base de datos centralizada y sesiones del lado servidor sobre Netlify Functions.

## Arquitectura implementada
- Frontend: `index.html`, `styles.css`, `app.js`, `enhancements.js`, `backend.js`
- API serverless: `netlify/functions/*.mjs`
- Base de datos: Postgres compatible (`DATABASE_URL`)
- Sesiones: cookie `HttpOnly` + tabla `app_sessions`
- Auditoria: tabla `audit_logs`
- Estado del sistema: tabla `app_snapshots` con JSON centralizado

## Endpoints
- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/login`
- `POST /api/logout`
- `POST /api/state`
- `POST /api/import-local`
- `POST /api/audit-log`

## Que hace esta fase
- El login ya no depende de usuarios embebidos en el navegador cuando el backend esta activo.
- La sesion se valida desde el servidor con cookie segura.
- Los cambios del sistema se sincronizan a Postgres.
- La bitacora pasa a una tabla centralizada.
- Si detecta datos previos en `localStorage`, el administrador puede migrarlos automaticamente al primer ingreso.

## Pasos para dejarlo operativo en Netlify
1. Crea o conecta una base Postgres compatible con Netlify.
2. Ejecuta `db/schema.sql` en esa base.
3. Configura en Netlify la variable `DATABASE_URL`.
4. Opcional: configura `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` y `PG_POOL_MAX`.
5. Instala dependencias con `npm install`.
6. Crea los usuarios iniciales con `npm run seed:users`.
7. Redeploy del sitio.

## Usuarios iniciales
El archivo `seed/users.sample.json` trae una base inicial con:
- `admin` -> Melanie Castro Jones
- `direccion`
- `tesoreria`
- `secretaria`
- `cvega`
- `atorres`
- `pmedina`

Antes del uso real cambia las contrasenas del archivo de semilla.

## Notas de seguridad
- Las contrasenas se guardan con `bcrypt`.
- Las sesiones se guardan con hash SHA-256 del token, no con el token plano.
- El login usa cookies `HttpOnly` y `SameSite=Lax`.
- El redirect de `/api/login` tiene rate limiting en `netlify.toml`.
- Las mutaciones pasan por validacion de origen (`Origin`).

## Site ID de referencia
Netlify reportado por el usuario: `7940614a-4b7f-42e9-afb9-f102b54c8933`
