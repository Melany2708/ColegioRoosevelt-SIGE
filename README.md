# Sistema de Gestion Educativa

Aplicacion web de gestion educativa para Colegio Privado Roosevelt. La base ahora incluye frontend, backend para Netlify Functions, autenticacion segura, base de datos centralizada y sesiones del lado servidor.

## Incluye en esta version
- Login web con backend real cuando Netlify Functions esta activo.
- Sesiones con cookie `HttpOnly` y validacion del lado servidor.
- Base de datos centralizada en Postgres compatible.
- Sincronizacion del estado del sistema hacia la base central.
- Dashboard, matriculas, alumno, academico, planificacion, personal, horarios, pagos, contabilidad, utiles, actividades, reportes y constancias.
- Exportacion de reportes a Excel en formato `.xls` con tabla estructurada.
- Impresion de documentos y comprobantes desde el navegador.
- Migracion automatica de datos previos desde `localStorage` al primer ingreso del administrador.

## Archivos principales
- Frontend: [index.html](C:/Users/DELL/Documents/Sistema de Gestión Escolar/index.html), [styles.css](C:/Users/DELL/Documents/Sistema de Gestión Escolar/styles.css), [app.js](C:/Users/DELL/Documents/Sistema de Gestión Escolar/app.js), [enhancements.js](C:/Users/DELL/Documents/Sistema de Gestión Escolar/enhancements.js), [backend.js](C:/Users/DELL/Documents/Sistema de Gestión Escolar/backend.js)
- Netlify: [netlify.toml](C:/Users/DELL/Documents/Sistema de Gestión Escolar/netlify.toml)
- API serverless: [netlify/functions](C:/Users/DELL/Documents/Sistema de Gestión Escolar/netlify/functions)
- Esquema SQL: [db/schema.sql](C:/Users/DELL/Documents/Sistema de Gestión Escolar/db/schema.sql)
- Semilla de usuarios: [seed/users.sample.json](C:/Users/DELL/Documents/Sistema de Gestión Escolar/seed/users.sample.json)

## Puesta en marcha
1. Ejecuta [db/schema.sql](C:/Users/DELL/Documents/Sistema de Gestión Escolar/db/schema.sql) en tu base Postgres.
2. Configura `DATABASE_URL` en Netlify.
3. Instala dependencias con `npm install`.
4. Crea usuarios iniciales con `npm run seed:users`.
5. Vuelve a desplegar el sitio.

## Documentacion
- Arquitectura general: [docs/arquitectura.md](C:/Users/DELL/Documents/Sistema de Gestión Escolar/docs/arquitectura.md)
- Publicacion por enlace: [docs/publicacion.md](C:/Users/DELL/Documents/Sistema de Gestión Escolar/docs/publicacion.md)
- Backend productivo: [docs/backend-netlify.md](C:/Users/DELL/Documents/Sistema de Gestión Escolar/docs/backend-netlify.md)
